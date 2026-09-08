-- Capability-link invitations for Tonight friend bundles. The browser receives
-- a 256-bit raw token once; this ledger stores only its SHA-256 hash.

BEGIN;

CREATE TABLE public.tonight_friend_invites (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.tonight_rounds(id) ON DELETE RESTRICT,
  bundle_id UUID NOT NULL REFERENCES public.tonight_friend_bundles(id) ON DELETE RESTRICT,
  inviter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  invited_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  claimed_by_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  create_idempotency_key TEXT NOT NULL UNIQUE,
  accept_idempotency_key TEXT UNIQUE,
  decline_idempotency_key TEXT UNIQUE,
  cancel_idempotency_key TEXT UNIQUE,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tonight_friend_invites_round_bundle_fk
    FOREIGN KEY (round_id, bundle_id)
    REFERENCES public.tonight_friend_bundles(round_id, id) ON DELETE RESTRICT,
  CONSTRAINT tonight_friend_invites_no_self_target CHECK (
    invited_user_id IS NULL OR invited_user_id <> inviter_user_id
  ),
  CONSTRAINT tonight_friend_invites_claim_consistency CHECK (
    claimed_by_user_id IS NULL OR claimed_by_user_id <> inviter_user_id
  ),
  CONSTRAINT tonight_friend_invites_terminal_state CHECK (
    (status = 'accepted' AND accepted_at IS NOT NULL AND claimed_by_user_id IS NOT NULL
      AND declined_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'declined' AND declined_at IS NOT NULL AND claimed_by_user_id IS NOT NULL
      AND accepted_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL
      AND accepted_at IS NULL AND declined_at IS NULL)
    OR (status IN ('pending', 'expired') AND accepted_at IS NULL
      AND declined_at IS NULL AND cancelled_at IS NULL)
  )
);

CREATE INDEX tonight_friend_invites_bundle_pending_idx
  ON public.tonight_friend_invites (bundle_id, expires_at)
  WHERE status = 'pending';
CREATE INDEX tonight_friend_invites_owner_round_idx
  ON public.tonight_friend_invites (inviter_user_id, round_id, created_at DESC);
CREATE INDEX tonight_friend_invites_target_idx
  ON public.tonight_friend_invites (invited_user_id, status)
  WHERE invited_user_id IS NOT NULL;

ALTER TABLE public.tonight_friend_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tonight_friend_invites
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tonight_friend_invites TO service_role;

CREATE OR REPLACE FUNCTION quantum_private.assert_tonight_invite_user_role()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_access_role TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT context.access_role
  INTO v_access_role
  FROM public.get_access_context() AS context;
  IF v_access_role <> 'user' THEN
    RAISE EXCEPTION 'tonight_invite_user_access_role_required';
  END IF;

  RETURN v_caller;
END;
$$;

