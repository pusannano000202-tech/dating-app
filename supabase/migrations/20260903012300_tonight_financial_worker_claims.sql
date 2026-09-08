-- Prevent one permanently failing deposit disposition or settlement from
-- starving every later row. Jobs are private, leased with SKIP LOCKED, retried
-- with bounded backoff, and reconciled after a crash that follows the business
-- write but precedes job completion.

BEGIN;

CREATE TABLE quantum_private.tonight_deposit_disposition_jobs (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  deposit_id UUID NOT NULL REFERENCES public.tonight_deposits(id) ON DELETE RESTRICT,
  attendance_revision INTEGER NOT NULL CHECK (attendance_revision >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'failed', 'completed', 'dead_letter')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 8),
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error_code TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (deposit_id, attendance_revision),
  CONSTRAINT tonight_deposit_disposition_job_lease_consistency CHECK (
    (status = 'processing' AND lease_id IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND lease_id IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX tonight_deposit_disposition_jobs_due_idx
  ON quantum_private.tonight_deposit_disposition_jobs
  (next_attempt_at, created_at, id)
  WHERE status IN ('pending', 'failed', 'processing');

CREATE TABLE quantum_private.tonight_settlement_jobs (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE REFERENCES public.tonight_teams(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'failed', 'completed', 'dead_letter')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 8),
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error_code TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tonight_settlement_job_lease_consistency CHECK (
    (status = 'processing' AND lease_id IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND lease_id IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX tonight_settlement_jobs_due_idx
  ON quantum_private.tonight_settlement_jobs
  (next_attempt_at, created_at, id)
  WHERE status IN ('pending', 'failed', 'processing');

ALTER TABLE quantum_private.tonight_deposit_disposition_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_private.tonight_settlement_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quantum_private.tonight_deposit_disposition_jobs
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE quantum_private.tonight_settlement_jobs
  FROM PUBLIC, anon, authenticated, service_role;

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

  INSERT INTO quantum_private.tonight_deposit_disposition_jobs (
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
  ON CONFLICT (deposit_id, attendance_revision) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.service_release_tonight_deposit_disposition(
  p_job_id UUID,
  p_lease_id UUID,
  p_expected_revision INTEGER,
  p_error_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_row quantum_private.tonight_deposit_disposition_jobs%ROWTYPE;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_job_id IS NULL OR p_lease_id IS NULL OR p_expected_revision IS NULL
    OR p_expected_revision < 0 OR p_error_code NOT IN (
      'invalid_claim', 'business_transition_failed', 'worker_deadline'
    ) THEN
    RAISE EXCEPTION 'invalid_deposit_disposition_release';
  END IF;

  SELECT job.* INTO job_row
  FROM quantum_private.tonight_deposit_disposition_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE OF job;
  IF NOT FOUND THEN RAISE EXCEPTION 'deposit_disposition_job_not_found'; END IF;
  IF job_row.status = 'completed' THEN RETURN TRUE; END IF;
  IF job_row.status <> 'processing' OR job_row.lease_id <> p_lease_id
    OR job_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'deposit_disposition_lease_conflict';
  END IF;

  UPDATE quantum_private.tonight_deposit_disposition_jobs AS job
  SET status = CASE WHEN job.attempt_count >= 8 THEN 'dead_letter' ELSE 'failed' END,
      lease_id = NULL,
      lease_expires_at = NULL,
      next_attempt_at = CURRENT_TIMESTAMP + pg_catalog.make_interval(
        secs => LEAST(
          (60 * pg_catalog.power(2, GREATEST(job.attempt_count - 1, 0)))::INTEGER,
          1800
        )
      ),
      last_error_code = p_error_code,
      revision = job.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE job.id = p_job_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_complete_tonight_deposit_disposition(
  p_job_id UUID,
  p_lease_id UUID,
  p_expected_revision INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_row quantum_private.tonight_deposit_disposition_jobs%ROWTYPE;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_job_id IS NULL OR p_lease_id IS NULL OR p_expected_revision IS NULL
    OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'invalid_deposit_disposition_completion';
  END IF;

  SELECT job.* INTO job_row
  FROM quantum_private.tonight_deposit_disposition_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE OF job;
  IF NOT FOUND THEN RAISE EXCEPTION 'deposit_disposition_job_not_found'; END IF;
  IF job_row.status = 'completed' THEN RETURN TRUE; END IF;
  IF job_row.status <> 'processing' OR job_row.lease_id <> p_lease_id
    OR job_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'deposit_disposition_lease_conflict';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
    WHERE terminal_event.deposit_id = job_row.deposit_id
      AND terminal_event.attendance_revision = job_row.attendance_revision
  ) THEN
    RAISE EXCEPTION 'deposit_disposition_result_required';
  END IF;

  UPDATE quantum_private.tonight_deposit_disposition_jobs AS job
  SET status = 'completed',
      lease_id = NULL,
      lease_expires_at = NULL,
      last_error_code = NULL,
      revision = job.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE job.id = p_job_id;
  RETURN TRUE;
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

  INSERT INTO quantum_private.tonight_settlement_jobs (team_id)
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
  ON CONFLICT (team_id) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.service_release_tonight_settlement(
  p_job_id UUID,
  p_lease_id UUID,
  p_expected_revision INTEGER,
  p_error_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_row quantum_private.tonight_settlement_jobs%ROWTYPE;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_job_id IS NULL OR p_lease_id IS NULL OR p_expected_revision IS NULL
    OR p_expected_revision < 0 OR p_error_code NOT IN (
      'invalid_claim', 'business_transition_failed', 'worker_deadline'
    ) THEN
    RAISE EXCEPTION 'invalid_settlement_release';
  END IF;

  SELECT job.* INTO job_row
  FROM quantum_private.tonight_settlement_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE OF job;
  IF NOT FOUND THEN RAISE EXCEPTION 'settlement_job_not_found'; END IF;
  IF job_row.status = 'completed' THEN RETURN TRUE; END IF;
  IF job_row.status <> 'processing' OR job_row.lease_id <> p_lease_id
    OR job_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'settlement_lease_conflict';
  END IF;

  UPDATE quantum_private.tonight_settlement_jobs AS job
  SET status = CASE WHEN job.attempt_count >= 8 THEN 'dead_letter' ELSE 'failed' END,
      lease_id = NULL,
      lease_expires_at = NULL,
      next_attempt_at = CURRENT_TIMESTAMP + pg_catalog.make_interval(
        secs => LEAST(
          (60 * pg_catalog.power(2, GREATEST(job.attempt_count - 1, 0)))::INTEGER,
          1800
        )
      ),
      last_error_code = p_error_code,
      revision = job.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE job.id = p_job_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_complete_tonight_settlement(
  p_job_id UUID,
  p_lease_id UUID,
  p_expected_revision INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_row quantum_private.tonight_settlement_jobs%ROWTYPE;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_job_id IS NULL OR p_lease_id IS NULL OR p_expected_revision IS NULL
    OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'invalid_settlement_completion';
  END IF;

  SELECT job.* INTO job_row
  FROM quantum_private.tonight_settlement_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE OF job;
  IF NOT FOUND THEN RAISE EXCEPTION 'settlement_job_not_found'; END IF;
  IF job_row.status = 'completed' THEN RETURN TRUE; END IF;
  IF job_row.status <> 'processing' OR job_row.lease_id <> p_lease_id
    OR job_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'settlement_lease_conflict';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tonight_settlements AS settlement
    WHERE settlement.team_id = job_row.team_id
  ) THEN
    RAISE EXCEPTION 'settlement_result_required';
  END IF;

  UPDATE quantum_private.tonight_settlement_jobs AS job
  SET status = 'completed',
      lease_id = NULL,
      lease_expires_at = NULL,
      last_error_code = NULL,
      revision = job.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE job.id = p_job_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.service_claim_tonight_deposit_dispositions(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_release_tonight_deposit_disposition(UUID, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_complete_tonight_deposit_disposition(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_claim_tonight_settlements(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_release_tonight_settlement(UUID, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_complete_tonight_settlement(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
-- The ordered list RPCs have no lease and are unsafe for active workers. The
-- replacement claim RPCs below are now the only service-role dequeue surface.
REVOKE ALL ON FUNCTION public.service_list_tonight_unfinalized_deposits(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_list_tonight_unsettled_teams(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.service_claim_tonight_deposit_dispositions(UUID, INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_release_tonight_deposit_disposition(UUID, UUID, INTEGER, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_complete_tonight_deposit_disposition(UUID, UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_claim_tonight_settlements(UUID, INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_release_tonight_settlement(UUID, UUID, INTEGER, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_complete_tonight_settlement(UUID, UUID, INTEGER)
  TO service_role;

COMMIT;
