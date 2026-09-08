-- Close only locally-cancelled Toss checkout attempts that the provider has
-- repeatedly and authoritatively reported as absent after the payment gate.
-- A provider timeout, 5xx, or a deposit carrying charged-payment evidence
-- resets this proof and remains on the existing reconciliation path.

BEGIN;

ALTER TABLE quantum_private.tonight_deposit_reconciliation_jobs
  ADD COLUMN provider_not_found_count INTEGER NOT NULL DEFAULT 0
  CHECK (provider_not_found_count BETWEEN 0 AND 3);

CREATE OR REPLACE FUNCTION public.service_record_tonight_reconciliation_not_found(
  p_job_id UUID,
  p_lease_id UUID,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_row quantum_private.tonight_deposit_reconciliation_jobs%ROWTYPE;
  deposit_row public.tonight_deposits%ROWTYPE;
  audit_row quantum_private.tonight_audit_events%ROWTYPE;
  round_deposit_due_at TIMESTAMPTZ;
  v_has_local_cancel_proof BOOLEAN := FALSE;
  v_next_not_found_count INTEGER := 0;
  v_terminal BOOLEAN := FALSE;
  v_revision INTEGER;
  v_after_state JSONB;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_job_id IS NULL OR p_lease_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision < 1
    OR p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'invalid_reconciliation_not_found';
  END IF;

  SELECT audit.* INTO audit_row
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'deposit_reconciliation'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF audit_row.entity_id <> p_job_id
      OR audit_row.action <> 'deposit_provider_not_found_recorded'
      OR (audit_row.before_state ->> 'revision')::INTEGER <> p_expected_revision
      OR (audit_row.before_state ->> 'lease_id')::UUID <> p_lease_id THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN audit_row.after_state;
  END IF;

  SELECT job.* INTO job_row
  FROM quantum_private.tonight_deposit_reconciliation_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE OF job;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation_job_not_found'; END IF;

  -- An identical RPC retry can wait behind the first transaction. Recheck its
  -- immutable result after acquiring the job lock before comparing revision.
  SELECT audit.* INTO audit_row
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'deposit_reconciliation'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF audit_row.entity_id <> p_job_id
      OR audit_row.action <> 'deposit_provider_not_found_recorded'
      OR (audit_row.before_state ->> 'revision')::INTEGER <> p_expected_revision
      OR (audit_row.before_state ->> 'lease_id')::UUID <> p_lease_id THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN audit_row.after_state;
  END IF;

  IF job_row.status <> 'processing'
    OR job_row.lease_id <> p_lease_id
    OR job_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  SELECT deposit.* INTO deposit_row
  FROM public.tonight_deposits AS deposit
  WHERE deposit.id = job_row.deposit_id
  FOR UPDATE OF deposit;
  IF NOT FOUND THEN RAISE EXCEPTION 'deposit_not_found'; END IF;

  SELECT round_row.deposit_due_at INTO round_deposit_due_at
  FROM public.tonight_applications AS application_row
  JOIN public.tonight_rounds AS round_row
    ON round_row.id = application_row.round_id
  WHERE application_row.id = deposit_row.application_id
    AND application_row.user_id = deposit_row.user_id;
  IF NOT FOUND OR round_deposit_due_at IS NULL THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;

  -- Provider absence is never sufficient by itself. The user-owned cancel
  -- callback must already have produced the immutable local event, and no
  -- charged-payment hash may have appeared while this worker was in flight.
  v_has_local_cancel_proof := deposit_row.status = 'cancelled'
    AND deposit_row.provider_payment_key_hash IS NULL
    AND EXISTS (
      SELECT 1
      FROM quantum_private.tonight_deposit_result_events AS result_event
      WHERE result_event.deposit_id = deposit_row.id
        AND result_event.application_id = deposit_row.application_id
        AND result_event.user_id = deposit_row.user_id
        AND result_event.amount = deposit_row.amount
        AND result_event.result_status = 'cancelled'
        AND result_event.provider_order_id = deposit_row.provider_order_id
        AND result_event.provider_payment_key_hash IS NULL
    );

  IF v_has_local_cancel_proof THEN
    v_next_not_found_count := LEAST(
      job_row.provider_not_found_count + 1,
      3
    );
  END IF;
  v_terminal := v_has_local_cancel_proof
    AND CURRENT_TIMESTAMP >= round_deposit_due_at + INTERVAL '15 minutes'
    AND job_row.provider_not_found_count + 1 >= 3;

  IF v_terminal THEN
    UPDATE quantum_private.tonight_deposit_reconciliation_jobs AS job
    SET status = 'completed',
        outcome = 'no_charge',
        provider_not_found_count = v_next_not_found_count,
        lease_id = NULL,
        lease_expires_at = NULL,
        next_attempt_at = CURRENT_TIMESTAMP,
        last_error_code = NULL,
        finalize_idempotency_key = p_idempotency_key,
        completed_at = CURRENT_TIMESTAMP,
        revision = job.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE job.id = p_job_id
      AND job.revision = p_expected_revision
    RETURNING job.revision INTO v_revision;
  ELSE
    UPDATE quantum_private.tonight_deposit_reconciliation_jobs AS job
    SET status = 'failed',
        outcome = NULL,
        -- A locally cancelled checkout must survive until the post-gate grace
        -- check instead of exhausting the generic twenty-attempt ceiling.
        attempt_count = CASE
          WHEN v_has_local_cancel_proof THEN LEAST(job.attempt_count, 17)
          ELSE job.attempt_count
        END,
        provider_not_found_count = v_next_not_found_count,
        lease_id = NULL,
        lease_expires_at = NULL,
        next_attempt_at = CASE
          WHEN v_has_local_cancel_proof
            AND CURRENT_TIMESTAMP < round_deposit_due_at + INTERVAL '15 minutes'
          THEN round_deposit_due_at + INTERVAL '15 minutes'
          WHEN v_has_local_cancel_proof
          THEN CURRENT_TIMESTAMP + INTERVAL '5 minutes'
          ELSE CURRENT_TIMESTAMP + INTERVAL '60 seconds'
        END,
        last_error_code = 'provider_order_not_found',
        revision = job.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE job.id = p_job_id
      AND job.revision = p_expected_revision
    RETURNING job.revision INTO v_revision;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;

  v_after_state := pg_catalog.jsonb_build_object(
    'terminal', v_terminal,
    'status', CASE WHEN v_terminal THEN 'completed' ELSE 'failed' END,
    'outcome', CASE WHEN v_terminal THEN 'no_charge' ELSE NULL END,
    'disposition', CASE WHEN v_terminal THEN 'deposit_never_authorized' ELSE NULL END,
    'provider_not_found_count', v_next_not_found_count,
    'revision', v_revision
  );
  PERFORM quantum_private.write_tonight_audit(
    'deposit_reconciliation',
    p_job_id,
    'deposit_provider_not_found_recorded',
    pg_catalog.jsonb_build_object(
      'status', job_row.status,
      'provider_not_found_count', job_row.provider_not_found_count,
      'lease_id', job_row.lease_id,
      'revision', job_row.revision
    ),
    v_after_state,
    p_idempotency_key
  );
  RETURN v_after_state;
END;
$$;

-- A timeout, 5xx, rate limit, or local persistence failure breaks the
-- consecutive exact-404 chain. It must never contribute to no-charge proof.
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
  FOR UPDATE OF job;
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
      provider_not_found_count = 0,
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

-- A human-authorized retry starts a fresh evidence sequence. No previous
-- provider-absence count is carried into the new attempt.
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
    RAISE EXCEPTION 'stale_revision';
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
      provider_not_found_count = 0,
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
      'provider_not_found_count', 0,
      'revision', v_new_revision
    ),
    p_idempotency_key
  );
  RETURN v_new_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.service_record_tonight_reconciliation_not_found(UUID, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_release_tonight_deposit_reconciliation(UUID, UUID, INTEGER, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_retry_tonight_reconciliation(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.service_record_tonight_reconciliation_not_found(UUID, UUID, INTEGER, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_release_tonight_deposit_reconciliation(UUID, UUID, INTEGER, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_retry_tonight_reconciliation(UUID, INTEGER, TEXT)
  TO authenticated;

COMMIT;
