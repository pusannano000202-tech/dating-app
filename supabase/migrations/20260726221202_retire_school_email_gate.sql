-- School email verification is retired from the product. Keep the legacy
-- columns and table for audit/rollback, but remove every callable surface.
REVOKE ALL ON FUNCTION public.request_school_email_verification(TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.verify_school_email_code(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.school_email_verification_codes
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.school_email_verification_codes IS
  'Deprecated. School email verification was retired from the Quantum product on 2026-07-26.';
COMMENT ON COLUMN public.users.school_email IS
  'Deprecated legacy value. New application flows must not read or write this column.';
COMMENT ON COLUMN public.users.school_email_verified_at IS
  'Deprecated legacy value. New application flows must not use this column for eligibility.';

CREATE OR REPLACE FUNCTION public.apply_to_campus_seven(
  p_submitted_name TEXT,
  p_date_of_birth DATE,
  p_preference_answers JSONB,
  p_required_consents JSONB,
  p_card_sale_preference BOOLEAN DEFAULT FALSE,
  p_consent_version TEXT DEFAULT 'campus-seven-v3'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_school TEXT;
  v_department TEXT;
  v_gender TEXT;
  v_application_id UUID;
  v_answer_count INT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT COALESCE((
    SELECT settings.applications_open
    FROM public.campus_seven_program_settings AS settings
    WHERE settings.singleton = TRUE
  ), FALSE) THEN
    RAISE EXCEPTION 'application_window_closed';
  END IF;

  SELECT p.school, p.department, p.gender
  INTO v_school, v_department, v_gender
  FROM public.profiles AS p
  WHERE p.user_id = v_caller;

  IF v_school IS NULL OR v_gender IS NULL THEN
    RAISE EXCEPTION 'complete_profile_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.photos AS profile_photo
    WHERE profile_photo.user_id = v_caller
      AND profile_photo.sort_order = 0
      AND NULLIF(btrim(profile_photo.public_url), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'profile_photo_required';
  END IF;
  IF p_date_of_birth IS NULL OR p_date_of_birth > CURRENT_DATE - INTERVAL '19 years' THEN
    RAISE EXCEPTION 'adult_only';
  END IF;
  IF char_length(btrim(COALESCE(p_submitted_name, ''))) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF jsonb_typeof(p_preference_answers) <> 'object' THEN
    RAISE EXCEPTION 'invalid_preference_answers';
  END IF;

  SELECT COUNT(*) INTO v_answer_count FROM jsonb_each(p_preference_answers);
  IF v_answer_count <> 8 OR EXISTS (
    SELECT 1
    FROM jsonb_each(p_preference_answers) AS answer(key, value)
    WHERE jsonb_typeof(answer.value) <> 'string'
      OR char_length(btrim(answer.value #>> '{}')) NOT BETWEEN 1 AND 80
      OR private.campus_seven_has_prohibited_contact(answer.value #>> '{}')
  ) THEN
    RAISE EXCEPTION 'invalid_preference_answers';
  END IF;

  IF NOT p_required_consents @> '{
    "adult_eligibility": true,
    "seven_day_schedule": true,
    "activity_budget": true,
    "public_venues_no_alcohol": true,
    "external_contact_prohibited": true,
    "cohort_photo_display": true,
    "attendance_photo": true,
    "final_contact_reveal": true,
    "privacy_policy": true
  }'::jsonb THEN
    RAISE EXCEPTION 'required_consent_missing';
  END IF;

  SELECT a.id INTO v_application_id
  FROM public.campus_seven_applications AS a
  WHERE a.user_id = v_caller
  FOR UPDATE;

  IF v_application_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.campus_seven_applications AS a
    WHERE a.id = v_application_id
      AND a.status NOT IN ('pending', 'identity_review', 'waitlisted', 'withdrawn', 'rejected')
  ) THEN
    RAISE EXCEPTION 'application_locked';
  END IF;

  INSERT INTO public.campus_seven_applications (
    user_id, school, gender, status, preference_answers, consent_version,
    required_consents, card_sale_preference, applied_at, updated_at
  ) VALUES (
    v_caller, v_school, v_gender, 'identity_review', p_preference_answers,
    p_consent_version, p_required_consents, COALESCE(p_card_sale_preference, FALSE), NOW(), NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET school = EXCLUDED.school,
      gender = EXCLUDED.gender,
      status = 'identity_review',
      preference_answers = EXCLUDED.preference_answers,
      consent_version = EXCLUDED.consent_version,
      required_consents = EXCLUDED.required_consents,
      card_sale_preference = EXCLUDED.card_sale_preference,
      updated_at = NOW()
  RETURNING id INTO v_application_id;

  INSERT INTO public.campus_seven_private_profiles (
    application_id, user_id, submitted_name, verified_name, date_of_birth,
    department_snapshot, identity_verified_at, identity_verification_provider,
    created_at, updated_at
  ) VALUES (
    v_application_id, v_caller, btrim(p_submitted_name), NULL, p_date_of_birth,
    v_department, NULL, NULL, NOW(), NOW()
  )
  ON CONFLICT (application_id) DO UPDATE
  SET submitted_name = EXCLUDED.submitted_name,
      verified_name = NULL,
      date_of_birth = EXCLUDED.date_of_birth,
      department_snapshot = EXCLUDED.department_snapshot,
      identity_verified_at = NULL,
      identity_verification_provider = NULL,
      updated_at = NOW();

  RETURN v_application_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_to_campus_seven(TEXT, DATE, JSONB, JSONB, BOOLEAN, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_to_campus_seven(TEXT, DATE, JSONB, JSONB, BOOLEAN, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.apply_to_campus_seven(TEXT, DATE, JSONB, JSONB, BOOLEAN, TEXT) IS
  'Creates an identity-review application using adult, profile, photo, and explicit-consent checks.';

CREATE OR REPLACE FUNCTION public.get_department_friend_suggestions(
  p_limit INT DEFAULT 24
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID;
  v_school TEXT;
  v_department TEXT;
  v_discovery_enabled BOOLEAN;
  v_limit INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT
    NULLIF(regexp_replace(btrim(p.school), '[[:space:]]+', ' ', 'g'), ''),
    NULLIF(regexp_replace(btrim(p.department), '[[:space:]]+', ' ', 'g'), ''),
    p.department_friend_discovery_enabled
  INTO v_school, v_department, v_discovery_enabled
  FROM public.profiles AS p
  WHERE p.user_id = v_caller;

  IF v_school IS NULL THEN
    RAISE EXCEPTION 'profile_school_required';
  END IF;
  IF v_department IS NULL THEN
    RAISE EXCEPTION 'profile_department_required';
  END IF;
  IF NOT COALESCE(v_discovery_enabled, FALSE) THEN
    RAISE EXCEPTION 'department_discovery_consent_required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 50);

  RETURN QUERY
  SELECT p.user_id, p.display_name
  FROM public.profiles AS p
  WHERE p.user_id <> v_caller
    AND p.department_friend_discovery_enabled = TRUE
    AND lower(regexp_replace(btrim(p.school), '[[:space:]]+', ' ', 'g')) = lower(v_school)
    AND lower(regexp_replace(btrim(p.department), '[[:space:]]+', ' ', 'g')) = lower(v_department)
    AND NOT EXISTS (
      SELECT 1
      FROM public.friendships AS f
      WHERE f.user_id = LEAST(v_caller, p.user_id)
        AND f.friend_user_id = GREATEST(v_caller, p.user_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.friend_requests AS r
      WHERE r.status = 'pending'
        AND (
          (r.sender_user_id = v_caller AND r.receiver_user_id = p.user_id)
          OR (r.sender_user_id = p.user_id AND r.receiver_user_id = v_caller)
        )
    )
  ORDER BY p.updated_at DESC NULLS LAST, p.user_id
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_department_friend_suggestions(INT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_department_friend_suggestions(INT)
  TO authenticated;

COMMENT ON FUNCTION public.get_department_friend_suggestions(INT) IS
  'Returns consented same-school and same-department suggestions. Friendship creation requires a separate accepted request.';
