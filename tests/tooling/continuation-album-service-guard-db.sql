\set ON_ERROR_STOP on

-- Read-only transactional regression for the album service-role guard.
-- Only temporary assertions and request-claim settings are created; ROLLBACK removes them.
BEGIN;
SET LOCAL client_min_messages TO warning;

CREATE TEMP TABLE continuation_album_guard_assertions (
  label TEXT PRIMARY KEY
) ON COMMIT DROP;
GRANT SELECT, INSERT ON TABLE continuation_album_guard_assertions TO service_role;

CREATE FUNCTION pg_temp.assert_raises(p_sql TEXT, p_message TEXT, p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_message TEXT;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message IS DISTINCT FROM p_message THEN
      RAISE EXCEPTION USING
        ERRCODE = 'XX000',
        MESSAGE = 'assertion_failed:' || p_label || ':expected=' || p_message || ':actual=' || coalesce(v_message, '<null>');
    END IF;
    INSERT INTO pg_temp.continuation_album_guard_assertions(label) VALUES (p_label);
    RETURN;
  END;
  RAISE EXCEPTION USING ERRCODE = 'XX000', MESSAGE = 'assertion_failed:' || p_label || ':expected_error_not_raised';
END;
$$;

CREATE FUNCTION pg_temp.assert_true(p_condition BOOLEAN, p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_condition IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'XX000', MESSAGE = 'assertion_failed:' || p_label;
  END IF;
  INSERT INTO pg_temp.continuation_album_guard_assertions(label) VALUES (p_label);
END;
$$;

SET LOCAL ROLE service_role;

-- Leave request.jwt.claim.role genuinely unset for all modern-claims checks.
-- The old weekly guard compared NULL with <> and therefore failed open.
SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT pg_temp.assert_raises(
  $call$SELECT public.assign_weekly_party_for_service(NULL, NULL, NULL, NULL, NULL)$call$,
  'service_role_required',
  'weekly_modern_claims.authenticated_is_denied'
);

SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT pg_temp.assert_raises(
  $call$SELECT public.assign_weekly_party_for_service(NULL, NULL, NULL, NULL, NULL)$call$,
  'invalid_assignment_request',
  'weekly_modern_claims.service_role_reaches_argument_validation'
);

SELECT pg_catalog.set_config('request.jwt.claims', '', true);
SELECT pg_temp.assert_raises(
  $call$SELECT public.assign_weekly_party_for_service(NULL, NULL, NULL, NULL, NULL)$call$,
  'service_role_required',
  'weekly_missing_claims_are_denied'
);

-- PostgREST supplies the current JWT as request.jwt.claims. Reaching the
-- validation error proves the private service guard allowed the service role.
SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT pg_temp.assert_raises(
  $call$SELECT public.get_continuation_series_album_for_service(NULL, NULL)$call$,
  'invalid_series_album_request',
  'modern_claims.service_role_is_allowed'
);

SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT pg_temp.assert_raises(
  $call$SELECT public.get_continuation_series_album_for_service(NULL, NULL)$call$,
  'service_role_required',
  'modern_claims.authenticated_is_denied'
);

SELECT pg_catalog.set_config('request.jwt.claims', '', true);
SELECT pg_temp.assert_raises(
  $call$SELECT public.get_continuation_series_album_for_service(NULL, NULL)$call$,
  'service_role_required',
  'missing_claims_are_denied'
);

-- Keep compatibility with direct service jobs that still set the legacy GUC.
SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
SELECT pg_catalog.set_config('request.jwt.claims', '', true);
SELECT pg_temp.assert_raises(
  $call$SELECT public.assign_weekly_party_for_service(NULL, NULL, NULL, NULL, NULL)$call$,
  'invalid_assignment_request',
  'weekly_legacy_claim.service_role_is_allowed'
);
SELECT pg_temp.assert_raises(
  $call$SELECT public.get_continuation_series_album_for_service(NULL, NULL)$call$,
  'invalid_series_album_request',
  'legacy_claim.service_role_is_allowed'
);

RESET ROLE;

SELECT pg_temp.assert_true(
  to_regprocedure('quantum_private.assign_weekly_party_for_service_impl_20260906114007(uuid,uuid,uuid,integer,uuid)') IS NOT NULL
    AND NOT has_function_privilege(
      'service_role',
      'quantum_private.assign_weekly_party_for_service_impl_20260906114007(uuid,uuid,uuid,integer,uuid)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.assign_weekly_party_for_service(uuid,uuid,uuid,integer,uuid)',
      'EXECUTE'
    ),
  'weekly_wrapper.internal_allocator_is_not_directly_executable'
);

SELECT 'continuation_album_service_guard_assertions=' || count(*) AS synthetic_test_summary
FROM pg_temp.continuation_album_guard_assertions;

ROLLBACK;
