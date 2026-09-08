-- Irrecoverable provider evidence failures must become operator-visible on the
-- first attempt. Retryable transport failures continue to use the bounded
-- release/backoff RPC defined by the Tonight lifecycle migration.

BEGIN;

CREATE OR REPLACE FUNCTION public.service_dead_letter_tonight_refund_request(
  p_request_id UUID,
  p_lease_id UUID,
  p_expected_revision INTEGER,
  p_error TEXT,
  p_idempotency_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.tonight_deposit_refund_requests%ROWTYPE;
  v_existing quantum_private.tonight_audit_events%ROWTYPE;
  v_before JSONB;
  v_revision INTEGER;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_request_id IS NULL OR p_lease_id IS NULL THEN
    RAISE EXCEPTION 'lease_identity_required';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'invalid_expected_revision';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  -- Only failures that cannot be repaired by waiting or retrying are accepted.
  -- This prevents a transient provider outage from being accidentally buried.
  IF p_error NOT IN (
    'invalid_refund_claim',
    'provider_evidence_mismatch',
    'provider_request_rejected'
  ) THEN
    RAISE EXCEPTION 'refund_failure_not_irrecoverable';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-refund-dead-letter-key:' || pg_catalog.btrim(p_idempotency_key),
      0
    )
  );

  SELECT audit.*
  INTO v_existing
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'refund_request'
    AND audit.idempotency_key = pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing.entity_id <> p_request_id
      OR v_existing.action <> 'refund_worker_dead_lettered'
      OR v_existing.actor_user_id IS NOT NULL
      OR v_existing.actor_kind <> 'service'
      OR COALESCE(v_existing.before_state ->> 'settlement_lease_id', '')
        <> p_lease_id::TEXT
      OR COALESCE((v_existing.before_state ->> 'revision')::INTEGER, -1)
        <> p_expected_revision
      OR COALESCE(v_existing.after_state ->> 'error', '') <> p_error
      OR COALESCE((v_existing.after_state ->> 'revision')::INTEGER, -1) < 0 THEN
      RAISE EXCEPTION 'refund_dead_letter_idempotency_conflict';
    END IF;
    RETURN (v_existing.after_state ->> 'revision')::INTEGER;
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.tonight_deposit_refund_requests AS request
  WHERE request.id = p_request_id
  FOR UPDATE OF request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_request_not_found';
  END IF;
  IF v_request.status <> 'processing'
    OR v_request.settlement_lease_id IS NULL
    OR v_request.settlement_lease_id <> p_lease_id
    OR v_request.settlement_lease_expires_at IS NULL
    OR v_request.settlement_lease_expires_at <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'refund_lease_conflict';
  END IF;
  IF v_request.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision'
      USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || v_request.revision;
  END IF;

  v_before := pg_catalog.jsonb_build_object(
    'status', v_request.status,
    'revision', v_request.revision,
    'settlement_lease_id', v_request.settlement_lease_id,
    'settlement_attempt_count', v_request.settlement_attempt_count
  );

  UPDATE public.tonight_deposit_refund_requests AS request
  SET status = 'failed',
      settlement_lease_id = NULL,
      settlement_lease_expires_at = NULL,
      settlement_attempt_count = 10,
      settlement_last_error = p_error,
      settlement_next_retry_at = NULL,
      revision = request.revision + 1
  WHERE request.id = p_request_id
    AND request.status = 'processing'
    AND request.settlement_lease_id = p_lease_id
    AND request.revision = p_expected_revision
  RETURNING request.revision INTO v_revision;
  IF v_revision IS NULL THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'refund_request',
    p_request_id,
    'refund_worker_dead_lettered',
    v_before,
    pg_catalog.jsonb_build_object(
      'status', 'failed',
      'revision', v_revision,
      'settlement_attempt_count', 10,
      'error', p_error
    ),
    pg_catalog.btrim(p_idempotency_key)
  );
  RETURN v_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.service_dead_letter_tonight_refund_request(
  UUID, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.service_dead_letter_tonight_refund_request(
  UUID, UUID, INTEGER, TEXT, TEXT
) TO service_role;

COMMIT;