CREATE OR REPLACE FUNCTION quantum_private.tonight_invite_pair_is_blocked(
  p_first_user_id UUID,
  p_second_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships AS friendship
    WHERE friendship.status = 'blocked'
      AND (
        (friendship.user_id = p_first_user_id AND friendship.friend_user_id = p_second_user_id)
        OR (friendship.user_id = p_second_user_id AND friendship.friend_user_id = p_first_user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.create_tonight_friend_invite(
  p_round_id UUID,
  p_invited_user_id UUID,
  p_token_hash TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := quantum_private.assert_tonight_invite_user_role();
  v_round public.tonight_rounds%ROWTYPE;
  v_bundle public.tonight_friend_bundles%ROWTYPE;
  v_existing public.tonight_friend_invites%ROWTYPE;
  v_invite public.tonight_friend_invites%ROWTYPE;
  v_member_count INTEGER;
  v_pending_count INTEGER;
  v_expires_at TIMESTAMPTZ;
  v_applications_open JSONB;
  v_membership_id UUID;
BEGIN
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_friend_invite_token_hash';
  END IF;
  IF p_invited_user_id = v_caller THEN
    RAISE EXCEPTION 'friend_invite_self';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tonight-friend-invite-create:' || p_idempotency_key, 0)
  );

  SELECT invite.*
  INTO v_existing
  FROM public.tonight_friend_invites AS invite
  WHERE invite.create_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.inviter_user_id <> v_caller
      OR v_existing.round_id <> p_round_id
      OR v_existing.invited_user_id IS DISTINCT FROM p_invited_user_id THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'expires_at', v_existing.expires_at,
      'created', FALSE
    );
  END IF;

  SELECT round_row.*
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;
  SELECT config.value
  INTO v_applications_open
  FROM public.app_config AS config
  WHERE config.key = 'tonight_applications_open'
  FOR SHARE;
  IF v_applications_open IS NULL
    OR v_applications_open <> pg_catalog.to_jsonb(TRUE) THEN
    RAISE EXCEPTION 'tonight_applications_closed';
  END IF;
  IF v_round.market_code <> 'PNU' THEN
    RAISE EXCEPTION 'tonight_market_membership_required';
  END IF;
  SELECT membership.id
  INTO v_membership_id
  FROM public.tonight_market_memberships AS membership
  WHERE membership.market_code = v_round.market_code
    AND membership.user_id = v_caller
    AND membership.revoked_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_market_membership_required';
  END IF;
  IF v_round.status <> 'open'
    OR CURRENT_TIMESTAMP < v_round.signup_open_at
    OR CURRENT_TIMESTAMP >= v_round.signup_close_at THEN
    RAISE EXCEPTION 'tonight_applications_closed';
  END IF;
  v_expires_at := v_round.signup_close_at;

  SELECT bundle.*
  INTO v_bundle
  FROM public.tonight_applications AS application_row
  JOIN public.tonight_friend_bundles AS bundle
    ON bundle.id = application_row.bundle_id
    AND bundle.round_id = application_row.round_id
  WHERE application_row.round_id = p_round_id
    AND application_row.user_id = v_caller
    AND application_row.status IN ('submitted', 'waitlisted')
    AND bundle.created_by = v_caller
  FOR SHARE OF application_row
  FOR UPDATE OF bundle;
  IF NOT FOUND OR v_bundle.status <> 'forming' THEN
    RAISE EXCEPTION 'friend_bundle_owner_unavailable';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tonight-friend-invites:' || v_bundle.id::TEXT, 0)
  );

  IF p_invited_user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.users AS user_row WHERE user_row.id = p_invited_user_id) THEN
      RAISE EXCEPTION 'friend_invite_target_not_found';
    END IF;
    IF quantum_private.tonight_invite_pair_is_blocked(v_caller, p_invited_user_id) THEN
      RAISE EXCEPTION 'friend_invite_blocked';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.tonight_friend_invites AS invite
      WHERE invite.bundle_id = v_bundle.id
        AND invite.invited_user_id = p_invited_user_id
        AND invite.status = 'pending'
        AND CURRENT_TIMESTAMP < invite.expires_at
    ) THEN
      RAISE EXCEPTION 'friend_invite_duplicate';
    END IF;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_member_count
  FROM public.tonight_friend_bundle_members AS member
  WHERE member.bundle_id = v_bundle.id;
  SELECT COUNT(*)::INTEGER
  INTO v_pending_count
  FROM public.tonight_friend_invites AS invite
  WHERE invite.bundle_id = v_bundle.id
    AND invite.status = 'pending'
    AND CURRENT_TIMESTAMP < invite.expires_at;
  IF v_pending_count >= 2 OR v_member_count + v_pending_count >= 3 THEN
    RAISE EXCEPTION 'friend_invite_seat_limit';
  END IF;

  INSERT INTO public.tonight_friend_invites (
    round_id, bundle_id, inviter_user_id, invited_user_id,
    token_hash, expires_at, create_idempotency_key
  )
  VALUES (
    p_round_id, v_bundle.id, v_caller, p_invited_user_id,
    p_token_hash, v_expires_at, p_idempotency_key
  )
  RETURNING * INTO v_invite;

  PERFORM quantum_private.write_tonight_audit(
    'friend_invite', v_invite.id, 'created', NULL,
    pg_catalog.jsonb_build_object(
      'round_id', p_round_id,
      'bundle_id', v_bundle.id,
      'target_fixed', p_invited_user_id IS NOT NULL,
      'expires_at', v_expires_at
    ),
    p_idempotency_key
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_invite.id,
    'status', v_invite.status,
    'expires_at', v_invite.expires_at,
    'created', TRUE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tonight_friend_invite(
  p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := quantum_private.assert_tonight_invite_user_role();
  v_invite public.tonight_friend_invites%ROWTYPE;
  v_round public.tonight_rounds%ROWTYPE;
  v_membership_ready BOOLEAN;
  v_profile_ready BOOLEAN;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_friend_invite_token_hash';
  END IF;

  SELECT invite.*
  INTO v_invite
  FROM public.tonight_friend_invites AS invite
  WHERE invite.token_hash = p_token_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'friend_invite_not_found';
  END IF;
  IF v_invite.inviter_user_id = v_caller THEN
    RAISE EXCEPTION 'friend_invite_self';
  END IF;
  IF v_invite.invited_user_id IS NOT NULL AND v_invite.invited_user_id <> v_caller THEN
    RAISE EXCEPTION 'friend_invite_target_mismatch';
  END IF;
  IF quantum_private.tonight_invite_pair_is_blocked(v_invite.inviter_user_id, v_caller) THEN
    RAISE EXCEPTION 'friend_invite_blocked';
  END IF;

  SELECT round_row.* INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = v_invite.round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;

  v_membership_ready := EXISTS (
    SELECT 1 FROM public.tonight_market_memberships AS membership
    WHERE membership.market_code = v_round.market_code
      AND membership.user_id = v_caller
      AND membership.revoked_at IS NULL
  );
  v_profile_ready := EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.private_appearance_scores AS score ON score.user_id = profile.user_id
    WHERE profile.user_id = v_caller
      AND profile.is_profile_complete
      AND score.status = 'ready'
      AND score.score_effective IS NOT NULL
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_invite.id,
    'round_id', v_invite.round_id,
    'status', CASE
      WHEN v_invite.status = 'pending' AND CURRENT_TIMESTAMP >= v_invite.expires_at THEN 'expired'
      ELSE v_invite.status
    END,
    'expires_at', v_invite.expires_at,
    'service_date', v_round.service_date,
    'signup_close_at', v_round.signup_close_at,
    'membership_ready', v_membership_ready,
    'profile_ready', v_profile_ready,
    'already_applied', EXISTS (
      SELECT 1 FROM public.tonight_applications AS application_row
      WHERE application_row.round_id = v_invite.round_id
        AND application_row.user_id = v_caller
    ),
    'activities', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', activity.id,
          'title', activity.title,
          'description', activity.description,
          'image_url', activity.image_url,
          'duration_minutes', activity.duration_minutes,
          'kind', activity.activity_kind
        ) ORDER BY activity.slot
      )
      FROM public.tonight_round_activities AS activity
      WHERE activity.round_id = v_invite.round_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_tonight_friend_invites(
  p_round_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := quantum_private.assert_tonight_invite_user_role();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tonight_market_memberships AS membership
    JOIN public.tonight_rounds AS round_row ON round_row.market_code = membership.market_code
    WHERE round_row.id = p_round_id
      AND membership.user_id = v_caller
      AND membership.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'tonight_market_membership_required';
  END IF;

  RETURN COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', invite.id,
        'status', CASE
          WHEN invite.status = 'pending' AND CURRENT_TIMESTAMP >= invite.expires_at THEN 'expired'
          ELSE invite.status
        END,
        'target_fixed', invite.invited_user_id IS NOT NULL,
        'expires_at', invite.expires_at,
        'created_at', invite.created_at
      ) ORDER BY invite.created_at DESC
    )
    FROM public.tonight_friend_invites AS invite
    WHERE invite.round_id = p_round_id
      AND invite.inviter_user_id = v_caller
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_tonight_friend_invite(
  p_token_hash TEXT,
  p_ranked_activity_ids UUID[],
  p_matching_consent_accepted BOOLEAN,
  p_matching_consent_version TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := quantum_private.assert_tonight_invite_user_role();
  v_invite public.tonight_friend_invites%ROWTYPE;
  v_round public.tonight_rounds%ROWTYPE;
  v_bundle public.tonight_friend_bundles%ROWTYPE;
  v_existing public.tonight_applications%ROWTYPE;
  v_application_id UUID;
  v_member_count INTEGER;
  v_age INTEGER;
  v_gender TEXT;
  v_appearance_score DOUBLE PRECISION;
  v_source_revision UUID;
  v_rank INTEGER;
  v_updated_count INTEGER;
  v_applications_open JSONB;
  v_membership_id UUID;
  v_owner_application_id UUID;
BEGIN
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_friend_invite_token_hash';
  END IF;
  IF COALESCE(p_matching_consent_accepted, FALSE) = FALSE
    OR COALESCE(p_matching_consent_version, '') <> '2026-09-03' THEN
    RAISE EXCEPTION 'matching_consent_required';
  END IF;
  IF pg_catalog.cardinality(p_ranked_activity_ids) <> 3
    OR p_ranked_activity_ids[1] = p_ranked_activity_ids[2]
    OR p_ranked_activity_ids[1] = p_ranked_activity_ids[3]
    OR p_ranked_activity_ids[2] = p_ranked_activity_ids[3] THEN
    RAISE EXCEPTION 'invalid_activity_choices';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tonight-application-idempotency:' || p_idempotency_key, 0)
  );

  SELECT invite.*
  INTO v_invite
  FROM public.tonight_friend_invites AS invite
  WHERE invite.token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'friend_invite_not_found';
  END IF;

  IF v_invite.status = 'accepted'
    AND v_invite.claimed_by_user_id = v_caller
    AND v_invite.accept_idempotency_key = p_idempotency_key THEN
    SELECT application_row.* INTO v_existing
    FROM public.tonight_applications AS application_row
    WHERE application_row.round_id = v_invite.round_id
      AND application_row.user_id = v_caller;
    RETURN pg_catalog.jsonb_build_object(
      'application_id', v_existing.id,
      'bundle_id', v_existing.bundle_id,
      'invite_id', v_invite.id,
      'replayed', TRUE
    );
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'friend_invite_unavailable';
  END IF;
  IF CURRENT_TIMESTAMP >= v_invite.expires_at THEN
    RAISE EXCEPTION 'friend_invite_expired';
  END IF;
  IF v_invite.inviter_user_id = v_caller THEN
    RAISE EXCEPTION 'friend_invite_self';
  END IF;
  IF v_invite.invited_user_id IS NOT NULL AND v_invite.invited_user_id <> v_caller THEN
    RAISE EXCEPTION 'friend_invite_target_mismatch';
  END IF;
  IF quantum_private.tonight_invite_pair_is_blocked(v_invite.inviter_user_id, v_caller) THEN
    RAISE EXCEPTION 'friend_invite_blocked';
  END IF;

  SELECT round_row.* INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = v_invite.round_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;
  SELECT config.value
  INTO v_applications_open
  FROM public.app_config AS config
  WHERE config.key = 'tonight_applications_open'
  FOR SHARE;
  IF v_applications_open IS NULL
    OR v_applications_open <> pg_catalog.to_jsonb(TRUE) THEN
    RAISE EXCEPTION 'tonight_applications_closed';
  END IF;
  IF v_round.status <> 'open'
    OR CURRENT_TIMESTAMP < v_round.signup_open_at
    OR CURRENT_TIMESTAMP >= v_round.signup_close_at THEN
    RAISE EXCEPTION 'tonight_applications_closed';
  END IF;
  IF v_round.market_code <> 'PNU' THEN
    RAISE EXCEPTION 'tonight_market_membership_required';
  END IF;
  SELECT membership.id
  INTO v_membership_id
  FROM public.tonight_market_memberships AS membership
  WHERE membership.market_code = v_round.market_code
    AND membership.user_id = v_caller
    AND membership.revoked_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_market_membership_required';
  END IF;
  IF (
    SELECT COUNT(*) FROM public.tonight_round_activities AS activity
    WHERE activity.round_id = v_invite.round_id
      AND activity.id = ANY(p_ranked_activity_ids)
  ) <> 3 THEN
    RAISE EXCEPTION 'activity_not_in_round';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-application-user:' || v_invite.round_id::TEXT || ':' || v_caller::TEXT,
      0
    )
  );
  SELECT application_row.* INTO v_existing
  FROM public.tonight_applications AS application_row
  WHERE application_row.submission_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tonight_applications AS application_row
    WHERE application_row.round_id = v_invite.round_id
      AND application_row.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'friend_invite_duplicate_application';
  END IF;

  SELECT bundle.* INTO v_bundle
  FROM public.tonight_friend_bundles AS bundle
  WHERE bundle.id = v_invite.bundle_id
    AND bundle.round_id = v_invite.round_id
  FOR UPDATE;
  IF NOT FOUND OR v_bundle.status <> 'forming' THEN
    RAISE EXCEPTION 'friend_bundle_unavailable';
  END IF;
  SELECT application_row.id
  INTO v_owner_application_id
  FROM public.tonight_applications AS application_row
  WHERE application_row.round_id = v_invite.round_id
    AND application_row.bundle_id = v_invite.bundle_id
    AND application_row.user_id = v_invite.inviter_user_id
    AND application_row.status IN ('submitted', 'waitlisted')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'friend_bundle_owner_unavailable';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tonight-friend-invites:' || v_bundle.id::TEXT, 0)
  );
  SELECT COUNT(*)::INTEGER INTO v_member_count
  FROM public.tonight_friend_bundle_members AS member
  WHERE member.bundle_id = v_bundle.id;
  IF v_member_count >= 3 OR v_member_count >= v_bundle.max_size THEN
    RAISE EXCEPTION 'friend_bundle_full';
  END IF;

  SELECT profile.age, profile.gender, score.score_effective, score.analyzed_photo_revision
  INTO v_age, v_gender, v_appearance_score, v_source_revision
  FROM public.profiles AS profile
  JOIN public.private_appearance_scores AS score ON score.user_id = profile.user_id
  WHERE profile.user_id = v_caller
    AND profile.is_profile_complete
    AND score.status = 'ready'
    AND score.score_effective IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'matching_profile_not_ready';
  END IF;

  INSERT INTO public.tonight_applications (
    round_id, user_id, bundle_id, matching_consent_version,
    matching_consent_accepted_at, submission_idempotency_key
  ) VALUES (
    v_invite.round_id, v_caller, v_bundle.id, p_matching_consent_version,
    CURRENT_TIMESTAMP, p_idempotency_key
  ) RETURNING id INTO v_application_id;

  INSERT INTO public.tonight_friend_bundle_members (bundle_id, application_id)
  VALUES (v_bundle.id, v_application_id);

  FOR v_rank IN 1..3 LOOP
    INSERT INTO public.tonight_application_choices (
      application_id, round_id, activity_id, rank
    ) VALUES (
      v_application_id, v_invite.round_id, p_ranked_activity_ids[v_rank], v_rank
    );
  END LOOP;

  INSERT INTO quantum_private.tonight_applicant_features (
    application_id, user_id, age_years, gender_code,
    automatic_appearance_score, appearance_score, source_score_revision
  ) VALUES (
    v_application_id, v_caller, v_age, v_gender,
    v_appearance_score, v_appearance_score, v_source_revision
  );

  UPDATE public.tonight_friend_invites AS invite
  SET status = 'accepted',
      invited_user_id = COALESCE(invite.invited_user_id, v_caller),
      claimed_by_user_id = v_caller,
      accept_idempotency_key = p_idempotency_key,
      accepted_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE invite.id = v_invite.id
    AND invite.status = 'pending'
    AND invite.claimed_by_user_id IS NULL;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'friend_invite_already_claimed';
  END IF;

  UPDATE public.tonight_friend_bundles AS bundle
  SET revision = bundle.revision + 1,
      status = CASE WHEN v_member_count + 1 >= bundle.max_size THEN 'locked' ELSE bundle.status END
  WHERE bundle.id = v_bundle.id;

  IF v_member_count + 1 >= v_bundle.max_size THEN
    UPDATE public.tonight_friend_invites AS invite
    SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE invite.bundle_id = v_bundle.id
      AND invite.status = 'pending'
      AND invite.id <> v_invite.id;
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'friend_invite', v_invite.id, 'accepted', NULL,
    pg_catalog.jsonb_build_object(
      'round_id', v_invite.round_id,
      'bundle_id', v_bundle.id,
      'application_id', v_application_id
    ),
    p_idempotency_key
  );

  RETURN pg_catalog.jsonb_build_object(
    'application_id', v_application_id,
    'bundle_id', v_bundle.id,
    'invite_id', v_invite.id,
    'replayed', FALSE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_tonight_friend_invite(
  p_token_hash TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := quantum_private.assert_tonight_invite_user_role();
  v_invite public.tonight_friend_invites%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_friend_invite_token_hash';
  END IF;

  SELECT invite.* INTO v_invite
  FROM public.tonight_friend_invites AS invite
  WHERE invite.token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'friend_invite_not_found'; END IF;
  IF v_invite.status = 'declined'
    AND v_invite.claimed_by_user_id = v_caller
    AND v_invite.decline_idempotency_key = p_idempotency_key THEN
    RETURN pg_catalog.jsonb_build_object('id', v_invite.id, 'status', 'declined', 'replayed', TRUE);
  END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'friend_invite_unavailable'; END IF;
  IF CURRENT_TIMESTAMP >= v_invite.expires_at THEN RAISE EXCEPTION 'friend_invite_expired'; END IF;
  IF v_invite.inviter_user_id = v_caller THEN RAISE EXCEPTION 'friend_invite_self'; END IF;
  IF v_invite.invited_user_id IS NOT NULL AND v_invite.invited_user_id <> v_caller THEN
    RAISE EXCEPTION 'friend_invite_target_mismatch';
  END IF;
  IF quantum_private.tonight_invite_pair_is_blocked(v_invite.inviter_user_id, v_caller) THEN
    RAISE EXCEPTION 'friend_invite_blocked';
  END IF;

  UPDATE public.tonight_friend_invites AS invite
  SET status = 'declined',
      invited_user_id = COALESCE(invite.invited_user_id, v_caller),
      claimed_by_user_id = v_caller,
      decline_idempotency_key = p_idempotency_key,
      declined_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE invite.id = v_invite.id AND invite.status = 'pending';

  PERFORM quantum_private.write_tonight_audit(
    'friend_invite', v_invite.id, 'declined', NULL,
    pg_catalog.jsonb_build_object('round_id', v_invite.round_id, 'bundle_id', v_invite.bundle_id),
    p_idempotency_key
  );
  RETURN pg_catalog.jsonb_build_object('id', v_invite.id, 'status', 'declined', 'replayed', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_tonight_friend_invite(
  p_invite_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := quantum_private.assert_tonight_invite_user_role();
  v_invite public.tonight_friend_invites%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  SELECT invite.* INTO v_invite
  FROM public.tonight_friend_invites AS invite
  WHERE invite.id = p_invite_id
  FOR UPDATE;
  IF NOT FOUND OR v_invite.inviter_user_id <> v_caller THEN
    RAISE EXCEPTION 'friend_invite_not_found';
  END IF;
  IF v_invite.status = 'cancelled' AND v_invite.cancel_idempotency_key = p_idempotency_key THEN
    RETURN pg_catalog.jsonb_build_object('id', v_invite.id, 'status', 'cancelled', 'replayed', TRUE);
  END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'friend_invite_unavailable'; END IF;

  UPDATE public.tonight_friend_invites AS invite
  SET status = 'cancelled',
      cancel_idempotency_key = p_idempotency_key,
      cancelled_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE invite.id = v_invite.id AND invite.status = 'pending';
  PERFORM quantum_private.write_tonight_audit(
    'friend_invite', v_invite.id, 'cancelled', NULL,
    pg_catalog.jsonb_build_object('round_id', v_invite.round_id, 'bundle_id', v_invite.bundle_id),
    p_idempotency_key
  );
  RETURN pg_catalog.jsonb_build_object('id', v_invite.id, 'status', 'cancelled', 'replayed', FALSE);
END;
$$;

-- Keep the legacy bundle code as an internal identifier. Browser users can no
-- longer submit or read it; friend joins must use the hashed capability RPCs.
CREATE OR REPLACE FUNCTION public.submit_tonight_solo_application(
  p_round_id UUID,
  p_ranked_activity_ids UUID[],
  p_matching_consent_accepted BOOLEAN,
  p_matching_consent_version TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (application_id UUID, bundle_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := quantum_private.assert_tonight_invite_user_role();
BEGIN
  RETURN QUERY
  SELECT submitted.application_id, submitted.bundle_id
  FROM public.submit_tonight_application(
    p_round_id,
    p_ranked_activity_ids,
    p_matching_consent_accepted,
    p_matching_consent_version,
    NULL,
    p_idempotency_key
  ) AS submitted;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_current_tonight_round()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  v_payload := public.get_current_tonight_round();
  IF v_payload IS NULL OR v_payload #> '{application,bundle}' IS NULL THEN
    RETURN v_payload;
  END IF;
  RETURN pg_catalog.jsonb_set(
    v_payload,
    '{application,bundle}',
    (v_payload #> '{application,bundle}') - 'invite_code',
    FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.assert_tonight_invite_user_role()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.tonight_invite_pair_is_blocked(UUID, UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_tonight_friend_invite(UUID, UUID, TEXT, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_tonight_friend_invite(TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_tonight_friend_invites(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_tonight_friend_invite(TEXT, UUID[], BOOLEAN, TEXT, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.decline_tonight_friend_invite(TEXT, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_tonight_friend_invite(UUID, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_tonight_solo_application(UUID, UUID[], BOOLEAN, TEXT, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_current_tonight_round()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_tonight_application(UUID, UUID[], BOOLEAN, TEXT, TEXT, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_tonight_friend_invite(UUID, UUID, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tonight_friend_invite(TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tonight_friend_invites(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tonight_friend_invite(TEXT, UUID[], BOOLEAN, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_tonight_friend_invite(TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_tonight_friend_invite(UUID, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tonight_solo_application(UUID, UUID[], BOOLEAN, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_current_tonight_round()
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.submit_tonight_application(UUID, UUID[], BOOLEAN, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON TABLE public.tonight_friend_invites IS
  'One-time Tonight friend invite capability ledger. Only SHA-256 hashes are stored; no friendship, contact, or chat is created.';

COMMIT;
