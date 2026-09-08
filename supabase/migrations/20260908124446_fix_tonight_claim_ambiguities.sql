-- Resolve PL/pgSQL output-column ambiguity in three Tonight ON CONFLICT
-- targets. Function signatures, validation, locking, state transitions, and
-- table/index contracts remain unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.service_claim_tonight_deposit_dispositions(
  p_lease_id UUID,
  p_limit INTEGER DEFAULT 100,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
  job_id UUID,
  job_revision INTEGER,
  deposit_id UUID,
  deposit_revision INTEGER,
  team_id UUID,
  attendance_status TEXT,
  attendance_revision INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_lease_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION 'invalid_deposit_disposition_claim';
  END IF;

  -- If the business transaction committed but the worker crashed before its
  -- acknowledgement, the immutable terminal event is authoritative.
  UPDATE quantum_private.tonight_deposit_disposition_jobs AS job
  SET status = 'completed',
      lease_id = NULL,
      lease_expires_at = NULL,
      last_error_code = NULL,
      revision = job.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE job.status <> 'completed'
    AND EXISTS (
      SELECT 1
      FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
      WHERE terminal_event.deposit_id = job.deposit_id
        AND terminal_event.attendance_revision = job.attendance_revision
    );

  INSERT INTO quantum_private.tonight_deposit_disposition_jobs AS job (
    deposit_id,
    attendance_revision
  )
  SELECT
    deposit.id,
    attendance.revision
  FROM public.tonight_partner_service_confirmations AS confirmation
  JOIN public.tonight_teams AS team ON team.id = confirmation.team_id
  JOIN public.tonight_team_members AS member ON member.team_id = team.id
  JOIN public.tonight_attendance AS attendance
    ON attendance.team_id = team.id
   AND attendance.application_id = member.application_id
  JOIN public.tonight_deposits AS deposit
    ON deposit.application_id = member.application_id
  WHERE team.status = 'completed'
    AND deposit.status IN ('paid', 'held')
    AND NOT EXISTS (
      SELECT 1
      FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
      WHERE terminal_event.deposit_id = deposit.id
        AND terminal_event.attendance_revision = attendance.revision
    )
    AND NOT EXISTS (
      SELECT 1
      FROM quantum_private.tonight_deposit_disposition_jobs AS existing_job
      WHERE existing_job.deposit_id = deposit.id
        AND existing_job.attendance_revision = attendance.revision
    )
  ORDER BY confirmation.service_completed_at, team.id, member.seat_number
  LIMIT LEAST(p_limit * 4, 400)
  ON CONFLICT ((job.deposit_id), (job.attendance_revision)) DO NOTHING;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM quantum_private.tonight_deposit_disposition_jobs AS job
    JOIN public.tonight_deposits AS deposit ON deposit.id = job.deposit_id
    JOIN public.tonight_team_members AS member
      ON member.application_id = deposit.application_id
    JOIN public.tonight_teams AS team ON team.id = member.team_id
    JOIN public.tonight_attendance AS attendance
      ON attendance.team_id = team.id
     AND attendance.application_id = member.application_id
     AND attendance.revision = job.attendance_revision
    WHERE job.attempt_count < 8
      AND (
        (job.status IN ('pending', 'failed') AND job.next_attempt_at <= CURRENT_TIMESTAMP)
        OR (job.status = 'processing' AND job.lease_expires_at <= CURRENT_TIMESTAMP)
      )
      AND team.status = 'completed'
      AND deposit.status IN ('paid', 'held')
      AND NOT EXISTS (
        SELECT 1
        FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
        WHERE terminal_event.deposit_id = deposit.id
          AND terminal_event.attendance_revision = attendance.revision
      )
    ORDER BY job.next_attempt_at, job.created_at, job.id
    FOR UPDATE OF job SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE quantum_private.tonight_deposit_disposition_jobs AS job
    SET status = 'processing',
        attempt_count = job.attempt_count + 1,
        lease_id = p_lease_id,
        lease_expires_at = CURRENT_TIMESTAMP
          + pg_catalog.make_interval(secs => p_lease_seconds),
        last_error_code = NULL,
        revision = job.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.*
  )
  SELECT
    claimed.id,
    claimed.revision,
    deposit.id,
    deposit.revision,
    team.id,
    attendance.status,
    attendance.revision
  FROM claimed
  JOIN public.tonight_deposits AS deposit ON deposit.id = claimed.deposit_id
  JOIN public.tonight_team_members AS member
    ON member.application_id = deposit.application_id
  JOIN public.tonight_teams AS team ON team.id = member.team_id
  JOIN public.tonight_attendance AS attendance
    ON attendance.team_id = team.id
   AND attendance.application_id = member.application_id
   AND attendance.revision = claimed.attendance_revision
  ORDER BY claimed.next_attempt_at, claimed.created_at, claimed.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_claim_tonight_settlements(
  p_lease_id UUID,
  p_limit INTEGER DEFAULT 100,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
  job_id UUID,
  job_revision INTEGER,
  team_id UUID,
  confirmed_attendee_count SMALLINT,
  service_completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_lease_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION 'invalid_settlement_claim';
  END IF;

  UPDATE quantum_private.tonight_settlement_jobs AS job
  SET status = 'completed',
      lease_id = NULL,
      lease_expires_at = NULL,
      last_error_code = NULL,
      revision = job.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE job.status <> 'completed'
    AND EXISTS (
      SELECT 1
      FROM public.tonight_settlements AS settlement
      WHERE settlement.team_id = job.team_id
    );

  INSERT INTO quantum_private.tonight_settlement_jobs AS job (team_id)
  SELECT confirmation.team_id
  FROM public.tonight_partner_service_confirmations AS confirmation
  JOIN public.tonight_teams AS team ON team.id = confirmation.team_id
  WHERE team.status = 'completed'
    AND confirmation.confirmed_attendee_count = (
      SELECT COUNT(*)::SMALLINT
      FROM public.tonight_attendance AS attendance
      WHERE attendance.team_id = confirmation.team_id
        AND attendance.status = 'arrived'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.tonight_settlements AS settlement
      WHERE settlement.team_id = confirmation.team_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM quantum_private.tonight_settlement_jobs AS existing_job
      WHERE existing_job.team_id = confirmation.team_id
    )
  ORDER BY confirmation.service_completed_at, confirmation.team_id
  LIMIT LEAST(p_limit * 4, 400)
  ON CONFLICT ((job.team_id)) DO NOTHING;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM quantum_private.tonight_settlement_jobs AS job
    JOIN public.tonight_partner_service_confirmations AS confirmation
      ON confirmation.team_id = job.team_id
    JOIN public.tonight_teams AS team ON team.id = confirmation.team_id
    WHERE job.attempt_count < 8
      AND (
        (job.status IN ('pending', 'failed') AND job.next_attempt_at <= CURRENT_TIMESTAMP)
        OR (job.status = 'processing' AND job.lease_expires_at <= CURRENT_TIMESTAMP)
      )
      AND team.status = 'completed'
      AND confirmation.confirmed_attendee_count = (
        SELECT COUNT(*)::SMALLINT
        FROM public.tonight_attendance AS attendance
        WHERE attendance.team_id = confirmation.team_id
          AND attendance.status = 'arrived'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.tonight_settlements AS settlement
        WHERE settlement.team_id = confirmation.team_id
      )
    ORDER BY job.next_attempt_at, job.created_at, job.id
    FOR UPDATE OF job SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE quantum_private.tonight_settlement_jobs AS job
    SET status = 'processing',
        attempt_count = job.attempt_count + 1,
        lease_id = p_lease_id,
        lease_expires_at = CURRENT_TIMESTAMP
          + pg_catalog.make_interval(secs => p_lease_seconds),
        last_error_code = NULL,
        revision = job.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.*
  )
  SELECT
    claimed.id,
    claimed.revision,
    confirmation.team_id,
    confirmation.confirmed_attendee_count,
    confirmation.service_completed_at
  FROM claimed
  JOIN public.tonight_partner_service_confirmations AS confirmation
    ON confirmation.team_id = claimed.team_id
  ORDER BY claimed.next_attempt_at, claimed.created_at, claimed.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_my_tonight_arrival_help(
  p_team_id UUID,
  p_category TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  request_id UUID,
  team_id UUID,
  team_code TEXT,
  category TEXT,
  status TEXT,
  revision INTEGER,
  requested_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  next_actor TEXT,
  next_action TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_request public.tonight_arrival_help_requests%ROWTYPE;
  v_existing public.tonight_arrival_help_requests%ROWTYPE;
  v_team_code TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_team_id IS NULL OR p_category NOT IN ('entrance', 'team', 'venue') THEN
    RAISE EXCEPTION 'invalid_arrival_help_request';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 8
    OR pg_catalog.length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-arrival-help:' || p_team_id::TEXT || ':' || v_caller::TEXT,
      0
    )
  );

  SELECT team.team_code
  INTO v_team_code
  FROM public.tonight_team_members AS member
  JOIN public.tonight_teams AS team ON team.id = member.team_id
  JOIN public.tonight_rounds AS round_row ON round_row.id = team.round_id
  WHERE member.team_id = p_team_id
    AND member.user_id = v_caller
    AND member.member_status IN ('assigned', 'confirmed')
    AND team.status IN ('revealed', 'in_progress')
    AND CURRENT_TIMESTAMP >= round_row.reveal_at
    AND CURRENT_TIMESTAMP < round_row.starts_at + INTERVAL '2 hours'
  FOR SHARE OF member, team, round_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_arrival_help_not_available';
  END IF;

  SELECT request.*
  INTO v_existing
  FROM public.tonight_arrival_help_requests AS request
  WHERE request.requested_by = v_caller
    AND request.request_idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.team_id <> p_team_id OR v_existing.category <> p_category THEN
      RAISE EXCEPTION 'arrival_help_idempotency_conflict';
    END IF;
    v_request := v_existing;
  ELSE
    INSERT INTO public.tonight_arrival_help_requests AS request (
      team_id,
      requested_by,
      category,
      status,
      request_idempotency_key
    )
    VALUES (
      p_team_id,
      v_caller,
      p_category,
      'requested',
      p_idempotency_key
    )
    ON CONFLICT ((request.team_id), (request.requested_by))
      WHERE request.status IN ('requested', 'acknowledged', 'escalated')
    DO UPDATE SET updated_at = request.updated_at
    RETURNING request.* INTO v_request;

    IF v_request.request_idempotency_key <> p_idempotency_key
      OR v_request.category <> p_category THEN
      RAISE EXCEPTION 'arrival_help_already_active';
    END IF;

    PERFORM quantum_private.write_tonight_audit(
      'arrival_help',
      v_request.id,
      'arrival_help_requested',
      NULL,
      pg_catalog.to_jsonb(v_request),
      p_idempotency_key
    );
  END IF;

  RETURN QUERY SELECT
    v_request.id,
    v_request.team_id,
    v_team_code,
    v_request.category,
    v_request.status,
    v_request.revision,
    v_request.requested_at,
    v_request.updated_at,
    CASE
      WHEN v_request.status IN ('requested', 'acknowledged') THEN 'partner'
      WHEN v_request.status = 'escalated' THEN 'admin'
      ELSE 'user'
    END,
    CASE
      WHEN v_request.status = 'requested' THEN '업장 확인을 기다려 주세요.'
      WHEN v_request.status = 'acknowledged' THEN '업장 안내를 확인해 주세요.'
      WHEN v_request.status = 'escalated' THEN '운영자 확인을 기다려 주세요.'
      WHEN v_request.status = 'resolved' THEN '현장 안내가 완료됐어요.'
      ELSE '요청이 종료됐어요.'
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.service_claim_tonight_deposit_dispositions(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_claim_tonight_settlements(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_my_tonight_arrival_help(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.service_claim_tonight_deposit_dispositions(UUID, INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_claim_tonight_settlements(UUID, INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.request_my_tonight_arrival_help(UUID, TEXT, TEXT)
  TO authenticated;

COMMIT;
