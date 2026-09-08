-- Bound Tonight exception responses to one non-PII page. Contact details and
-- mutation identifiers are resolved only for one explicitly selected row.

BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.list_tonight_exception_index(
  p_round_id UUID
)
RETURNS TABLE (
  exception_key TEXT,
  sort_team_number INTEGER,
  exception_kind TEXT,
  exception_team_id UUID,
  exception_team_code TEXT,
  subject_user_id UUID,
  reporter_user_id UUID,
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
  service_confirmation_revision INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    pg_catalog.lpad(team.team_number::TEXT, 10, '0')
      || ':10:missing_arrival:' || attendance.id::TEXT,
    team.team_number,
    'missing_arrival'::TEXT,
    team.id,
    team.team_code,
    attendance.user_id,
    NULL::UUID,
    NULL::UUID,
    NULL::TEXT,
    attendance.status,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::SMALLINT,
    NULL::SMALLINT,
    NULL::INTEGER
  FROM public.tonight_attendance AS attendance
  JOIN public.tonight_teams AS team ON team.id = attendance.team_id
  JOIN public.tonight_rounds AS round_row ON round_row.id = team.round_id
  WHERE team.round_id = p_round_id
    AND attendance.status = 'pending'
    AND CURRENT_TIMESTAMP >= round_row.arrival_at

  UNION ALL

  SELECT
    pg_catalog.lpad(team.team_number::TEXT, 10, '0')
      || ':20:active_report:' || report.id::TEXT,
    team.team_number,
    'active_report'::TEXT,
    team.id,
    team.team_code,
    report.subject_user_id,
    report.reporter_user_id,
    report.id,
    report.category,
    report.status,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::SMALLINT,
    NULL::SMALLINT,
    NULL::INTEGER
  FROM public.tonight_incident_reports AS report
  JOIN public.tonight_teams AS team ON team.id = report.team_id
  WHERE team.round_id = p_round_id
    AND report.status IN ('open', 'reviewing')

  UNION ALL

  SELECT
    pg_catalog.lpad(team.team_number::TEXT, 10, '0')
      || ':30:refund_dead_letter:' || refund_request.id::TEXT,
    team.team_number,
    'refund_dead_letter'::TEXT,
    team.id,
    team.team_code,
    deposit.user_id,
    NULL::UUID,
    NULL::UUID,
    NULL::TEXT,
    refund_request.status,
    refund_request.id,
    refund_request.revision,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::SMALLINT,
    NULL::SMALLINT,
    NULL::INTEGER
  FROM public.tonight_deposit_refund_requests AS refund_request
  JOIN public.tonight_deposits AS deposit ON deposit.id = refund_request.deposit_id
  JOIN public.tonight_team_members AS member ON member.application_id = deposit.application_id
  JOIN public.tonight_teams AS team ON team.id = member.team_id
  WHERE team.round_id = p_round_id
    AND refund_request.status = 'failed'
    AND refund_request.settlement_attempt_count >= 10

  UNION ALL

  SELECT
    pg_catalog.lpad(team.team_number::TEXT, 10, '0')
      || ':40:settlement_finalize_pending:' || confirmation.id::TEXT,
    team.team_number,
    'settlement_finalize_pending'::TEXT,
    team.id,
    team.team_code,
    NULL::UUID,
    NULL::UUID,
    NULL::UUID,
    NULL::TEXT,
    'pending'::TEXT,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::SMALLINT,
    NULL::SMALLINT,
    confirmation.revision
  FROM public.tonight_partner_service_confirmations AS confirmation
  JOIN public.tonight_teams AS team ON team.id = confirmation.team_id
  WHERE team.round_id = p_round_id
    AND confirmation.confirmed_attendee_count = (
      SELECT COUNT(*)::SMALLINT
      FROM public.tonight_attendance AS attendance
      WHERE attendance.team_id = confirmation.team_id
        AND attendance.status = 'arrived'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tonight_settlements AS settlement
      WHERE settlement.team_id = confirmation.team_id
    )

  UNION ALL

  SELECT
    pg_catalog.lpad(team.team_number::TEXT, 10, '0')
      || ':50:deposit_manual_review:' || deposit.id::TEXT,
    team.team_number,
    'deposit_manual_review'::TEXT,
    team.id,
    team.team_code,
    attendance.user_id,
    NULL::UUID,
    NULL::UUID,
    NULL::TEXT,
    attendance.status,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::INTEGER,
    deposit.id,
    deposit.revision,
    NULL::UUID,
    NULL::SMALLINT,
    NULL::SMALLINT,
    NULL::INTEGER
  FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
  JOIN public.tonight_teams AS team ON team.id = terminal_event.team_id
  JOIN public.tonight_deposits AS deposit ON deposit.id = terminal_event.deposit_id
  JOIN public.tonight_attendance AS attendance
    ON attendance.application_id = deposit.application_id
    AND attendance.team_id = team.id
  WHERE team.round_id = p_round_id
    AND terminal_event.disposition = 'manual_review'
    AND terminal_event.attendance_revision = attendance.revision
    AND attendance.status IN ('pending', 'no_show')
    AND deposit.status = 'held'
    AND NOT EXISTS (
      SELECT 1
      FROM quantum_private.tonight_manual_deposit_resolution_events AS resolution
      WHERE resolution.deposit_id = deposit.id
    )

  UNION ALL

  SELECT
    pg_catalog.lpad(team.team_number::TEXT, 10, '0')
      || ':60:deposit_reconciliation_failed:' || job.id::TEXT,
    team.team_number,
    'deposit_reconciliation_failed'::TEXT,
    team.id,
    team.team_code,
    deposit.user_id,
    NULL::UUID,
    NULL::UUID,
    NULL::TEXT,
    COALESCE(job.last_error_code, 'reconciliation_failed'),
    NULL::UUID,
    NULL::INTEGER,
    job.id,
    job.revision,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::SMALLINT,
    NULL::SMALLINT,
    NULL::INTEGER
  FROM quantum_private.tonight_deposit_reconciliation_jobs AS job
  JOIN public.tonight_deposits AS deposit ON deposit.id = job.deposit_id
  JOIN public.tonight_team_members AS member ON member.application_id = deposit.application_id
  JOIN public.tonight_teams AS team ON team.id = member.team_id
  WHERE team.round_id = p_round_id
    AND job.status = 'failed'
    AND job.attempt_count >= 20

  UNION ALL

  SELECT
    pg_catalog.lpad(team.team_number::TEXT, 10, '0')
      || ':70:'
      || CASE
        WHEN latest_attempt.id IS NOT NULL
          AND latest_attempt.reported_attendee_count <> arrived.arrived_count
        THEN 'headcount_mismatch'
        WHEN confirmation.id IS NOT NULL
          AND confirmation.confirmed_attendee_count <> arrived.arrived_count
        THEN 'headcount_mismatch'
        ELSE 'service_confirmation_missing'
      END
      || ':' || team.id::TEXT,
    team.team_number,
    CASE
      WHEN latest_attempt.id IS NOT NULL
        AND latest_attempt.reported_attendee_count <> arrived.arrived_count
      THEN 'headcount_mismatch'::TEXT
      WHEN confirmation.id IS NOT NULL
        AND confirmation.confirmed_attendee_count <> arrived.arrived_count
      THEN 'headcount_mismatch'::TEXT
      ELSE 'service_confirmation_missing'::TEXT
    END,
    team.id,
    team.team_code,
    NULL::UUID,
    NULL::UUID,
    NULL::UUID,
    NULL::TEXT,
    CASE
      WHEN latest_attempt.id IS NOT NULL
        AND latest_attempt.reported_attendee_count <> arrived.arrived_count
      THEN 'attendance_mismatch'::TEXT
      WHEN confirmation.id IS NOT NULL
        AND confirmation.confirmed_attendee_count <> arrived.arrived_count
      THEN 'attendance_mismatch'::TEXT
      ELSE 'confirmation_missing'::TEXT
    END,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::INTEGER,
    NULL::UUID,
    NULL::INTEGER,
    latest_attempt.id,
    latest_attempt.reported_attendee_count,
    arrived.arrived_count::SMALLINT,
    COALESCE(confirmation.revision, 0)
  FROM public.tonight_teams AS team
  JOIN public.tonight_rounds AS round_row ON round_row.id = team.round_id
  JOIN public.tonight_round_activities AS activity
    ON activity.id = team.activity_id
    AND activity.round_id = team.round_id
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS arrived_count
    FROM public.tonight_attendance AS attendance
    WHERE attendance.team_id = team.id
      AND attendance.status = 'arrived'
  ) AS arrived
  LEFT JOIN LATERAL (
    SELECT attempt.*
    FROM quantum_private.tonight_partner_service_confirmation_attempts AS attempt
    WHERE attempt.team_id = team.id
    ORDER BY attempt.attempted_at DESC, attempt.id DESC
    LIMIT 1
  ) AS latest_attempt ON TRUE
  LEFT JOIN public.tonight_partner_service_confirmations AS confirmation
    ON confirmation.team_id = team.id
  WHERE team.round_id = p_round_id
    AND team.status IN ('accepted', 'revealed', 'in_progress', 'completed')
    AND CURRENT_TIMESTAMP >= round_row.starts_at
      + pg_catalog.make_interval(mins => activity.duration_minutes)
      + INTERVAL '10 minutes'
    AND (
      confirmation.id IS NULL
      OR confirmation.confirmed_attendee_count <> arrived.arrived_count
      OR (
        latest_attempt.id IS NOT NULL
        AND latest_attempt.attempted_at > confirmation.updated_at
        AND latest_attempt.reported_attendee_count <> arrived.arrived_count
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tonight_exception_page(
  p_round_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_after_exception_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  exception_key TEXT,
  exception_kind TEXT,
  exception_team_id UUID,
  exception_team_code TEXT,
  exception_status TEXT
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
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  IF p_after_exception_key IS NOT NULL
    AND (
      pg_catalog.length(p_after_exception_key) > 100
      OR p_after_exception_key !~ '^[0-9]{10}:[0-9]{2}:[a-z_]+:[0-9a-f-]{36}$'
    ) THEN
    RAISE EXCEPTION 'invalid_exception_cursor';
  END IF;

  RETURN QUERY
  SELECT
    exception_row.exception_key,
    exception_row.exception_kind,
    exception_row.exception_team_id,
    exception_row.exception_team_code,
    exception_row.exception_status
  FROM quantum_private.list_tonight_exception_index(p_round_id) AS exception_row
  WHERE p_after_exception_key IS NULL
    OR exception_row.exception_key > p_after_exception_key
  ORDER BY exception_row.exception_key
  LIMIT p_limit + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tonight_exception_counts(
  p_round_id UUID
)
RETURNS TABLE (
  exception_kind TEXT,
  exception_count BIGINT
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

  RETURN QUERY
  SELECT exception_row.exception_kind, COUNT(*)::BIGINT
  FROM quantum_private.list_tonight_exception_index(p_round_id) AS exception_row
  GROUP BY exception_row.exception_kind
  ORDER BY exception_row.exception_kind;
END;
$$;

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
    OR p_exception_key !~ '^[0-9]{10}:[0-9]{2}:[a-z_]+:[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'invalid_exception_key';
  END IF;

  RETURN QUERY
  SELECT
    exception_row.exception_key,
    exception_row.exception_kind,
    exception_row.exception_team_id,
    exception_row.exception_team_code,
    exception_row.subject_user_id,
    subject_profile.display_name,
    subject_user.phone,
    exception_row.reporter_user_id,
    reporter_profile.display_name,
    reporter_user.phone,
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
  LEFT JOIN public.profiles AS subject_profile
    ON subject_profile.user_id = exception_row.subject_user_id
  LEFT JOIN public.users AS reporter_user
    ON reporter_user.id = exception_row.reporter_user_id
  LEFT JOIN public.profiles AS reporter_profile
    ON reporter_profile.user_id = exception_row.reporter_user_id
  LEFT JOIN LATERAL (
    SELECT call_attempt.outcome
    FROM quantum_private.tonight_call_attempts AS call_attempt
    WHERE call_attempt.team_id = exception_row.exception_team_id
      AND call_attempt.subject_user_id = exception_row.subject_user_id
    ORDER BY call_attempt.attempted_at DESC, call_attempt.id DESC
    LIMIT 1
  ) AS latest_call ON TRUE
  WHERE exception_row.exception_key = p_exception_key
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.list_tonight_exception_index(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_tonight_active_exceptions(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_settlement_exceptions(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_deposit_terminal_exceptions(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_reconciliation_exceptions(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_service_exceptions(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_tonight_exception_page(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_exception_counts(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_exception_detail(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_get_tonight_exception_page(UUID, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_exception_counts(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_exception_detail(UUID, TEXT)
  TO authenticated;

COMMIT;
