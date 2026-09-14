-- Verified provider observations reconcile both ledgers atomically. This RPC
-- neither authorizes nor executes a provider cancellation. Original user choice
-- is retained separately from the cumulative amount actually cancelled at Toss.
ALTER TABLE public.deposit_refund_requests
  ADD COLUMN IF NOT EXISTS provider_reconciliation_history JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE OR REPLACE FUNCTION public.reconcile_toss_deposit_cancellation(
  p_deposit_id UUID, p_match_id UUID, p_group_id UUID, p_user_id UUID,
  p_payment JSONB
)
RETURNS TABLE(reconciliation_status TEXT, deposit_id UUID)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_deposit public.deposits%ROWTYPE;
  v_request public.deposit_refund_requests%ROWTYPE;
  v_cancel JSONB;
  v_latest JSONB;
  v_sum BIGINT := 0;
  v_count INT := 0;
  v_keys TEXT[] := '{}';
  v_status TEXT := p_payment->>'status';
  v_key TEXT := p_payment->>'lastTransactionKey';
  v_total INT;
  v_balance INT;
  v_request_count INT;
  v_snapshot JSONB;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  -- Use the same request -> deposit order as the settlement finalizer. An
  -- unavailable lock/deadlock aborts the transaction and keeps webhook retryable.
  PERFORM r.id FROM public.deposit_refund_requests r
    WHERE r.deposit_id = p_deposit_id ORDER BY r.id FOR UPDATE;
  SELECT * INTO v_deposit FROM public.deposits d
    WHERE d.id = p_deposit_id FOR UPDATE;
  IF NOT FOUND OR v_deposit.match_id IS DISTINCT FROM p_match_id
     OR v_deposit.group_id IS DISTINCT FROM p_group_id
     OR v_deposit.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'deposit_context_mismatch';
  END IF;
  IF NULLIF(BTRIM(p_payment->>'paymentKey'),'') IS NULL
     OR (p_payment->>'paymentKey' IS DISTINCT FROM v_deposit.toss_payment_key AND NOT (
       v_deposit.status = 'pending' AND v_deposit.toss_payment_key IS NULL AND v_status = 'CANCELED'
     ))
     OR p_payment->>'orderId' IS DISTINCT FROM v_deposit.toss_order_id
     OR NULLIF(p_payment->>'orderId','') IS NULL THEN
    RAISE EXCEPTION 'provider_identity_mismatch';
  END IF;
  -- A moved entitlement is a different match context, even when a webhook's
  -- lookup already saw the new match. Require explicit recovery for that case.
  IF EXISTS (SELECT 1 FROM public.deposit_carryovers c
             WHERE c.deposit_id = v_deposit.id AND c.status = 'applied') THEN
    RAISE EXCEPTION 'transferred_deposit_requires_reconciliation';
  END IF;
  IF v_deposit.status NOT IN ('pending','paid','held','refunded') THEN
    RAISE EXCEPTION 'deposit_status_requires_reconciliation';
  END IF;
  IF v_status IS NULL OR v_status NOT IN ('CANCELED','PARTIAL_CANCELED')
     OR jsonb_typeof(p_payment->'totalAmount') IS DISTINCT FROM 'number'
     OR (p_payment->>'totalAmount') !~ '^[0-9]+$'
     OR jsonb_typeof(p_payment->'balanceAmount') IS DISTINCT FROM 'number'
     OR (p_payment->>'balanceAmount') !~ '^[0-9]+$'
     OR NULLIF(BTRIM(v_key),'') IS NULL
     OR jsonb_typeof(p_payment->'cancels') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'provider_cancellation_not_confirmed';
  END IF;
  v_total := (p_payment->>'totalAmount')::INT;
  v_balance := (p_payment->>'balanceAmount')::INT;
  IF v_total IS DISTINCT FROM v_deposit.amount OR v_total <> 10000
     OR v_balance >= v_total
     OR (v_status = 'CANCELED' AND v_balance <> 0)
     OR (v_status = 'PARTIAL_CANCELED' AND v_balance = 0) THEN
    RAISE EXCEPTION 'provider_amount_mismatch';
  END IF;
  FOR v_cancel IN SELECT value FROM jsonb_array_elements(p_payment->'cancels') LOOP
    IF v_cancel->>'cancelStatus' = 'DONE' THEN
      IF jsonb_typeof(v_cancel->'cancelAmount') IS DISTINCT FROM 'number'
         OR (v_cancel->>'cancelAmount') !~ '^[0-9]+$'
         OR (v_cancel->>'cancelAmount')::BIGINT <= 0
         OR NULLIF(BTRIM(v_cancel->>'transactionKey'),'') IS NULL
         OR (v_cancel->>'transactionKey') = ANY(v_keys) THEN
        RAISE EXCEPTION 'provider_cancel_history_invalid';
      END IF;
      v_keys := array_append(v_keys, v_cancel->>'transactionKey');
      v_sum := v_sum + (v_cancel->>'cancelAmount')::BIGINT;
      v_count := v_count + 1;
      IF v_cancel->>'transactionKey' = v_key THEN v_latest := v_cancel; END IF;
    END IF;
  END LOOP;
  IF v_count = 0 OR v_latest IS NULL OR v_sum <> v_total - v_balance
     OR (v_latest ? 'refundableAmount' AND (
       jsonb_typeof(v_latest->'refundableAmount') IS DISTINCT FROM 'number'
       OR (v_latest->>'refundableAmount') !~ '^[0-9]+$'
       OR (v_latest->>'refundableAmount')::INT <> v_balance)) THEN
    RAISE EXCEPTION 'provider_cancel_history_mismatch';
  END IF;
  -- A pending order can lose its confirmation acknowledgement after the PG
  -- charge. Only an exact owned order with verified FULL cancellation can fill
  -- its missing payment key. The assignment is persisted with both ledgers.
  IF v_deposit.toss_payment_key IS NULL THEN
    v_deposit.toss_payment_key := p_payment->>'paymentKey';
  END IF;
  SELECT count(*) INTO v_request_count FROM public.deposit_refund_requests r
    WHERE r.deposit_id = v_deposit.id;
  IF v_request_count > 1 THEN RAISE EXCEPTION 'ambiguous_refund_request'; END IF;
  SELECT * INTO v_request FROM public.deposit_refund_requests r
    WHERE r.deposit_id = v_deposit.id;
  IF v_request.id IS NOT NULL AND (
    v_request.match_id IS DISTINCT FROM v_deposit.match_id
    OR v_request.user_id IS DISTINCT FROM v_deposit.user_id
    OR v_request.requested_refund_amount < 0
    OR v_request.requested_refund_amount > v_deposit.amount
    OR (v_request.provider_payment_key IS NOT NULL AND v_request.provider_payment_key IS DISTINCT FROM v_deposit.toss_payment_key)
    OR (v_request.provider_order_id IS NOT NULL AND v_request.provider_order_id IS DISTINCT FROM v_deposit.toss_order_id)
  ) THEN RAISE EXCEPTION 'refund_request_context_mismatch'; END IF;
  -- Verified cancellation totals only advance; delayed partial events never
  -- downgrade a full settlement, nor mark another pending request processed.
  IF v_sum < COALESCE(v_deposit.refunded_amount,0)
     OR v_sum < COALESCE(v_request.settled_refund_amount,0) THEN
    RETURN QUERY SELECT 'ignored_stale_refund_webhook'::TEXT, v_deposit.id;
    RETURN;
  END IF;
  IF v_status = 'PARTIAL_CANCELED' AND (
    v_request.id IS NULL OR v_request.status NOT IN ('pending','processed')
    OR v_request.requested_refund_amount IS DISTINCT FROM v_sum
  ) THEN RAISE EXCEPTION 'partial_cancellation_requires_reconciliation'; END IF;
  IF v_deposit.status = 'refunded' AND v_deposit.refunded_amount = v_sum
     AND v_deposit.retained_amount = v_balance
     AND (v_request.id IS NULL OR (v_request.status = 'processed'
       AND v_request.provider = 'toss' AND v_request.provider_status = v_status
       AND v_request.settlement_key = v_key AND v_request.settled_refund_amount = v_sum)) THEN
    RETURN QUERY SELECT 'ignored_duplicate_refund_webhook'::TEXT, v_deposit.id;
    RETURN;
  END IF;
  UPDATE public.deposit_carryovers c SET status = 'cancelled'
    WHERE c.deposit_id = v_deposit.id AND c.status = 'available';
  IF v_request.id IS NOT NULL THEN
    v_snapshot := jsonb_build_object('observed_at',NOW(),
      'previous',jsonb_build_object('status',v_request.status,'provider',v_request.provider,
        'provider_status',v_request.provider_status,'settlement_key',v_request.settlement_key,
        'provider_request_key',v_request.provider_request_key,'settled_refund_amount',v_request.settled_refund_amount,
        'settlement_version',v_request.settlement_version,'last_error',v_request.settlement_last_error),
      'verified',jsonb_build_object('provider_status',v_status,'settlement_key',v_key,
        'settled_refund_amount',v_sum,'balance_amount',v_balance));
    UPDATE public.deposit_refund_requests r SET status = 'processed',processed_at = NOW(),
      provider = 'toss',provider_status = v_status,settlement_key = v_key,
      provider_payment_key = v_deposit.toss_payment_key,provider_order_id = v_deposit.toss_order_id,
      settled_refund_amount = v_sum::INT,
      provider_reconciliation_history = r.provider_reconciliation_history || jsonb_build_array(v_snapshot),
      settlement_lease_id = NULL,settlement_lease_expires_at = NULL,settlement_next_retry_at = NULL,
      settlement_last_error = NULL
      WHERE r.id = v_request.id;
    -- Do not invent a provider request key for an out-of-band cancellation.
  END IF;
  UPDATE public.deposits d SET status = 'refunded',refunded_amount = v_sum::INT,
    toss_payment_key = v_deposit.toss_payment_key,
    retained_amount = v_balance,refunded_at = COALESCE(NULLIF(v_latest->>'canceledAt','')::TIMESTAMPTZ,NOW()),
    notes = COALESCE(d.notes || ' | ','') || 'toss_verified_cancellation=' || v_status
      || ' refunded_amount=' || v_sum::TEXT
    WHERE d.id = v_deposit.id;
  IF v_request.id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,kind,payload) VALUES(v_deposit.user_id,'refund_processed',
      jsonb_build_object('match_id',v_deposit.match_id,'refund_amount',v_sum,
        'deposit_amount',v_total,'app_revenue',v_balance,'reason','provider_reconciliation_confirmed'));
  END IF;
  RETURN QUERY SELECT 'reconciled_refund'::TEXT, v_deposit.id;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_toss_deposit_cancellation(UUID,UUID,UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_toss_deposit_cancellation(UUID,UUID,UUID,UUID,JSONB) TO service_role;

-- Preserve the existing worker/API signature. A late partial finalizer returns
-- the already reconciled cumulative amount and cannot rewrite full cancellation.
CREATE OR REPLACE FUNCTION public.finalize_refund_request(
  p_refund_request_id UUID,p_settlement_version INT,p_provider TEXT,
  p_settlement_key TEXT,p_provider_request_key TEXT,p_provider_status TEXT,
  p_provider_payment_key TEXT,p_provider_order_id TEXT,p_settled_refund_amount INT
)
RETURNS TABLE(refund_request_id UUID,deposit_id UUID,requested_refund_amount INT,
  deposit_amount INT,app_revenue INT,request_status TEXT,settlement_version INT,
  settlement_provider TEXT,settlement_provider_status TEXT,settled_refund_amount INT)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_request public.deposit_refund_requests%ROWTYPE;
  v_deposit public.deposits%ROWTYPE;
  v_match public.matches%ROWTYPE;
  v_revenue INT;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT * INTO v_request FROM public.deposit_refund_requests r WHERE r.id=p_refund_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_request_not_found'; END IF;
  SELECT * INTO v_deposit FROM public.deposits d WHERE d.id=v_request.deposit_id
    AND d.match_id=v_request.match_id AND d.user_id=v_request.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deposit_match_mismatch'; END IF;
  IF v_request.settlement_version IS DISTINCT FROM p_settlement_version THEN
    RAISE EXCEPTION 'refund_settlement_version_mismatch';
  END IF;
  IF v_request.status = 'processed' THEN
    v_revenue := v_deposit.amount - COALESCE(v_request.settled_refund_amount,v_request.requested_refund_amount);
  ELSE
    IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'refund_request_not_pending'; END IF;
    IF v_deposit.status NOT IN ('paid','held')
       OR COALESCE(v_deposit.refunded_amount,0) <> 0 THEN
      RAISE EXCEPTION 'deposit_requires_reconciliation';
    END IF;
    IF v_request.requested_refund_amount < 0 OR v_request.requested_refund_amount > v_deposit.amount
       OR p_settled_refund_amount IS DISTINCT FROM v_request.requested_refund_amount THEN
      RAISE EXCEPTION 'provider_settlement_not_confirmed';
    END IF;
    IF p_provider = 'toss' THEN
      IF p_provider_status IS NULL OR p_provider_status NOT IN ('CANCELED','PARTIAL_CANCELED')
         OR NULLIF(BTRIM(p_settlement_key),'') IS NULL OR NULLIF(BTRIM(p_provider_request_key),'') IS NULL
         OR p_provider_payment_key IS DISTINCT FROM v_deposit.toss_payment_key
         OR p_provider_order_id IS DISTINCT FROM v_deposit.toss_order_id THEN
        RAISE EXCEPTION 'provider_settlement_not_confirmed';
      END IF;
    ELSIF p_provider = 'mock' THEN
      IF p_provider_status IS DISTINCT FROM 'MOCK'
         OR p_provider_payment_key IS DISTINCT FROM v_deposit.toss_payment_key
         OR p_provider_order_id IS DISTINCT FROM v_deposit.toss_order_id THEN
        RAISE EXCEPTION 'provider_settlement_not_confirmed';
      END IF;
    ELSIF p_provider = 'not_required' THEN
      IF p_provider_status IS DISTINCT FROM 'NOT_REQUIRED' OR p_settled_refund_amount <> 0 THEN
        RAISE EXCEPTION 'provider_settlement_not_confirmed';
      END IF;
    ELSE RAISE EXCEPTION 'unsupported_refund_provider'; END IF;
    v_revenue := v_deposit.amount - p_settled_refund_amount;
    UPDATE public.deposit_refund_requests r SET status='processed',processed_at=NOW(),provider=p_provider,
      provider_status=p_provider_status,settlement_key=p_settlement_key,provider_request_key=p_provider_request_key,
      provider_payment_key=p_provider_payment_key,provider_order_id=p_provider_order_id,
      settled_refund_amount=p_settled_refund_amount,settlement_lease_id=NULL,
      settlement_lease_expires_at=NULL,settlement_next_retry_at=NULL,settlement_last_error=NULL
      WHERE r.id=v_request.id RETURNING * INTO v_request;
    UPDATE public.deposits d SET status='refunded',refunded_at=NOW(),refunded_amount=p_settled_refund_amount,
      retained_amount=v_revenue,notes=COALESCE(d.notes || ' | ','')
        || 'refund_provider=' || LEFT(p_provider,24) || ' provider_status=' || LEFT(p_provider_status,40)
        || ' provider_ref=' || LEFT(COALESCE(p_settlement_key,''),120)
        || ' refund_amount=' || p_settled_refund_amount::TEXT || ' app_revenue=' || v_revenue::TEXT
      WHERE d.id=v_deposit.id;
    INSERT INTO public.notifications(user_id,kind,payload) VALUES(v_request.user_id,'refund_processed',
      jsonb_build_object('match_id',v_request.match_id,'refund_amount',p_settled_refund_amount,
        'deposit_amount',v_deposit.amount,'app_revenue',v_revenue,'reason','provider_settlement_confirmed'));
    IF v_revenue = 0 THEN
      SELECT * INTO v_match FROM public.matches m WHERE m.id=v_request.match_id;
      INSERT INTO public.notifications(user_id,kind,payload)
        SELECT gm.user_id,'partner_paid_zero',jsonb_build_object('match_id',v_request.match_id,
          'from_user_id',v_request.user_id,'app_fee_amount',0)
        FROM public.group_members gm WHERE gm.group_id IN (v_match.group_a_id,v_match.group_b_id)
          AND gm.user_id <> v_request.user_id AND gm.left_at IS NULL;
    END IF;
  END IF;
  RETURN QUERY SELECT v_request.id,v_deposit.id,v_request.requested_refund_amount,v_deposit.amount,
    v_revenue,v_request.status,v_request.settlement_version,v_request.provider,
    v_request.provider_status,v_request.settled_refund_amount;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_refund_request(UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_refund_request(UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INT) TO service_role;
