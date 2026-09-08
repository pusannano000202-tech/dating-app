-- Make every browser-callable PII reader consume its audit/rate-limit token in
-- the same transaction as the read.  The original implementations become
-- private cores so authenticated clients cannot bypass this boundary through
-- the Data API.

BEGIN;

ALTER FUNCTION public.admin_get_user_profile(UUID) SET SCHEMA quantum_private;
ALTER FUNCTION public.admin_get_match_review(UUID) SET SCHEMA quantum_private;
ALTER FUNCTION public.super_admin_get_tonight_team_diagnostics(UUID) SET SCHEMA quantum_private;
ALTER FUNCTION public.admin_get_tonight_exception_detail(UUID, TEXT) SET SCHEMA quantum_private;

REVOKE ALL ON FUNCTION quantum_private.admin_get_user_profile(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.admin_get_match_review(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.super_admin_get_tonight_team_diagnostics(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.admin_get_tonight_exception_detail(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_user_profile(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  gender TEXT,
  age INT,
  school TEXT,
  department TEXT,
  appearance_type TEXT,
  is_profile_complete BOOLEAN,
  effective_score FLOAT,
  score_auto FLOAT,
  score_override FLOAT,
  score_source TEXT,
  score_updated_at TIMESTAMPTZ,
  appearance_score_normalized FLOAT,
  photo_urls TEXT[]
)
LANGUAGE plpgsql
VOLATILE
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

  PERFORM public.authorize_tonight_sensitive_read(
    'super_admin_profile',
    p_user_id::TEXT
  );

  RETURN QUERY
  SELECT *
  FROM quantum_private.admin_get_user_profile(p_user_id);
END;
$$;

-- The legacy admin profile route uses the canonical super_admin_profile surface
-- so both browser paths share one atomic audit/rate-limit contract.
COMMENT ON FUNCTION public.admin_get_user_profile(UUID) IS
  'Super-admin-only atomic profile PII reader; legacy and Tonight routes share super_admin_profile.';

CREATE OR REPLACE FUNCTION public.admin_get_match_review(p_match_id UUID)
RETURNS TABLE (
  match_id UUID,
  group_a_id UUID,
  group_b_id UUID,
  status TEXT,
  approval_status TEXT,
  is_forced BOOLEAN,
  score FLOAT,
  score_breakdown JSONB,
  matched_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  group_a_members JSONB,
  group_b_members JSONB
)
LANGUAGE plpgsql
VOLATILE
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

  PERFORM public.authorize_tonight_sensitive_read(
    'legacy_admin_match_review',
    p_match_id::TEXT
  );

  RETURN QUERY
  SELECT *
  FROM quantum_private.admin_get_match_review(p_match_id);
END;
$$;

COMMENT ON FUNCTION public.admin_get_match_review(UUID) IS
  'Super-admin-only atomic member-level match evidence PII reader.';

CREATE OR REPLACE FUNCTION public.super_admin_get_tonight_team_diagnostics(
  p_team_id UUID
)
RETURNS TABLE (
  diagnostic_team_code TEXT,
  diagnostic_team_revision INTEGER,
  diagnostic_application_id UUID,
  diagnostic_user_id UUID,
  diagnostic_display_name TEXT,
  diagnostic_phone TEXT,
  diagnostic_photo_storage_paths TEXT[],
  diagnostic_age_years SMALLINT,
  diagnostic_gender_code TEXT,
  diagnostic_automatic_appearance_score NUMERIC,
  diagnostic_appearance_adjustment NUMERIC,
  diagnostic_effective_appearance_score NUMERIC,
  diagnostic_feature_revision INTEGER,
  diagnostic_bundle_id UUID,
  diagnostic_bundle_member_count INTEGER,
  diagnostic_seat_number SMALLINT,
  diagnostic_deposit_status TEXT,
  diagnostic_attendance_status TEXT,
  diagnostic_attendance_revision INTEGER
)
LANGUAGE plpgsql
VOLATILE
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

  PERFORM public.authorize_tonight_sensitive_read(
    'super_admin_diagnostics',
    p_team_id::TEXT
  );

  RETURN QUERY
  SELECT *
  FROM quantum_private.super_admin_get_tonight_team_diagnostics(p_team_id);
END;
$$;

COMMENT ON FUNCTION public.super_admin_get_tonight_team_diagnostics(UUID) IS
  'Super-admin-only atomic Tonight team diagnostics PII reader.';

CREATE OR REPLACE FUNCTION public.admin_get_tonight_exception_detail(
  p_round_id UUID,
  p_exception_key TEXT
)
RETURNS TABLE (
  exception_key TEXT,
  exception_kind TEXT,
  exception_team_id UUID,
  exception_team_code TEXT,
  subject_user_id UUID,
  subject_display_name TEXT,
  subject_phone TEXT,
  reporter_user_id UUID,
  reporter_display_name TEXT,
  reporter_phone TEXT,
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
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

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
  'Admin-only atomic Tonight exception PII reader.';

REVOKE ALL ON FUNCTION public.admin_get_user_profile(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_match_review(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_get_tonight_team_diagnostics(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_exception_detail(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_get_user_profile(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_match_review(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tonight_team_diagnostics(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_exception_detail(UUID, TEXT)
  TO authenticated;

COMMIT;
