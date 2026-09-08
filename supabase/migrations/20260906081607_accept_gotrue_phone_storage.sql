-- GoTrue stores confirmed phone numbers without the E.164 plus sign in this local runtime.
-- Accept only that strict raw form or the existing E.164 form in Auth, while public.users
-- remains the application-facing canonical E.164 copy.

BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.resolve_profile_readiness(p_user_id UUID)
RETURNS TABLE (
  account_authenticated BOOLEAN,
  minimum_signup_complete BOOLEAN,
  profile_onboarding_complete BOOLEAN,
  matching_ready BOOLEAN,
  age_years INTEGER,
  missing_reasons TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH current_day AS MATERIALIZED (
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE AS value
  ),
  account_state AS MATERIALIZED (
    SELECT
      auth_user.id,
      auth_user.phone,
      auth_user.phone_confirmed_at,
      auth_user.phone IS NOT NULL
        AND auth_user.phone ~ '^(\+)?8210[0-9]{8}$'
        AND auth_user.phone_confirmed_at IS NOT NULL AS phone_verified
    FROM auth.users AS auth_user
    WHERE auth_user.id = p_user_id
  ),
  community_state AS MATERIALIZED (
    SELECT
      companion.*,
      pg_catalog.date_part(
        'year',
        pg_catalog.age((SELECT value FROM current_day), companion.birth_date)
      )::INTEGER AS computed_age
    FROM quantum_private.community_member_profiles AS companion
    WHERE companion.user_id = p_user_id
  ),
  profile_state AS MATERIALIZED (
    SELECT profile.*
    FROM public.profiles AS profile
    WHERE profile.user_id = p_user_id
  ),
  flags AS MATERIALIZED (
    SELECT
      EXISTS (SELECT 1 FROM account_state) AS has_account,
      COALESCE((SELECT phone_verified FROM account_state), FALSE) AS has_verified_phone,
      EXISTS (SELECT 1 FROM community_state) AS has_community,
      COALESCE((SELECT computed_age BETWEEN 19 AND 35 FROM community_state), FALSE) AS age_eligible,
      COALESCE((SELECT school_scope = 'pnu_self_selected' FROM community_state), FALSE) AS has_school_scope,
      COALESCE((SELECT pg_catalog.length(pg_catalog.btrim(department)) > 0 FROM community_state), FALSE) AS has_department,
      COALESCE((SELECT community_gender IN ('male', 'female', 'other', 'prefer_not_to_say', 'unknown') FROM community_state), FALSE) AS has_gender,
      COALESCE((SELECT
        pg_catalog.length(public.normalize_profile_display_name(display_name)) BETWEEN 2 AND 20
        AND alias_claimed_at IS NOT NULL
        FROM community_state
      ), FALSE) AS has_alias,
      COALESCE((SELECT worldcup_completed_at IS NOT NULL FROM profile_state), FALSE) AS has_worldcup,
      EXISTS (
        SELECT 1 FROM public.photos AS photo WHERE photo.user_id = p_user_id
      ) AS has_photo,
      COALESCE((SELECT community_gender IN ('male', 'female') FROM community_state), FALSE) AS matching_gender_supported,
      COALESCE((SELECT profile.gender = community.community_gender
        FROM profile_state AS profile
        CROSS JOIN community_state AS community
      ), FALSE) AS matching_gender_consistent,
      EXISTS (
        SELECT 1
        FROM public.private_appearance_scores AS score
        WHERE score.user_id = p_user_id
          AND score.status = 'ready'
          AND score.score_effective IS NOT NULL
      ) AS appearance_ready
  ),
  resolved AS MATERIALIZED (
    SELECT
      flags.*,
      (
        has_account AND has_verified_phone AND has_community AND age_eligible
        AND has_school_scope AND has_department AND has_gender AND has_alias
      ) AS minimum_complete
    FROM flags
  ),
  completed AS MATERIALIZED (
    SELECT
      resolved.*,
      (minimum_complete AND has_worldcup AND has_photo) AS onboarding_complete
    FROM resolved
  )
  SELECT
    has_account,
    minimum_complete,
    onboarding_complete,
    (
      onboarding_complete AND matching_gender_supported
      AND matching_gender_consistent AND appearance_ready
    ),
    (SELECT computed_age FROM community_state),
    pg_catalog.array_remove(ARRAY[
      CASE WHEN NOT has_account THEN 'account_unauthenticated' END,
      CASE WHEN NOT has_verified_phone THEN 'phone_unverified' END,
      CASE WHEN NOT has_community THEN 'minimum_profile_missing' END,
      CASE WHEN has_community AND NOT age_eligible THEN 'age_ineligible' END,
      CASE WHEN has_community AND NOT has_school_scope THEN 'school_scope_missing' END,
      CASE WHEN has_community AND NOT has_department THEN 'department_missing' END,
      CASE WHEN has_community AND NOT has_gender THEN 'gender_missing' END,
      CASE WHEN has_community AND NOT has_alias THEN 'server_alias_missing' END,
      CASE WHEN NOT has_worldcup THEN 'worldcup_incomplete' END,
      CASE WHEN NOT has_photo THEN 'photos_missing' END,
      CASE WHEN minimum_complete AND (NOT matching_gender_supported OR NOT matching_gender_consistent)
        THEN 'matching_gender_unsupported' END,
      CASE WHEN onboarding_complete AND NOT appearance_ready THEN 'appearance_review_required' END
    ]::TEXT[], NULL)
  FROM completed;
$$;

CREATE OR REPLACE FUNCTION public.get_my_minimum_signup()
RETURNS TABLE (
  birth_date DATE,
  school_scope TEXT,
  department TEXT,
  community_gender TEXT,
  display_name TEXT,
  phone_verified BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  SELECT
    companion.birth_date,
    companion.school_scope,
    companion.department,
    companion.community_gender,
    companion.display_name,
    EXISTS (
      SELECT 1 FROM auth.users AS auth_user
      WHERE auth_user.id = v_caller
        AND auth_user.phone ~ '^(\+)?8210[0-9]{8}$'
        AND auth_user.phone_confirmed_at IS NOT NULL
    )
  FROM quantum_private.community_member_profiles AS companion
  WHERE companion.user_id = v_caller;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_minimum_signup(
  p_user_id UUID,
  p_display_name TEXT,
  p_birth_date DATE,
  p_school_scope TEXT,
  p_department TEXT,
  p_community_gender TEXT,
  p_height INTEGER DEFAULT NULL,
  p_body_type TEXT DEFAULT NULL,
  p_hair_density TEXT DEFAULT NULL,
  p_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
  display_name TEXT,
  minimum_signup_complete BOOLEAN,
  profile_onboarding_complete BOOLEAN,
  matching_ready BOOLEAN,
  missing_reasons TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_display_name TEXT := pg_catalog.btrim(COALESCE(p_display_name, ''));
  v_normalized_name TEXT := public.normalize_profile_display_name(p_display_name);
  v_department TEXT := pg_catalog.btrim(COALESCE(p_department, ''));
  v_age INTEGER;
  v_phone TEXT;
  v_phone_confirmed_at TIMESTAMPTZ;
  v_existing_gender TEXT;
BEGIN
  IF private.current_request_role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;
  IF pg_catalog.length(v_normalized_name) NOT BETWEEN 2 AND 20 THEN RAISE EXCEPTION 'invalid_alias'; END IF;
  IF p_birth_date IS NULL THEN RAISE EXCEPTION 'invalid_birth_date'; END IF;
  IF p_school_scope IS DISTINCT FROM 'pnu_self_selected' THEN RAISE EXCEPTION 'invalid_school_scope'; END IF;
  IF pg_catalog.length(v_department) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'invalid_department'; END IF;
  IF p_community_gender IS NULL OR p_community_gender NOT IN (
    'male', 'female', 'other', 'prefer_not_to_say', 'unknown'
  ) THEN RAISE EXCEPTION 'invalid_gender'; END IF;
  IF p_height IS NOT NULL AND p_height NOT BETWEEN 100 AND 250 THEN RAISE EXCEPTION 'invalid_height'; END IF;
  IF p_body_type IS NOT NULL AND p_body_type NOT IN ('slim', 'average', 'athletic', 'chubby') THEN
    RAISE EXCEPTION 'invalid_body_type';
  END IF;
  IF p_hair_density IS NOT NULL AND p_hair_density NOT IN ('full', 'thinning', 'bald') THEN
    RAISE EXCEPTION 'invalid_hair_density';
  END IF;
  IF p_year IS NOT NULL AND p_year NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'invalid_year'; END IF;

  v_age := pg_catalog.date_part(
    'year',
    pg_catalog.age((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE, p_birth_date)
  )::INTEGER;
  IF v_age NOT BETWEEN 19 AND 35 THEN RAISE EXCEPTION 'age_ineligible'; END IF;

  SELECT auth_user.phone, auth_user.phone_confirmed_at
  INTO v_phone, v_phone_confirmed_at
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_phone IS NULL OR v_phone !~ '^(\+)?8210[0-9]{8}$' OR v_phone_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'phone_verification_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum:minimum-signup:user:' || p_user_id::TEXT, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum:minimum-signup:alias:' || v_normalized_name, 0)
  );

  DELETE FROM public.profile_display_name_claims AS claim
  WHERE claim.user_id = p_user_id AND claim.normalized_name <> v_normalized_name;

  INSERT INTO public.profile_display_name_claims (
    normalized_name, user_id, display_name, claimed_at, updated_at
  ) VALUES (
    v_normalized_name, p_user_id, v_display_name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT ON CONSTRAINT profile_display_name_claims_pkey DO UPDATE
  SET display_name = EXCLUDED.display_name,
      updated_at = CURRENT_TIMESTAMP
  WHERE public.profile_display_name_claims.user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'alias_taken'; END IF;

  INSERT INTO quantum_private.community_member_profiles (
    user_id, birth_date, school_scope, department, community_gender,
    display_name, alias_claimed_at, phone_verified_at, created_at, updated_at
  ) VALUES (
    p_user_id, p_birth_date, p_school_scope, v_department, p_community_gender,
    v_display_name, CURRENT_TIMESTAMP, v_phone_confirmed_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT (user_id) DO UPDATE
  SET birth_date = EXCLUDED.birth_date,
      school_scope = EXCLUDED.school_scope,
      department = EXCLUDED.department,
      community_gender = EXCLUDED.community_gender,
      display_name = EXCLUDED.display_name,
      alias_claimed_at = EXCLUDED.alias_claimed_at,
      phone_verified_at = EXCLUDED.phone_verified_at,
      updated_at = CURRENT_TIMESTAMP;

  UPDATE public.users AS user_row
  SET phone = CASE WHEN v_phone ~ '^8210[0-9]{8}$' THEN '+' || v_phone ELSE v_phone END
  WHERE user_row.id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_record_missing'; END IF;

  SELECT profile.gender INTO v_existing_gender
  FROM public.profiles AS profile
  WHERE profile.user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.profiles AS profile
    SET display_name = v_display_name,
        age = v_age,
        department = v_department,
        height = COALESCE(p_height, profile.height),
        body_type = COALESCE(p_body_type, profile.body_type),
        hair_density = CASE
          WHEN v_existing_gender = 'male' THEN COALESCE(p_hair_density, profile.hair_density)
          ELSE NULL
        END,
        year = COALESCE(p_year, profile.year),
        updated_at = CURRENT_TIMESTAMP
    WHERE profile.user_id = p_user_id;
  ELSIF p_community_gender IN ('male', 'female') THEN
    INSERT INTO public.profiles (
      user_id, display_name, gender, age, height, body_type, hair_density,
      school, department, year, is_profile_complete, updated_at
    ) VALUES (
      p_user_id, v_display_name, p_community_gender, v_age, p_height, p_body_type,
      CASE WHEN p_community_gender = 'male' THEN p_hair_density ELSE NULL END,
      '부산대학교', v_department, p_year, FALSE, CURRENT_TIMESTAMP
    );
  END IF;

  UPDATE public.profiles AS profile
  SET is_profile_complete = readiness.profile_onboarding_complete,
      updated_at = CURRENT_TIMESTAMP
  FROM quantum_private.resolve_profile_readiness(p_user_id) AS readiness
  WHERE profile.user_id = p_user_id;

  RETURN QUERY
  SELECT
    companion.display_name,
    readiness.minimum_signup_complete,
    readiness.profile_onboarding_complete,
    readiness.matching_ready,
    readiness.missing_reasons
  FROM quantum_private.community_member_profiles AS companion
  CROSS JOIN quantum_private.resolve_profile_readiness(p_user_id) AS readiness
  WHERE companion.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_phone_otp_challenge(
  p_challenge_id UUID,
  p_session_binding_hash TEXT,
  p_phone_hash TEXT,
  p_purpose TEXT,
  p_account_user_id UUID,
  p_verified_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_phone TEXT;
  v_auth_confirmed_at TIMESTAMPTZ;
BEGIN
  IF private.current_request_role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_verified_user_id IS NULL THEN RAISE EXCEPTION 'verified_user_required'; END IF;
  IF p_purpose = 'link_existing_account' AND p_account_user_id IS DISTINCT FROM p_verified_user_id THEN
    RAISE EXCEPTION 'verified_account_mismatch';
  END IF;

  SELECT auth_user.phone, auth_user.phone_confirmed_at
  INTO v_auth_phone, v_auth_confirmed_at
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_verified_user_id;
  IF NOT FOUND OR v_auth_phone IS NULL OR v_auth_phone !~ '^(\+)?8210[0-9]{8}$'
    OR v_auth_confirmed_at IS NULL THEN RAISE EXCEPTION 'verified_phone_missing'; END IF;

  UPDATE quantum_private.phone_otp_challenges AS challenge
  SET consumed_at = CURRENT_TIMESTAMP,
      verified_user_id = p_verified_user_id
  WHERE challenge.id = p_challenge_id
    AND challenge.session_binding_hash = p_session_binding_hash
    AND challenge.phone_hash = p_phone_hash
    AND challenge.purpose = p_purpose
    AND challenge.account_user_id IS NOT DISTINCT FROM p_account_user_id
    AND challenge.consumed_at IS NULL
    AND challenge.provider_expires_at > CURRENT_TIMESTAMP
    AND challenge.attempt_count BETWEEN 1 AND 5;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_invalid'; END IF;

  UPDATE public.users AS user_row
  SET phone = CASE WHEN v_auth_phone ~ '^8210[0-9]{8}$' THEN '+' || v_auth_phone ELSE v_auth_phone END
  WHERE user_row.id = p_verified_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_record_missing'; END IF;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.resolve_profile_readiness(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_minimum_signup()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_minimum_signup(UUID, TEXT, DATE, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_phone_otp_challenge(UUID, TEXT, TEXT, TEXT, UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_minimum_signup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_minimum_signup(UUID, TEXT, DATE, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_phone_otp_challenge(UUID, TEXT, TEXT, TEXT, UUID, UUID)
  TO service_role;

COMMIT;
