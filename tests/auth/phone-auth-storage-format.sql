-- Run only after 20260906081607_accept_gotrue_phone_storage.sql is applied locally.
-- This test leaves no rows behind even when all assertions pass.
BEGIN;

DO $$
DECLARE
  v_raw_user UUID := '00000000-0000-4000-8000-000000000611';
  v_e164_user UUID := '00000000-0000-4000-8000-000000000612';
  v_phone_verified BOOLEAN;
  v_minimum_complete BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', TRUE);

  INSERT INTO auth.users (id, email, phone, phone_confirmed_at)
  VALUES
    (v_raw_user, 'phone-raw@example.invalid', '821012345678', CURRENT_TIMESTAMP),
    (v_e164_user, 'phone-e164@example.invalid', '+821012345678', CURRENT_TIMESTAMP);

  INSERT INTO public.users (id, phone)
  VALUES
    (v_raw_user, NULL),
    (v_e164_user, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO quantum_private.phone_otp_challenges (
    id, phone_hash, ip_hash, session_binding_hash, purpose, account_user_id,
    provider_expires_at, resend_available_at, attempt_count
  ) VALUES
    (
      '00000000-0000-4000-8000-000000000621', repeat('a', 64), repeat('b', 64), repeat('c', 64),
      'signup_or_signin', NULL, CURRENT_TIMESTAMP + INTERVAL '10 minutes', CURRENT_TIMESTAMP, 1
    ),
    (
      '00000000-0000-4000-8000-000000000622', repeat('d', 64), repeat('e', 64), repeat('f', 64),
      'signup_or_signin', NULL, CURRENT_TIMESTAMP + INTERVAL '10 minutes', CURRENT_TIMESTAMP, 1
    );

  PERFORM public.complete_phone_otp_challenge(
    '00000000-0000-4000-8000-000000000621', repeat('c', 64), repeat('a', 64),
    'signup_or_signin', NULL, v_raw_user
  );
  PERFORM public.complete_phone_otp_challenge(
    '00000000-0000-4000-8000-000000000622', repeat('f', 64), repeat('d', 64),
    'signup_or_signin', NULL, v_e164_user
  );

  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE (id = v_raw_user OR id = v_e164_user) AND phone IS DISTINCT FROM '+821012345678'
  ) THEN
    RAISE EXCEPTION 'public_phone_must_remain_canonical_e164';
  END IF;

  PERFORM public.complete_minimum_signup(
    v_raw_user, '새벽해달', DATE '2002-01-01', 'pnu_self_selected', '컴퓨터공학부', 'female'
  );
  PERFORM public.complete_minimum_signup(
    v_e164_user, '바다달빛', DATE '2002-01-01', 'pnu_self_selected', '컴퓨터공학부', 'male'
  );

  SELECT readiness.minimum_signup_complete
  INTO v_minimum_complete
  FROM quantum_private.resolve_profile_readiness(v_raw_user) AS readiness;
  IF v_minimum_complete IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'raw_gotrue_phone_must_be_ready';
  END IF;

  SELECT readiness.minimum_signup_complete
  INTO v_minimum_complete
  FROM quantum_private.resolve_profile_readiness(v_e164_user) AS readiness;
  IF v_minimum_complete IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'e164_auth_phone_must_remain_ready';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
  PERFORM set_config('request.jwt.claim.sub', v_raw_user::TEXT, TRUE);
  SELECT minimum.phone_verified
  INTO v_phone_verified
  FROM public.get_my_minimum_signup() AS minimum;
  IF v_phone_verified IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'get_my_minimum_signup_must_accept_raw_gotrue_phone';
  END IF;
END;
$$;

ROLLBACK;
