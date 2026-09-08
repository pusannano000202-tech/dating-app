-- Apply the canonical matching-readiness contract at every Tonight intake.
-- Existing successful idempotent replays remain replayable; only new writes
-- require the current verified-phone, full-profile, and private-score state.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_tonight_application(
  p_round_id UUID,
  p_ranked_activity_ids UUID[],
  p_matching_consent_accepted BOOLEAN,
  p_matching_consent_version TEXT,
  p_friend_invite_code TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  application_id UUID,
  bundle_id UUID,
  friend_invite_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_round public.tonight_rounds%ROWTYPE;
  v_applications_open JSONB;
  v_bundle public.tonight_friend_bundles%ROWTYPE;
  v_application_id UUID;
  v_invite_code TEXT;
  v_member_count INTEGER;
  v_age INTEGER;
  v_gender TEXT;
  v_appearance_score DOUBLE PRECISION;
  v_source_revision UUID;
  v_rank INTEGER;
  v_existing public.tonight_applications%ROWTYPE;
  v_membership_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF COALESCE(p_matching_consent_accepted, FALSE) = FALSE
    OR COALESCE(p_matching_consent_version, '') <> '2026-09-03' THEN
    RAISE EXCEPTION 'matching_consent_required';
  END IF;
  IF pg_catalog.cardinality(p_ranked_activity_ids) <> 3 THEN
    RAISE EXCEPTION 'invalid_activity_count';
  END IF;
  IF p_ranked_activity_ids[1] = p_ranked_activity_ids[2]
    OR p_ranked_activity_ids[1] = p_ranked_activity_ids[3]
    OR p_ranked_activity_ids[2] = p_ranked_activity_ids[3] THEN
    RAISE EXCEPTION 'duplicate_activity_choice';
  END IF;

  SELECT * INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tonight_round_not_found'; END IF;

  SELECT config.value INTO v_applications_open
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

  SELECT membership.id INTO v_membership_id
  FROM public.tonight_market_memberships AS membership
  WHERE membership.market_code = v_round.market_code
    AND membership.user_id = v_caller
    AND membership.revoked_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tonight_market_membership_required'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tonight-application-idempotency:' || p_idempotency_key, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-application-user:' || p_round_id::TEXT || ':' || v_caller::TEXT,
      0
    )
  );

  SELECT * INTO v_existing
  FROM public.tonight_applications AS application_row
  WHERE application_row.submission_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.user_id <> v_caller OR v_existing.round_id <> p_round_id THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    IF v_existing.matching_consent_version <> p_matching_consent_version THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.tonight_application_choices AS choice
      WHERE choice.application_id = v_existing.id
        AND choice.activity_id <> p_ranked_activity_ids[choice.rank]
    ) THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    SELECT bundle.invite_code INTO v_invite_code
    FROM public.tonight_friend_bundles AS bundle
    WHERE bundle.id = v_existing.bundle_id;
    IF p_friend_invite_code IS NOT NULL
      AND pg_catalog.btrim(p_friend_invite_code) <> ''
      AND v_invite_code <> pg_catalog.upper(pg_catalog.btrim(p_friend_invite_code)) THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.bundle_id, v_invite_code;
    RETURN;
  END IF;

  SELECT * INTO v_existing
  FROM public.tonight_applications AS application_row
  WHERE application_row.round_id = p_round_id
    AND application_row.user_id = v_caller
  FOR SHARE;
  IF FOUND THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;

  IF NOT public.is_profile_matching_ready(v_caller) THEN
    RAISE EXCEPTION 'matching_features_not_ready';
  END IF;
  IF v_round.status <> 'open'
    OR CURRENT_TIMESTAMP < v_round.signup_open_at
    OR CURRENT_TIMESTAMP >= v_round.signup_close_at THEN
    RAISE EXCEPTION 'tonight_signup_closed';
  END IF;
  IF (
    SELECT COUNT(*)
    FROM public.tonight_round_activities AS activity
    WHERE activity.round_id = p_round_id
      AND activity.id = ANY(p_ranked_activity_ids)
  ) <> 3 THEN
    RAISE EXCEPTION 'activity_not_in_round';
  END IF;

  SELECT
    profile.age,
    profile.gender,
    score.score_effective,
    score.analyzed_photo_revision
  INTO v_age, v_gender, v_appearance_score, v_source_revision
  FROM public.profiles AS profile
  JOIN public.private_appearance_scores AS score ON score.user_id = profile.user_id
  WHERE profile.user_id = v_caller
    AND score.status = 'ready'
    AND score.score_effective IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'matching_features_not_ready'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-bundle:' || p_round_id::TEXT || ':' || COALESCE(p_friend_invite_code, v_caller::TEXT),
      0
    )
  );
  IF p_friend_invite_code IS NULL OR pg_catalog.btrim(p_friend_invite_code) = '' THEN
    v_invite_code := pg_catalog.upper(
      pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''), 1, 10)
    );
    INSERT INTO public.tonight_friend_bundles (
      round_id, created_by, invite_code, max_size
    ) VALUES (p_round_id, v_caller, v_invite_code, 3)
    RETURNING * INTO v_bundle;
  ELSE
    SELECT * INTO v_bundle
    FROM public.tonight_friend_bundles AS bundle
    WHERE bundle.invite_code = pg_catalog.upper(pg_catalog.btrim(p_friend_invite_code))
    FOR UPDATE;
    IF NOT FOUND OR v_bundle.round_id <> p_round_id OR v_bundle.status <> 'forming' THEN
      RAISE EXCEPTION 'friend_bundle_unavailable';
    END IF;
    v_invite_code := v_bundle.invite_code;
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM public.tonight_friend_bundle_members AS member
  WHERE member.bundle_id = v_bundle.id;
  IF v_member_count >= v_bundle.max_size OR v_member_count >= 3 THEN
    RAISE EXCEPTION 'friend_bundle_limit_exceeded';
  END IF;

  INSERT INTO public.tonight_applications (
    round_id, user_id, bundle_id, matching_consent_version,
    matching_consent_accepted_at, submission_idempotency_key
  ) VALUES (
    p_round_id, v_caller, v_bundle.id, p_matching_consent_version,
    CURRENT_TIMESTAMP, p_idempotency_key
  ) RETURNING id INTO v_application_id;

  INSERT INTO public.tonight_friend_bundle_members (bundle_id, application_id)
  VALUES (v_bundle.id, v_application_id);
  FOR v_rank IN 1..3 LOOP
    INSERT INTO public.tonight_application_choices (
      application_id, round_id, activity_id, rank
    ) VALUES (v_application_id, p_round_id, p_ranked_activity_ids[v_rank], v_rank);
  END LOOP;

  INSERT INTO quantum_private.tonight_applicant_features (
    application_id, user_id, age_years, gender_code,
    automatic_appearance_score, appearance_score, source_score_revision
  ) VALUES (
    v_application_id, v_caller, v_age, v_gender,
    v_appearance_score, v_appearance_score, v_source_revision
  );

  UPDATE public.tonight_friend_bundles AS bundle
  SET revision = bundle.revision + 1,
      status = CASE
        WHEN v_member_count + 1 >= bundle.max_size THEN 'locked'
        ELSE bundle.status
      END
  WHERE bundle.id = v_bundle.id;

  PERFORM quantum_private.write_tonight_audit(
    'application', v_application_id, 'submitted', NULL,
    pg_catalog.jsonb_build_object(
      'round_id', p_round_id,
      'bundle_id', v_bundle.id,
      'choice_count', 3
    ),
    p_idempotency_key
  );
  RETURN QUERY SELECT v_application_id, v_bundle.id, v_invite_code;
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
  SELECT invite.* INTO v_invite
  FROM public.tonight_friend_invites AS invite
  WHERE invite.token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'friend_invite_not_found'; END IF;

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
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'friend_invite_unavailable'; END IF;
  IF CURRENT_TIMESTAMP >= v_invite.expires_at THEN RAISE EXCEPTION 'friend_invite_expired'; END IF;
  IF v_invite.inviter_user_id = v_caller THEN RAISE EXCEPTION 'friend_invite_self'; END IF;
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
  IF NOT FOUND THEN RAISE EXCEPTION 'tonight_round_not_found'; END IF;
  SELECT config.value INTO v_applications_open
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
  IF v_round.market_code <> 'PNU' THEN RAISE EXCEPTION 'tonight_market_membership_required'; END IF;

  SELECT membership.id INTO v_membership_id
  FROM public.tonight_market_memberships AS membership
  WHERE membership.market_code = v_round.market_code
    AND membership.user_id = v_caller
    AND membership.revoked_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tonight_market_membership_required'; END IF;
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
  IF FOUND THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.tonight_applications AS application_row
    WHERE application_row.round_id = v_invite.round_id
      AND application_row.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'friend_invite_duplicate_application';
  END IF;

  IF NOT public.is_profile_matching_ready(v_caller) THEN
    RAISE EXCEPTION 'matching_profile_not_ready';
  END IF;

  SELECT bundle.* INTO v_bundle
  FROM public.tonight_friend_bundles AS bundle
  WHERE bundle.id = v_invite.bundle_id
    AND bundle.round_id = v_invite.round_id
  FOR UPDATE;
  IF NOT FOUND OR v_bundle.status <> 'forming' THEN
    RAISE EXCEPTION 'friend_bundle_unavailable';
  END IF;
  SELECT application_row.id INTO v_owner_application_id
  FROM public.tonight_applications AS application_row
  WHERE application_row.round_id = v_invite.round_id
    AND application_row.bundle_id = v_invite.bundle_id
    AND application_row.user_id = v_invite.inviter_user_id
    AND application_row.status IN ('submitted', 'waitlisted')
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'friend_bundle_owner_unavailable'; END IF;

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
    AND score.status = 'ready'
    AND score.score_effective IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'matching_profile_not_ready'; END IF;

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
  IF v_updated_count <> 1 THEN RAISE EXCEPTION 'friend_invite_already_claimed'; END IF;

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

  SELECT invite.* INTO v_invite
  FROM public.tonight_friend_invites AS invite
  WHERE invite.token_hash = p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'friend_invite_not_found'; END IF;
  IF v_invite.inviter_user_id = v_caller THEN RAISE EXCEPTION 'friend_invite_self'; END IF;
  IF v_invite.invited_user_id IS NOT NULL AND v_invite.invited_user_id <> v_caller THEN
    RAISE EXCEPTION 'friend_invite_target_mismatch';
  END IF;
  IF quantum_private.tonight_invite_pair_is_blocked(v_invite.inviter_user_id, v_caller) THEN
    RAISE EXCEPTION 'friend_invite_blocked';
  END IF;

  SELECT round_row.* INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = v_invite.round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tonight_round_not_found'; END IF;

  v_membership_ready := EXISTS (
    SELECT 1 FROM public.tonight_market_memberships AS membership
    WHERE membership.market_code = v_round.market_code
      AND membership.user_id = v_caller
      AND membership.revoked_at IS NULL
  );
  v_profile_ready := public.is_profile_matching_ready(v_caller);

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

REVOKE ALL ON FUNCTION public.submit_tonight_application(UUID, UUID[], BOOLEAN, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_tonight_friend_invite(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_tonight_friend_invite(TEXT, UUID[], BOOLEAN, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.submit_tonight_application(UUID, UUID[], BOOLEAN, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tonight_friend_invite(TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tonight_friend_invite(TEXT, UUID[], BOOLEAN, TEXT, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.submit_tonight_application(UUID, UUID[], BOOLEAN, TEXT, TEXT, TEXT) IS
  'Tonight intake with canonical private matching readiness enforced before new application writes.';
COMMENT ON FUNCTION public.accept_tonight_friend_invite(TEXT, UUID[], BOOLEAN, TEXT, TEXT) IS
  'Friend-invite intake with canonical private matching readiness enforced before acceptance writes.';

COMMIT;
