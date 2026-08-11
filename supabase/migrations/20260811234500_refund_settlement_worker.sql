-- Lease-based automatic refund settlement queue. Provider cancellation still
-- happens only in trusted server code; this migration only claims and retries.

ALTER TABLE public.deposit_refund_requests
  ADD COLUMN IF NOT EXISTS settlement_lease_id UUID,
  ADD COLUMN IF NOT EXISTS settlement_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_attempt_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS settlement_attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_last_error TEXT,
  ADD COLUMN IF NOT EXISTS settlement_next_retry_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deposit_refund_settlement_attempt_count_valid'
      AND conrelid = 'public.deposit_refund_requests'::regclass
  ) THEN
    ALTER TABLE public.deposit_refund_requests
      ADD CONSTRAINT deposit_refund_settlement_attempt_count_valid
      CHECK (settlement_attempt_count BETWEEN 0 AND 5) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_drr_worker_claim
  ON public.deposit_refund_requests (
    settlement_next_retry_at,
    settlement_lease_expires_at,
    created_at
  )
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.claim_pending_refund_requests(
  p_lease_id UUID,
  p_limit INT DEFAULT 5,
  p_lease_seconds INT DEFAULT 120
)
RETURNS TABLE (
  refund_request_id UUID,
  deposit_id UUID,
  match_id UUID,
  user_id UUID,
  requested_refund_amount INT,
  deposit_amount INT,
  settlement_version INT,
  deposit_status TEXT,
  toss_payment_key TEXT,
  toss_order_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_lease_id IS NULL THEN
    RAISE EXCEPTION 'lease_id_required';
  END IF;

  RETURN QUERY
  WITH claimable AS MATERIALIZED (
    SELECT r.id
    FROM public.deposit_refund_requests AS r
    WHERE r.status = 'pending'
      AND (
        r.settlement_attempt_version <> r.settlement_version
        OR r.settlement_attempt_count < 5
      )
      AND (
        r.settlement_attempt_version <> r.settlement_version
        OR COALESCE(r.settlement_next_retry_at, r.created_at) <= NOW()
      )
      AND (
        r.settlement_attempt_version <> r.settlement_version
        OR r.settlement_lease_expires_at IS NULL
        OR r.settlement_lease_expires_at <= NOW()
      )
    ORDER BY r.created_at, r.id
    FOR UPDATE OF r SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 10)
  ), claimed AS (
    UPDATE public.deposit_refund_requests AS r
    SET settlement_lease_id = p_lease_id,
        settlement_lease_expires_at = NOW()
          + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 30), 600)),
        settlement_attempt_count = CASE
          WHEN r.settlement_attempt_version = r.settlement_version
            THEN r.settlement_attempt_count + 1
          ELSE 1
        END,
        settlement_attempt_version = r.settlement_version,
        settlement_last_error = NULL,
        settlement_next_retry_at = NULL
    FROM claimable AS c
    WHERE r.id = c.id
    RETURNING r.*
  )
  SELECT
    r.id,
    r.deposit_id,
    r.match_id,
    r.user_id,
    r.requested_refund_amount,
    d.amount,
    r.settlement_version,
    d.status,
    d.toss_payment_key,
    d.toss_order_id
  FROM claimed AS r
  LEFT JOIN public.deposits AS d
    ON d.id = r.deposit_id
   AND d.match_id = r.match_id
   AND d.user_id = r.user_id
  ORDER BY r.created_at, r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_refund_request_lease(
  p_refund_request_id UUID,
  p_lease_id UUID,
  p_error TEXT,
  p_retry_after_seconds INT DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  UPDATE public.deposit_refund_requests AS r
  SET settlement_lease_id = NULL,
      settlement_lease_expires_at = NULL,
      settlement_last_error = LEFT(COALESCE(NULLIF(BTRIM(p_error), ''), 'unknown_error'), 200),
      settlement_next_retry_at = NOW()
        + make_interval(secs => LEAST(GREATEST(p_retry_after_seconds, 60), 86400))
  WHERE r.id = p_refund_request_id
    AND r.status = 'pending'
    AND r.settlement_lease_id = p_lease_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_refund_requests(UUID, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_pending_refund_requests(UUID, INT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_pending_refund_requests(UUID, INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_refund_requests(UUID, INT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.release_refund_request_lease(UUID, UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_refund_request_lease(UUID, UUID, TEXT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.release_refund_request_lease(UUID, UUID, TEXT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_refund_request_lease(UUID, UUID, TEXT, INT) TO service_role;

COMMENT ON FUNCTION public.claim_pending_refund_requests(UUID, INT, INT) IS
  'Service-only bounded claim for automatic provider refund settlement.';
COMMENT ON FUNCTION public.release_refund_request_lease(UUID, UUID, TEXT, INT) IS
  'Service-only retry scheduling for a failed automatic refund settlement.';
