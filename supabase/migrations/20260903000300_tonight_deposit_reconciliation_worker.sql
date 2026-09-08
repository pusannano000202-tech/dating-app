-- Durable recovery for a Toss approval whose browser callback or the first DB
-- record attempt was interrupted. Only provider order IDs and hashed evidence
-- enter the ledger; raw provider payment keys and payloads are never stored.

BEGIN;

CREATE TABLE quantum_private.tonight_deposit_reconciliation_jobs (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  deposit_id UUID NOT NULL UNIQUE
    REFERENCES public.tonight_deposits(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  outcome TEXT CHECK (outcome IN ('reconciled', 'no_charge', 'manual_review')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 20),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error_code TEXT,
  finalize_idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  CONSTRAINT tonight_reconciliation_job_lease_consistency CHECK (
    (status = 'processing' AND lease_id IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND lease_id IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT tonight_reconciliation_job_result_consistency CHECK (
    (status = 'completed' AND outcome IN ('reconciled', 'no_charge') AND completed_at IS NOT NULL)
    OR (status = 'failed' AND (outcome IS NULL OR outcome = 'manual_review'))
    OR (status IN ('pending', 'processing') AND outcome IS NULL AND completed_at IS NULL)
  )
);

CREATE INDEX tonight_deposit_reconciliation_claim_idx
  ON quantum_private.tonight_deposit_reconciliation_jobs (
    next_attempt_at,
    lease_expires_at,
    created_at
  ) WHERE status IN ('pending', 'processing', 'failed');

ALTER TABLE quantum_private.tonight_deposit_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quantum_private.tonight_deposit_reconciliation_jobs
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION quantum_private.enqueue_tonight_deposit_reconciliation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.provider_order_id IS NULL OR pg_catalog.btrim(NEW.provider_order_id) = '' THEN
    RAISE EXCEPTION 'provider_order_id_required';
  END IF;
  INSERT INTO quantum_private.tonight_deposit_reconciliation_jobs (deposit_id)
  VALUES (NEW.id)
  ON CONFLICT (deposit_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tonight_deposit_reconciliation_enqueue
  AFTER INSERT ON public.tonight_deposits
  FOR EACH ROW EXECUTE FUNCTION quantum_private.enqueue_tonight_deposit_reconciliation();

-- Backfill any locally prepared orders created between the ledger migration
-- and this recovery migration.
INSERT INTO quantum_private.tonight_deposit_reconciliation_jobs (deposit_id)
SELECT deposit.id
FROM public.tonight_deposits AS deposit
WHERE deposit.provider_order_id IS NOT NULL
ON CONFLICT (deposit_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.service_claim_tonight_deposit_reconciliations(
  p_lease_id UUID,
  p_limit INTEGER DEFAULT 15,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
  job_id UUID,
  deposit_id UUID,
  application_id UUID,
  user_id UUID,
  amount INTEGER,
  deposit_status TEXT,
  provider_order_id TEXT,
  job_revision INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_lease_id IS NULL
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_reconciliation_claim';
  END IF;

  -- A provider callback can arrive after a no-charge lookup completed. The
  -- deposit transition already has an immutable result audit; reopen the
  -- derived provider job so the later charge evidence cannot be stranded.
  -- This repair runs before both evidence cleanup and leasing, and therefore
  -- remains idempotent across overlapping cron invocations.
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
  FROM public.tonight_deposits AS deposit
  WHERE deposit.id = job.deposit_id
    AND deposit.status IN ('paid', 'held', 'reconciliation_required', 'refund_requested')
    AND job.status = 'completed'
    AND job.outcome = 'no_charge';

  -- The normal browser callback may have completed before this recovery job
  -- was claimed. Its immutable deposit-result event is the authoritative proof.
  UPDATE quantum_private.tonight_deposit_reconciliation_jobs AS job
  SET status = 'completed',
      outcome = 'reconciled',
      lease_id = NULL,
      lease_expires_at = NULL,
      completed_at = CURRENT_TIMESTAMP,
      revision = job.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  FROM public.tonight_deposits AS deposit
  WHERE deposit.id = job.deposit_id
    AND (
      job.status IN ('pending', 'failed')
      OR (job.status = 'processing' AND job.lease_expires_at <= CURRENT_TIMESTAMP)
    )
    AND deposit.status IN ('paid', 'held', 'refund_requested', 'refunded', 'forfeited')
    -- A lifecycle timeout may move reconciliation_required to refund_requested
    -- before Toss evidence has been recovered. The status alone is therefore
    -- not proof that this provider lookup job can be discarded.
    AND (
      EXISTS (
        SELECT 1
        FROM quantum_private.tonight_deposit_result_events AS result_event
        WHERE result_event.deposit_id = deposit.id
          AND result_event.result_status IN ('paid', 'held')
          AND result_event.provider_order_id = deposit.provider_order_id
          AND result_event.provider_payment_key_hash = deposit.provider_payment_key_hash
      )
      OR EXISTS (
        SELECT 1
        FROM public.tonight_deposit_refund_requests AS refund_request
        WHERE refund_request.deposit_id = deposit.id
          AND refund_request.status = 'completed'
          AND refund_request.provider_order_id = deposit.provider_order_id
          AND refund_request.provider_payment_key_hash = deposit.provider_payment_key_hash
          AND refund_request.refunded_amount = deposit.amount
      )
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM quantum_private.tonight_deposit_reconciliation_jobs AS job
    JOIN public.tonight_deposits AS deposit ON deposit.id = job.deposit_id
    WHERE deposit.status IN ('pending', 'reconciliation_required', 'cancelled', 'refund_requested')
      AND job.attempt_count < 20
      AND (
        (job.status IN ('pending', 'failed') AND job.next_attempt_at <= CURRENT_TIMESTAMP)
        OR (job.status = 'processing' AND job.lease_expires_at <= CURRENT_TIMESTAMP)
      )
    ORDER BY job.next_attempt_at, job.created_at, job.id
    FOR UPDATE OF job SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE quantum_private.tonight_deposit_reconciliation_jobs AS job
    SET status = 'processing',
        outcome = NULL,
        lease_id = p_lease_id,
        lease_expires_at = CURRENT_TIMESTAMP
          + pg_catalog.make_interval(secs => p_lease_seconds),
        attempt_count = job.attempt_count + 1,
        revision = job.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.*
  )
  SELECT
    claimed.id,
    deposit.id,
    deposit.application_id,
    deposit.user_id,
    deposit.amount,
    deposit.status,
    deposit.provider_order_id,
    claimed.revision
  FROM claimed
  JOIN public.tonight_deposits AS deposit ON deposit.id = claimed.deposit_id
  ORDER BY claimed.created_at, claimed.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_release_tonight_deposit_reconciliation(
  p_job_id UUID,
  p_lease_id UUID,
  p_expected_revision INTEGER,
  p_error_code TEXT,
  p_retry_after_seconds INTEGER DEFAULT 60
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_row quantum_private.tonight_deposit_reconciliation_jobs%ROWTYPE;
  v_revision INTEGER;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_job_id IS NULL OR p_lease_id IS NULL OR p_expected_revision IS NULL
    OR p_error_code NOT IN ('provider_unavailable', 'record_unavailable')
    OR p_retry_after_seconds NOT BETWEEN 30 AND 3600 THEN
    RAISE EXCEPTION 'invalid_reconciliation_release';
  END IF;

  SELECT job.* INTO job_row
  FROM quantum_private.tonight_deposit_reconciliation_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;
  IF NOT FOUND OR job_row.status <> 'processing'
    OR job_row.lease_id <> p_lease_id
    OR job_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  UPDATE quantum_private.tonight_deposit_reconciliation_jobs AS job
  SET status = 'failed',
      lease_id = NULL,
      lease_expires_at = NULL,
      next_attempt_at = CURRENT_TIMESTAMP
        + pg_catalog.make_interval(secs => p_retry_after_seconds),
      last_error_code = p_error_code,
      revision = job.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE job.id = p_job_id
  RETURNING job.revision INTO v_revision;

  IF job_row.attempt_count >= 20 THEN
    PERFORM quantum_private.write_tonight_audit(
      'deposit_reconciliation',
      job_row.id,
      'deposit_reconciliation_retry_exhausted',
      pg_catalog.to_jsonb(job_row),
      pg_catalog.jsonb_build_object(
        'status', 'failed',
        'attempt_count', job_row.attempt_count,
        'error_code', p_error_code,
        'revision', v_revision
      ),
      'tonight-reconciliation-exhausted-' || job_row.id::TEXT
    );
  END IF;
  RETURN v_revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_finalize_tonight_deposit_reconciliation(
  p_job_id UUID,
  p_lease_id UUID,
  p_expected_revision INTEGER,
  p_outcome TEXT,
  p_error_code TEXT,
  p_idempotency_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_row quantum_private.tonight_deposit_reconciliation_jobs%ROWTYPE;
  deposit_row public.tonight_deposits%ROWTYPE;
  v_revision INTEGER;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_job_id IS NULL OR p_lease_id IS NULL OR p_expected_revision IS NULL
    OR p_outcome NOT IN ('reconciled', 'no_charge', 'manual_review')
    OR (p_outcome = 'manual_review' AND p_error_code NOT IN (
      'provider_evidence_mismatch', 'provider_request_rejected',
      'provider_cancelled_state_conflict'
    ))
    OR (p_outcome <> 'manual_review' AND p_error_code IS NOT NULL)
    OR p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'invalid_reconciliation_finalize';
  END IF;

  SELECT job.* INTO job_row
  FROM quantum_private.tonight_deposit_reconciliation_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation_job_not_found'; END IF;
  IF job_row.finalize_idempotency_key = p_idempotency_key THEN
    RETURN job_row.revision;
  END IF;
  IF job_row.status <> 'processing' OR job_row.lease_id <> p_lease_id
    OR job_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  SELECT deposit.* INTO deposit_row
  FROM public.tonight_deposits AS deposit
  WHERE deposit.id = job_row.deposit_id
  FOR UPDATE;
  IF p_outcome = 'no_charge'
    AND (
      deposit_row.status <> 'cancelled'
      OR NOT EXISTS (
        SELECT 1
        FROM quantum_private.tonight_deposit_result_events AS result_event
        WHERE result_event.deposit_id = deposit_row.id
          AND result_event.result_status = 'cancelled'
          AND result_event.provider_order_id = deposit_row.provider_order_id
      )
    ) THEN
    RAISE EXCEPTION 'deposit_no_charge_not_recorded';
  END IF;
  IF p_outcome = 'reconciled'
    AND deposit_row.status NOT IN ('paid', 'held', 'refund_requested', 'refunded') THEN
    RAISE EXCEPTION 'deposit_reconciliation_not_recorded';
  END IF;

  UPDATE quantum_private.tonight_deposit_reconciliation_jobs AS job
  SET status = CASE WHEN p_outcome = 'manual_review' THEN 'failed' ELSE 'completed' END,
      outcome = p_outcome,
      attempt_count = CASE WHEN p_outcome = 'manual_review' THEN 20 ELSE job.attempt_count END,
      lease_id = NULL,
      lease_expires_at = NULL,
      last_error_code = p_error_code,
      finalize_idempotency_key = p_idempotency_key,
      completed_at = CASE WHEN p_outcome = 'manual_review' THEN NULL ELSE CURRENT_TIMESTAMP END,
      revision = job.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE job.id = p_job_id
  RETURNING job.revision INTO v_revision;

  PERFORM quantum_private.write_tonight_audit(
    'deposit_reconciliation',
    job_row.id,
    'deposit_reconciliation_finalized',
    pg_catalog.to_jsonb(job_row),
    pg_catalog.jsonb_build_object(
      'status', CASE WHEN p_outcome = 'manual_review' THEN 'failed' ELSE 'completed' END,
      'outcome', p_outcome,
      'error_code', p_error_code,
      'revision', v_revision
    ),
    p_idempotency_key
  );
  RETURN v_revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tonight_reconciliation_exceptions(
  p_round_id UUID
)
RETURNS TABLE (
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
  refund_request_revision INTEGER
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
  SELECT
    'deposit_reconciliation_failed'::TEXT,
    team.id,
    team.team_code,
    deposit.user_id,
    profile.display_name,
    user_row.phone,
    NULL::UUID,
    NULL::TEXT,
    NULL::TEXT,
    NULL::UUID,
    NULL::TEXT,
    job.last_error_code,
    NULL::UUID,
    NULL::INTEGER
  FROM quantum_private.tonight_deposit_reconciliation_jobs AS job
  JOIN public.tonight_deposits AS deposit ON deposit.id = job.deposit_id
  JOIN public.tonight_team_members AS member
    ON member.application_id = deposit.application_id
  JOIN public.tonight_teams AS team ON team.id = member.team_id
  JOIN public.users AS user_row ON user_row.id = deposit.user_id
  LEFT JOIN public.profiles AS profile ON profile.user_id = deposit.user_id
  WHERE team.round_id = p_round_id
    AND job.status = 'failed'
    AND job.attempt_count >= 20
  ORDER BY team.team_code, deposit.user_id;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.enqueue_tonight_deposit_reconciliation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_claim_tonight_deposit_reconciliations(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_release_tonight_deposit_reconciliation(UUID, UUID, INTEGER, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_finalize_tonight_deposit_reconciliation(UUID, UUID, INTEGER, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_reconciliation_exceptions(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.service_claim_tonight_deposit_reconciliations(UUID, INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_release_tonight_deposit_reconciliation(UUID, UUID, INTEGER, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_finalize_tonight_deposit_reconciliation(UUID, UUID, INTEGER, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_reconciliation_exceptions(UUID)
  TO authenticated;

COMMIT;
