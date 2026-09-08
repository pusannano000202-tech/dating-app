-- Keep caller-owned unresolved payment journeys visible independently of
-- future participation eligibility, and provide a revisioned super-admin
-- recovery path for exhausted provider reconciliation jobs.

BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.is_tonight_financial_recovery_application(
  p_application_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tonight_applications AS application_row
    JOIN public.tonight_deposits AS deposit
      ON deposit.application_id = application_row.id
    LEFT JOIN public.tonight_deposit_refund_requests AS refund_request
      ON refund_request.deposit_id = deposit.id
    LEFT JOIN quantum_private.tonight_deposit_reconciliation_jobs AS reconciliation_job
      ON reconciliation_job.deposit_id = deposit.id
    WHERE application_row.id = p_application_id
      AND application_row.user_id = p_user_id
      AND (
        deposit.status IN (
          'pending', 'paid', 'held', 'refund_requested', 'reconciliation_required'
        )
        OR refund_request.status IN ('requested', 'approved', 'processing', 'failed')
        OR reconciliation_job.status IN ('pending', 'processing', 'failed')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_current_tonight_round()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_round public.tonight_rounds%ROWTYPE;
  v_financial_recovery BOOLEAN := FALSE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Start from the caller's indexed application history. An unresolved owned
  -- financial record has no age or round-start cutoff and does not require a
  -- still-active market membership.
  SELECT round_row.* INTO v_round
  FROM public.tonight_applications AS application_row
  JOIN public.tonight_rounds AS round_row
    ON round_row.id = application_row.round_id
  WHERE application_row.user_id = v_caller
    AND round_row.market_code = 'PNU'
    AND quantum_private.is_tonight_financial_recovery_application(
      application_row.id,
      v_caller
    )
  ORDER BY application_row.submitted_at DESC, round_row.starts_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_financial_recovery := TRUE;
  END IF;

  IF NOT FOUND THEN
    SELECT round_row.* INTO v_round
    FROM public.tonight_rounds AS round_row
    JOIN public.tonight_market_memberships AS membership
      ON membership.market_code = round_row.market_code
     AND membership.user_id = v_caller
     AND membership.revoked_at IS NULL
    WHERE round_row.status NOT IN ('completed', 'cancelled')
      AND round_row.market_code = 'PNU'
      AND round_row.starts_at > CURRENT_TIMESTAMP - INTERVAL '2 hours'
    ORDER BY round_row.starts_at ASC
    LIMIT 1;
  END IF;

  -- Preserve the existing short post-round receipt view, but only after every
  -- unresolved record and every current eligible round has been considered.
  IF NOT FOUND THEN
    SELECT round_row.* INTO v_round
    FROM public.tonight_rounds AS round_row
    JOIN public.tonight_applications AS application_row
      ON application_row.round_id = round_row.id
     AND application_row.user_id = v_caller
    JOIN public.tonight_market_memberships AS membership
      ON membership.market_code = round_row.market_code
     AND membership.user_id = v_caller
     AND membership.revoked_at IS NULL
    WHERE round_row.status IN ('completed', 'cancelled')
      AND round_row.market_code = 'PNU'
      AND round_row.starts_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    ORDER BY round_row.starts_at DESC
    LIMIT 1;
  END IF;

  IF v_round.id IS NULL THEN RETURN NULL; END IF;
  RETURN quantum_private.build_tonight_round_payload(v_round.id, v_caller)
    || pg_catalog.jsonb_build_object('financial_recovery', v_financial_recovery);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_tonight_journey(
  p_round_id UUID
)
RETURNS TABLE (
  journey_round_id UUID,
  application_id UUID,
  application_status TEXT,
  deposit_status TEXT,
  deposit_revision INTEGER,
  refund_status TEXT,
  refund_request_revision INTEGER,
  attendance_status TEXT,
  attendance_revision INTEGER,
  team_id UUID,
  team_code TEXT,
  team_status TEXT,
  activity_title TEXT,
  activity_duration_minutes SMALLINT,
  reveal_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  can_reveal_exact_venue BOOLEAN,
  can_mark_arrival BOOLEAN,
  venue_display_name TEXT,
  venue_address TEXT,
  venue_address_evidence TEXT,
  venue_address_verified_at TIMESTAMPTZ,
  venue_latitude DOUBLE PRECISION,
  venue_longitude DOUBLE PRECISION,
  venue_coordinate_evidence TEXT,
  venue_coordinates_verified_at TIMESTAMPTZ,
  venue_naver_url TEXT,
  venue_kakao_url TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  application_row public.tonight_applications%ROWTYPE;
  deposit_row public.tonight_deposits%ROWTYPE;
  refund_row public.tonight_deposit_refund_requests%ROWTYPE;
  attendance_row public.tonight_attendance%ROWTYPE;
  team public.tonight_teams%ROWTYPE;
  round_row public.tonight_rounds%ROWTYPE;
  v_activity_title TEXT;
  v_activity_duration_minutes SMALLINT;
  v_snapshot public.venue_snapshots%ROWTYPE;
  v_has_active_membership BOOLEAN := FALSE;
  v_recovery_only BOOLEAN := FALSE;
  v_can_reveal BOOLEAN := FALSE;
  v_can_mark_arrival BOOLEAN := FALSE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_round_id IS NULL THEN RAISE EXCEPTION 'round_id_required'; END IF;

  SELECT round_value.* INTO round_row
  FROM public.tonight_rounds AS round_value
  WHERE round_value.id = p_round_id
    AND round_value.market_code = 'PNU';
  IF NOT FOUND THEN RAISE EXCEPTION 'tonight_round_not_found'; END IF;

  -- Ownership is established before the participation-membership check. This
  -- exception never permits another user's journey or a new application.
  SELECT application_value.* INTO application_row
  FROM public.tonight_applications AS application_value
  WHERE application_value.round_id = p_round_id
    AND application_value.user_id = v_caller;
  IF NOT FOUND THEN RAISE EXCEPTION 'tonight_application_not_found'; END IF;

  SELECT deposit.* INTO deposit_row
  FROM public.tonight_deposits AS deposit
  WHERE deposit.application_id = application_row.id;

  IF deposit_row.id IS NOT NULL THEN
    SELECT request.* INTO refund_row
    FROM public.tonight_deposit_refund_requests AS request
    WHERE request.deposit_id = deposit_row.id;
  END IF;

  v_has_active_membership := EXISTS (
    SELECT 1
    FROM public.tonight_market_memberships AS membership
    WHERE membership.market_code = round_row.market_code
      AND membership.user_id = v_caller
      AND membership.revoked_at IS NULL
  );
  IF NOT v_has_active_membership
    AND NOT quantum_private.is_tonight_financial_recovery_application(
      application_row.id,
      v_caller
    ) THEN
    RAISE EXCEPTION 'tonight_market_membership_required';
  END IF;
  v_recovery_only := NOT v_has_active_membership;

  SELECT attendance.* INTO attendance_row
  FROM public.tonight_attendance AS attendance
  WHERE attendance.application_id = application_row.id;

  SELECT team_value.* INTO team
  FROM public.tonight_team_members AS member
  JOIN public.tonight_teams AS team_value ON team_value.id = member.team_id
  WHERE member.application_id = application_row.id
    AND member.user_id = v_caller;

  IF team.id IS NOT NULL THEN
    SELECT activity.title, activity.duration_minutes
    INTO v_activity_title, v_activity_duration_minutes
    FROM public.tonight_round_activities AS activity
    WHERE activity.id = team.activity_id;

    SELECT snapshot.* INTO v_snapshot
    FROM public.tonight_partner_acceptances AS acceptance
    JOIN public.venue_snapshots AS snapshot ON snapshot.id = acceptance.venue_snapshot_id
    WHERE acceptance.team_id = team.id;

    v_can_reveal := NOT v_recovery_only
      AND (
        team.status = 'accepted'
        OR team.status IN ('revealed', 'in_progress', 'completed')
      )
      AND CURRENT_TIMESTAMP >= round_row.reveal_at
      AND v_snapshot.id IS NOT NULL;

    v_can_mark_arrival := NOT v_recovery_only
      AND v_can_reveal
      AND attendance_row.status = 'pending'
      AND CURRENT_TIMESTAMP >= round_row.arrival_at
      AND CURRENT_TIMESTAMP < round_row.starts_at + INTERVAL '2 hours';
  END IF;

  RETURN QUERY
  SELECT
    round_row.id,
    application_row.id,
    application_row.status,
    deposit_row.status,
    deposit_row.revision,
    refund_row.status,
    refund_row.revision,
    attendance_row.status,
    attendance_row.revision,
    team.id,
    CASE WHEN v_can_reveal THEN team.team_code ELSE NULL END,
    team.status,
    v_activity_title,
    v_activity_duration_minutes,
    round_row.reveal_at,
    round_row.starts_at,
    v_can_reveal,
    v_can_mark_arrival,
    CASE WHEN v_can_reveal THEN v_snapshot.display_name ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.address ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.address_evidence ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.address_verified_at ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.latitude ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.longitude ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.coordinate_evidence ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.coordinates_verified_at ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.naver_url ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.kakao_url ELSE NULL END;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_tonight_reconciliation_failures(
  p_round_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  job_id UUID,
  job_revision INTEGER,
  team_id UUID,
  team_code TEXT,
  job_status TEXT,
  job_outcome TEXT,
  attempt_count INTEGER,
  error_code TEXT,
  updated_at TIMESTAMPTZ
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
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_round_id IS NULL THEN RAISE EXCEPTION 'round_id_required'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  RETURN QUERY
  SELECT
    job.id,
    job.revision,
    team.id,
    team.team_code,
    job.status,
    job.outcome,
    job.attempt_count,
    job.last_error_code,
    job.updated_at
  FROM quantum_private.tonight_deposit_reconciliation_jobs AS job
  JOIN public.tonight_deposits AS deposit ON deposit.id = job.deposit_id
  JOIN public.tonight_team_members AS member
    ON member.application_id = deposit.application_id
  JOIN public.tonight_teams AS team ON team.id = member.team_id
  WHERE team.round_id = p_round_id
    AND job.status = 'failed'
    AND (job.attempt_count >= 20 OR job.outcome = 'manual_review')
  ORDER BY job.updated_at DESC, job.id
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_retry_tonight_reconciliation(
  p_job_id UUID,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  job_row quantum_private.tonight_deposit_reconciliation_jobs%ROWTYPE;
  audit_row quantum_private.tonight_audit_events%ROWTYPE;
  v_new_revision INTEGER;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_job_id IS NULL THEN RAISE EXCEPTION 'reconciliation_job_id_required'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  SELECT audit.* INTO audit_row
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'deposit_reconciliation'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF audit_row.entity_id <> p_job_id
      OR audit_row.action <> 'deposit_reconciliation_retry_requested'
      OR (audit_row.before_state ->> 'revision')::INTEGER <> p_expected_revision THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN (audit_row.after_state ->> 'revision')::INTEGER;
  END IF;

  SELECT job.* INTO job_row
  FROM quantum_private.tonight_deposit_reconciliation_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE OF job;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation_job_not_found'; END IF;

  -- A concurrent replay may have waited on the row lock after its initial
  -- audit lookup. Re-read the immutable idempotency record before comparing
  -- revisions so the same request returns the original result.
  SELECT audit.* INTO audit_row
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'deposit_reconciliation'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF audit_row.entity_id <> p_job_id
      OR audit_row.action <> 'deposit_reconciliation_retry_requested'
      OR (audit_row.before_state ->> 'revision')::INTEGER <> p_expected_revision THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN (audit_row.after_state ->> 'revision')::INTEGER;
  END IF;

  IF job_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision'
      USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || job_row.revision;
  END IF;
  IF job_row.status <> 'failed'
    OR job_row.attempt_count < 20
    OR NOT EXISTS (
      SELECT 1
      FROM public.tonight_deposits AS deposit
      WHERE deposit.id = job_row.deposit_id
        AND deposit.status IN ('pending', 'reconciliation_required', 'cancelled', 'refund_requested')
    ) THEN
    RAISE EXCEPTION 'reconciliation_job_not_retryable';
  END IF;

  UPDATE quantum_private.tonight_deposit_reconciliation_jobs AS job
  SET status = 'pending',
      outcome = NULL,
      attempt_count = 0,
      lease_id = NULL,
      lease_expires_at = NULL,
      next_attempt_at = CURRENT_TIMESTAMP,
      last_error_code = NULL,
      finalize_idempotency_key = NULL,
      completed_at = NULL,
      revision = job.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE job.id = p_job_id
    AND job.revision = p_expected_revision
  RETURNING job.revision INTO v_new_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;

  PERFORM quantum_private.write_tonight_audit(
    'deposit_reconciliation',
    p_job_id,
    'deposit_reconciliation_retry_requested',
    pg_catalog.to_jsonb(job_row),
    pg_catalog.jsonb_build_object(
      'status', 'pending',
      'attempt_count', 0,
      'revision', v_new_revision
    ),
    p_idempotency_key
  );
  RETURN v_new_revision;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.is_tonight_financial_recovery_application(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_current_tonight_round()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_tonight_journey(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_list_tonight_reconciliation_failures(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_retry_tonight_reconciliation(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_current_tonight_round() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tonight_journey(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_list_tonight_reconciliation_failures(UUID, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_retry_tonight_reconciliation(UUID, INTEGER, TEXT)
  TO authenticated;

COMMIT;
