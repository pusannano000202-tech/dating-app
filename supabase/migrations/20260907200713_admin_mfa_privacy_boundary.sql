-- Require a live administrator role and an active AAL2 session at the shared
-- authorization helpers, then minimize Tonight exception contact disclosure.
-- This is forward-only and must be applied before deploying the matching app code.

BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.admin_session_has_aal2(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session_id_text TEXT := auth.jwt() ->> 'session_id';
  v_session_id UUID;
  v_exp_text TEXT := auth.jwt() ->> 'exp';
BEGIN
  IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;
  IF (auth.jwt() ->> 'aal') IS DISTINCT FROM 'aal2' THEN
    RETURN FALSE;
  END IF;
  IF v_exp_text IS NULL
    OR v_exp_text !~ '^[0-9]{1,12}$'
    OR pg_catalog.to_timestamp(v_exp_text::DOUBLE PRECISION) <= CURRENT_TIMESTAMP
  THEN
    RETURN FALSE;
  END IF;
  IF v_session_id_text IS NULL
    OR v_session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RETURN FALSE;
  END IF;

  v_session_id := v_session_id_text::UUID;
  RETURN EXISTS (
    SELECT 1
    FROM auth.sessions AS session_row
    JOIN auth.users AS auth_user
      ON auth_user.id = session_row.user_id
    WHERE session_row.id = v_session_id
      AND session_row.user_id = p_user_id
      AND (session_row.not_after IS NULL OR session_row.not_after > CURRENT_TIMESTAMP)
      AND auth_user.deleted_at IS NULL
      AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= CURRENT_TIMESTAMP)
  );
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.admin_session_has_aal2(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF p_user_id IS DISTINCT FROM v_caller
    OR NOT quantum_private.admin_session_has_aal2(v_caller)
  THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.admins AS admin_row
    WHERE admin_row.user_id = v_caller
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF p_user_id IS DISTINCT FROM v_caller
    OR NOT quantum_private.admin_session_has_aal2(v_caller)
  THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.admins AS admin_row
    WHERE admin_row.user_id = v_caller
      AND admin_row.role = 'super_admin'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID)
  TO anon, authenticated;
