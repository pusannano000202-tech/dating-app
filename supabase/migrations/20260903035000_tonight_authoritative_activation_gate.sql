-- Fail closed at both the server intake-worker boundary and the authoritative
-- database submission boundary. Financial and required-notification workers
-- intentionally remain ungated so existing obligations keep draining.

BEGIN;

INSERT INTO public.app_config (key, value)
VALUES ('tonight_applications_open', pg_catalog.to_jsonb(FALSE))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_app_config(p_key TEXT, p_value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_key IS NULL
    OR p_key NOT IN ('match_requires_approval', 'tonight_applications_open')
    OR p_value IS NULL
    OR pg_catalog.jsonb_typeof(p_value) <> 'boolean' THEN
    RAISE EXCEPTION 'invalid_app_config';
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_app_config_guard', 'on', TRUE);
  INSERT INTO public.app_config (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, v_caller, CURRENT_TIMESTAMP)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = v_caller,
        updated_at = CURRENT_TIMESTAMP;
  PERFORM pg_catalog.set_config('app.bypass_app_config_guard', 'off', TRUE);

  RETURN p_value;
END;
$$;

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

  SELECT *
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

  -- Hold a shared lock on the exact active membership until the application
  -- insert commits. A concurrent revoke needs FOR UPDATE on this row, so it
  -- either completes first (and this recheck sees revoked) or waits until the
  -- submission and its obligation are durable.
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

  -- Serialize both the globally unique request key and the one-application-
  -- per-round ownership key before resolving a replay. The second lock also
  -- closes races where one caller submits different keys or invite codes.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-application-idempotency:' || p_idempotency_key,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-application-user:' || p_round_id::TEXT || ':' || v_caller::TEXT,
      0
    )
  );

  SELECT *
  INTO v_existing
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
    SELECT bundle.invite_code
    INTO v_invite_code
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

  -- A different idempotency key for an already submitted round is a canonical
  -- conflict, not a database uniqueness error. The user lock above keeps this
  -- check valid through the later application insert.
  SELECT *
  INTO v_existing
  FROM public.tonight_applications AS application_row
  WHERE application_row.round_id = p_round_id
    AND application_row.user_id = v_caller
  FOR SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'idempotency_conflict';
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
  INTO
    v_age,
    v_gender,
    v_appearance_score,
    v_source_revision
  FROM public.profiles AS profile
  JOIN public.private_appearance_scores AS score
    ON score.user_id = profile.user_id
  WHERE profile.user_id = v_caller
    AND profile.is_profile_complete
    AND score.status = 'ready'
    AND score.score_effective IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'matching_features_not_ready';
  END IF;

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
      round_id,
      created_by,
      invite_code,
      max_size
    )
    VALUES (p_round_id, v_caller, v_invite_code, 3)
    RETURNING * INTO v_bundle;
  ELSE
    SELECT *
    INTO v_bundle
    FROM public.tonight_friend_bundles AS bundle
    WHERE bundle.invite_code = pg_catalog.upper(pg_catalog.btrim(p_friend_invite_code))
    FOR UPDATE;
    IF NOT FOUND OR v_bundle.round_id <> p_round_id OR v_bundle.status <> 'forming' THEN
      RAISE EXCEPTION 'friend_bundle_unavailable';
    END IF;
    v_invite_code := v_bundle.invite_code;
  END IF;

  SELECT COUNT(*)
  INTO v_member_count
  FROM public.tonight_friend_bundle_members AS member
  WHERE member.bundle_id = v_bundle.id;
  IF v_member_count >= v_bundle.max_size OR v_member_count >= 3 THEN
    RAISE EXCEPTION 'friend_bundle_limit_exceeded';
  END IF;

  INSERT INTO public.tonight_applications (
    round_id,
    user_id,
    bundle_id,
    matching_consent_version,
    matching_consent_accepted_at,
    submission_idempotency_key
  )
  VALUES (
    p_round_id,
    v_caller,
    v_bundle.id,
    p_matching_consent_version,
    CURRENT_TIMESTAMP,
    p_idempotency_key
  )
  RETURNING id INTO v_application_id;

  INSERT INTO public.tonight_friend_bundle_members (bundle_id, application_id)
  VALUES (v_bundle.id, v_application_id);

  FOR v_rank IN 1..3 LOOP
    INSERT INTO public.tonight_application_choices (
      application_id,
      round_id,
      activity_id,
      rank
    )
    VALUES (v_application_id, p_round_id, p_ranked_activity_ids[v_rank], v_rank);
  END LOOP;

  INSERT INTO quantum_private.tonight_applicant_features (
    application_id,
    user_id,
    age_years,
    gender_code,
    automatic_appearance_score,
    appearance_score,
    source_score_revision
  )
  VALUES (
    v_application_id,
    v_caller,
    v_age,
    v_gender,
    v_appearance_score,
    v_appearance_score,
    v_source_revision
  );

  UPDATE public.tonight_friend_bundles AS bundle
  SET revision = bundle.revision + 1,
      status = CASE
        WHEN v_member_count + 1 >= bundle.max_size THEN 'locked'
        ELSE bundle.status
      END
  WHERE bundle.id = v_bundle.id;

  PERFORM quantum_private.write_tonight_audit(
    'application',
    v_application_id,
    'submitted',
    NULL,
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

CREATE OR REPLACE FUNCTION public.service_get_tonight_activation_gate()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT config.value = pg_catalog.to_jsonb(TRUE)
      FROM public.app_config AS config
      WHERE config.key = 'tonight_applications_open'
    ),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.get_tonight_application_gate()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN COALESCE(
    (
      SELECT config.value = pg_catalog.to_jsonb(TRUE)
      FROM public.app_config AS config
      WHERE config.key = 'tonight_applications_open'
    ),
    FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_app_config(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_tonight_application(UUID, UUID[], BOOLEAN, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_get_tonight_activation_gate()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_tonight_application_gate()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_app_config(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tonight_application(UUID, UUID[], BOOLEAN, TEXT, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_tonight_activation_gate() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tonight_application_gate() TO authenticated;

COMMENT ON FUNCTION public.set_app_config(TEXT, JSONB) IS
  'Recent-auth super-admin-only allowlisted global matching and Tonight activation mutation.';
COMMENT ON FUNCTION public.submit_tonight_application(UUID, UUID[], BOOLEAN, TEXT, TEXT, TEXT) IS
  'Authenticated Tonight application submission guarded by the authoritative database activation flag.';
COMMENT ON FUNCTION public.service_get_tonight_activation_gate() IS
  'Service-role-only release readiness read of the authoritative Tonight application gate.';
COMMENT ON FUNCTION public.get_tonight_application_gate() IS
  'Authenticated boolean-only read of the authoritative Tonight application gate.';

COMMIT;