REVOKE ALL ON FUNCTION public.is_super_admin(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_admin_aal2_session()
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
  IF NOT EXISTS (
    SELECT 1 FROM public.admins AS admin_row WHERE admin_row.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF NOT quantum_private.admin_session_has_aal2(v_caller) THEN
    RAISE EXCEPTION 'mfa_required';
  END IF;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_admin_aal2_session()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_admin_aal2_session()
  TO authenticated;

-- This endpoint exposes only the caller's live role for trusted server-side
-- routing into MFA. It is never an authorization predicate: every privileged
-- server route still calls verify_admin_aal2_session after reading it.
CREATE OR REPLACE FUNCTION public.get_server_access_context()
RETURNS TABLE(access_role TEXT, partner_venue_ids UUID[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_admin_role TEXT;
  v_partner_venue_ids UUID[];
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF quantum_private.account_deletion_blocks_access(v_caller) THEN
    RAISE EXCEPTION 'account_deletion_pending' USING ERRCODE='42501';
  END IF;

  SELECT admin_row.role INTO v_admin_role
  FROM public.admins AS admin_row
  WHERE admin_row.user_id = v_caller;

  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT membership.venue_id ORDER BY membership.venue_id),
    ARRAY[]::UUID[]
  ) INTO v_partner_venue_ids
  FROM public.venue_partner_memberships AS membership
  WHERE membership.user_id = v_caller
    AND membership.revoked_at IS NULL;

  RETURN QUERY SELECT CASE
    WHEN v_admin_role = 'super_admin' THEN 'super_admin'
    WHEN v_admin_role = 'admin' THEN 'admin'
    WHEN pg_catalog.cardinality(v_partner_venue_ids) > 0 THEN 'partner'
    ELSE 'user'
  END, v_partner_venue_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.get_server_access_context()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_server_access_context()
  TO authenticated;

-- Preserve the existing two-column public contract, but make its role an
-- effective role. Existing public RPCs that use this context for admin checks
-- (including voice and sports commands) therefore deny AAL1 direct calls.
CREATE OR REPLACE FUNCTION public.get_access_context()
RETURNS TABLE(access_role TEXT, partner_venue_ids UUID[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_admin_role TEXT;
  v_partner_venue_ids UUID[];
  v_has_admin_aal2 BOOLEAN := FALSE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF quantum_private.account_deletion_blocks_access(v_caller) THEN
    RAISE EXCEPTION 'account_deletion_pending' USING ERRCODE='42501';
  END IF;

  SELECT admin_row.role INTO v_admin_role
  FROM public.admins AS admin_row
  WHERE admin_row.user_id = v_caller;

  IF v_admin_role IN ('admin', 'super_admin') THEN
    v_has_admin_aal2 := quantum_private.admin_session_has_aal2(v_caller);
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT membership.venue_id ORDER BY membership.venue_id),
    ARRAY[]::UUID[]
  ) INTO v_partner_venue_ids
  FROM public.venue_partner_memberships AS membership
  WHERE membership.user_id = v_caller
    AND membership.revoked_at IS NULL;

  RETURN QUERY SELECT CASE
    WHEN v_admin_role='super_admin'
      AND v_has_admin_aal2 THEN 'super_admin'
    WHEN v_admin_role='admin'
      AND v_has_admin_aal2 THEN 'admin'
    WHEN pg_catalog.cardinality(v_partner_venue_ids) > 0 THEN 'partner'
    ELSE 'user'
  END, v_partner_venue_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.get_access_context()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_access_context()
  TO authenticated;

COMMENT ON FUNCTION public.get_server_access_context() IS
  'Routing-only live caller role. Never sufficient for authorization; admin operations require AAL2.';
COMMENT ON FUNCTION public.get_access_context() IS
  'Effective caller access context; administrator roles require a live AAL2 auth session.';

CREATE OR REPLACE FUNCTION quantum_private.mask_admin_contact_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_digits TEXT := pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g');
  v_prefix_length INTEGER := 3;
BEGIN
  IF p_phone IS NULL OR pg_catalog.char_length(v_digits) < 7 THEN
    RETURN NULL;
  END IF;
  IF v_digits LIKE '8210%' AND pg_catalog.char_length(v_digits) = 12 THEN
    v_digits := '0' || pg_catalog.substring(v_digits, 3);
  END IF;
  IF v_digits LIKE '02%' THEN v_prefix_length := 2; END IF;
  RETURN pg_catalog.substring(v_digits, 1, v_prefix_length)
    || '-****-'
    || pg_catalog.right(v_digits, 4);
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.mask_admin_contact_phone(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.admin_get_tonight_exception_detail(UUID, TEXT);
DROP FUNCTION quantum_private.admin_get_tonight_exception_detail(UUID, TEXT);

CREATE FUNCTION quantum_private.admin_get_tonight_exception_detail(
  p_round_id UUID,
  p_exception_key TEXT
)
RETURNS TABLE (
  exception_key TEXT,
  exception_kind TEXT,
  exception_team_id UUID,
  exception_team_code TEXT,
  contact_user_id UUID,
  contact_role TEXT,
  contact_phone_masked TEXT,
  report_id UUID,
  report_category TEXT,
  exception_status TEXT,
  refund_request_id UUID,
  refund_request_revision INTEGER,
  reconciliation_job_id UUID,
  reconciliation_revision INTEGER,
  manual_deposit_id UUID,
  manual_deposit_revision INTEGER,
  service_attempt_id UUID,
  reported_attendee_count SMALLINT,
  observed_arrived_count SMALLINT,
  service_confirmation_revision INTEGER,
  call_status TEXT
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
  IF NOT public.is_admin(v_caller) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_round_id IS NULL THEN RAISE EXCEPTION 'round_id_required'; END IF;
  IF p_exception_key IS NULL
    OR pg_catalog.length(p_exception_key) > 100
    OR p_exception_key !~ '^[0-9]{10}:[0-9]{2}:[a-z_]+:[0-9a-f-]{36}$'
  THEN
    RAISE EXCEPTION 'invalid_exception_key';
  END IF;

  RETURN QUERY
  SELECT
    exception_row.exception_key,
    exception_row.exception_kind,
    exception_row.exception_team_id,
    exception_row.exception_team_code,
    COALESCE(exception_row.subject_user_id, exception_row.reporter_user_id),
    CASE
      WHEN exception_row.subject_user_id IS NOT NULL THEN 'subject'::TEXT
      WHEN exception_row.reporter_user_id IS NOT NULL THEN 'reporter'::TEXT
      ELSE NULL::TEXT
    END,
    quantum_private.mask_admin_contact_phone(
      CASE
        WHEN exception_row.subject_user_id IS NOT NULL THEN subject_user.phone
        ELSE reporter_user.phone
      END
    ),
    exception_row.report_id,
    exception_row.report_category,
    exception_row.exception_status,
    exception_row.refund_request_id,
    exception_row.refund_request_revision,
    exception_row.reconciliation_job_id,
    exception_row.reconciliation_revision,
    exception_row.manual_deposit_id,
    exception_row.manual_deposit_revision,
    exception_row.service_attempt_id,
    exception_row.reported_attendee_count,
    exception_row.observed_arrived_count,
    exception_row.service_confirmation_revision,
    latest_call.outcome
  FROM quantum_private.list_tonight_exception_index(p_round_id) AS exception_row
  LEFT JOIN public.users AS subject_user
    ON subject_user.id = exception_row.subject_user_id
  LEFT JOIN public.users AS reporter_user
    ON reporter_user.id = exception_row.reporter_user_id
  LEFT JOIN LATERAL (
    SELECT call_attempt.outcome
    FROM quantum_private.tonight_call_attempts AS call_attempt
    WHERE call_attempt.team_id = exception_row.exception_team_id
      AND call_attempt.subject_user_id = COALESCE(
        exception_row.subject_user_id,
        exception_row.reporter_user_id
      )
    ORDER BY call_attempt.attempted_at DESC, call_attempt.id DESC
    LIMIT 1
  ) AS latest_call ON TRUE
  WHERE exception_row.exception_key = p_exception_key
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.admin_get_tonight_exception_detail(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_get_tonight_exception_detail(
  p_round_id UUID,
  p_exception_key TEXT
)
RETURNS TABLE (
  exception_key TEXT,
  exception_kind TEXT,
  exception_team_id UUID,
  exception_team_code TEXT,
  contact_user_id UUID,
  contact_role TEXT,
  contact_phone_masked TEXT,
  report_id UUID,
  report_category TEXT,
  exception_status TEXT,
  refund_request_id UUID,
  refund_request_revision INTEGER,
  reconciliation_job_id UUID,
  reconciliation_revision INTEGER,
  manual_deposit_id UUID,
  manual_deposit_revision INTEGER,
  service_attempt_id UUID,
  reported_attendee_count SMALLINT,
  observed_arrived_count SMALLINT,
  service_confirmation_revision INTEGER,
  call_status TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_caller) THEN RAISE EXCEPTION 'admin_required'; END IF;

  PERFORM public.authorize_tonight_sensitive_read(
    'admin_exception_detail',
    p_exception_key
  );

  RETURN QUERY
  SELECT *
  FROM quantum_private.admin_get_tonight_exception_detail(
    p_round_id,
    p_exception_key
  );
END;
$$;

COMMENT ON FUNCTION public.admin_get_tonight_exception_detail(UUID, TEXT) IS
  'AAL2 admin-only atomic exception reader returning one masked business contact.';

REVOKE ALL ON FUNCTION public.admin_get_tonight_exception_detail(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_exception_detail(UUID, TEXT)
  TO authenticated;

COMMIT;
