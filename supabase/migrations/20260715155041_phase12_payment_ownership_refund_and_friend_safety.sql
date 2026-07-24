-- Phase 12 production safety enforcement.
-- Apply only after the ownership staging migration and operator review.

DO $$
DECLARE
  v_unmapped_count INT;
  v_duplicate_count INT;
BEGIN
  SELECT COUNT(*) INTO v_unmapped_count
  FROM public.deposits AS d
  WHERE d.status IN ('pending', 'paid', 'held')
    AND d.match_id IS NULL;

  IF v_unmapped_count > 0 THEN
    RAISE EXCEPTION 'active_deposits_missing_match_id:%', v_unmapped_count;
  END IF;

  SELECT COUNT(*) INTO v_duplicate_count
  FROM (
    SELECT d.match_id, d.user_id
    FROM public.deposits AS d
    WHERE d.status IN ('pending', 'paid', 'held')
    GROUP BY d.match_id, d.user_id
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION 'duplicate_active_deposits_for_match_user:%', v_duplicate_count;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS deposits_one_active_per_match_user_idx
  ON public.deposits(match_id, user_id)
  WHERE status IN ('pending', 'paid', 'held');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deposits_active_requires_match'
      AND conrelid = 'public.deposits'::regclass
  ) THEN
    ALTER TABLE public.deposits
      ADD CONSTRAINT deposits_active_requires_match
      CHECK (
        status NOT IN ('pending', 'paid', 'held')
        OR match_id IS NOT NULL
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.deposit_refund_requests
  ADD COLUMN IF NOT EXISTS settlement_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS settlement_key TEXT,
  ADD COLUMN IF NOT EXISTS provider_request_key TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_key TEXT,
  ADD COLUMN IF NOT EXISTS provider_order_id TEXT,
  ADD COLUMN IF NOT EXISTS settled_refund_amount INT;

ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS refunded_amount INT,
  ADD COLUMN IF NOT EXISTS retained_amount INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deposit_refund_settlement_amounts_valid'
      AND conrelid = 'public.deposit_refund_requests'::regclass
  ) THEN
    ALTER TABLE public.deposit_refund_requests
      ADD CONSTRAINT deposit_refund_settlement_amounts_valid
      CHECK (
        settled_refund_amount IS NULL
        OR settled_refund_amount BETWEEN 0 AND 10000
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deposits_settlement_amounts_valid'
      AND conrelid = 'public.deposits'::regclass
  ) THEN
    ALTER TABLE public.deposits
      ADD CONSTRAINT deposits_settlement_amounts_valid
      CHECK (
        (refunded_amount IS NULL AND retained_amount IS NULL)
        OR (
          refunded_amount BETWEEN 0 AND amount
          AND retained_amount = amount - refunded_amount
        )
      ) NOT VALID;
  END IF;
END;
$$;

UPDATE public.deposit_refund_requests AS r
SET provider = 'legacy_unverified'
WHERE r.status = 'processed'
  AND r.provider IS NULL;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.deposits FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.deposits FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.deposits FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.deposit_refund_requests FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.deposit_refund_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.deposit_refund_requests FROM authenticated;

-- Remove production client access to legacy state-changing helpers.
REVOKE ALL ON FUNCTION public.mock_pay_deposit(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mock_pay_deposit(UUID, INT) FROM anon;
REVOKE ALL ON FUNCTION public.mock_pay_deposit(UUID, INT) FROM authenticated;

REVOKE ALL ON FUNCTION public.submit_refund_request(UUID, INT, TEXT[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_refund_request(UUID, INT, TEXT[], TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.submit_refund_request(UUID, INT, TEXT[], TEXT) FROM authenticated;

-- No-show settlement is an internal money-moving operation. The legacy
-- function was callable by any participant and was not scoped by match_id.
CREATE OR REPLACE FUNCTION public.distribute_no_show_penalty(
  p_match_id UUID,
  p_no_show_user_ids UUID[]
)
RETURNS TABLE (
  forfeited_count INT,
  attendee_count INT,
  total_forfeited_amount INT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_total_amount INT := 0;
  v_forfeited INT := 0;
  v_attendees UUID[];
  v_all_participants UUID[];
BEGIN
  IF p_no_show_user_ids IS NULL OR array_length(p_no_show_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_show_list_empty';
  END IF;

  SELECT * INTO v_match
  FROM public.matches AS m
  WHERE m.id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_match.status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  SELECT array_agg(gm.user_id) INTO v_all_participants
  FROM public.group_members AS gm
  WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
    AND gm.left_at IS NULL;

  IF NOT (p_no_show_user_ids <@ v_all_participants) THEN
    RAISE EXCEPTION 'no_show_user_not_participant';
  END IF;

  v_attendees := ARRAY(
    SELECT participant_id
    FROM unnest(v_all_participants) AS participant_id
    WHERE participant_id <> ALL (p_no_show_user_ids)
  );

  IF array_length(v_attendees, 1) IS NULL THEN
    RAISE EXCEPTION 'no_attendees_to_distribute';
  END IF;

  UPDATE public.deposits AS d
  SET status = 'forfeited',
      distribution_to = v_attendees,
      refunded_at = NOW(),
      notes = COALESCE(d.notes || ' | ', '')
        || 'forfeited via distribute_no_show_penalty match=' || p_match_id::TEXT
  WHERE d.match_id = p_match_id
    AND d.user_id = ANY (p_no_show_user_ids)
    AND d.status IN ('paid', 'held');

  GET DIAGNOSTICS v_forfeited = ROW_COUNT;

  SELECT COALESCE(SUM(d.amount), 0)::INT INTO v_total_amount
  FROM public.deposits AS d
  WHERE d.match_id = p_match_id
    AND d.user_id = ANY (p_no_show_user_ids)
    AND d.status = 'forfeited';

  RETURN QUERY SELECT v_forfeited, array_length(v_attendees, 1), v_total_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.distribute_no_show_penalty(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.distribute_no_show_penalty(UUID, UUID[]) FROM anon;
REVOKE ALL ON FUNCTION public.distribute_no_show_penalty(UUID, UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_no_show_penalty(UUID, UUID[]) TO service_role;

REVOKE ALL ON FUNCTION public.expire_continuation_choices() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_continuation_choices() FROM anon;
REVOKE ALL ON FUNCTION public.expire_continuation_choices() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_continuation_choices() TO service_role;

-- Local preview payment is callable only by server code using service_role.
CREATE OR REPLACE FUNCTION public.mock_pay_deposit_for_match(
  p_user_id UUID,
  p_group_id UUID,
  p_match_id UUID,
  p_amount INT
)
RETURNS TABLE (
  deposit_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_existing public.deposits%ROWTYPE;
  v_deposit_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;
  IF p_amount IS NULL OR p_amount <> 10000 THEN
    RAISE EXCEPTION 'invalid_deposit_amount';
  END IF;

  SELECT * INTO v_match
  FROM public.matches AS m
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_match.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'match_not_payable';
  END IF;
  IF p_group_id NOT IN (v_match.group_a_id, v_match.group_b_id) THEN
    RAISE EXCEPTION 'group_not_in_match';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members AS gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = p_user_id
      AND gm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_group_member';
  END IF;

  SELECT * INTO v_existing
  FROM public.deposits AS d
  WHERE d.match_id = p_match_id
    AND d.user_id = p_user_id
    AND d.status IN ('pending', 'paid', 'held')
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.status;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.deposits (
      match_id, user_id, group_id, amount, status,
      toss_payment_key, toss_order_id, paid_at
    ) VALUES (
      p_match_id, p_user_id, p_group_id, p_amount, 'paid',
      'MOCK_' || REPLACE(gen_random_uuid()::TEXT, '-', ''),
      'MOCK_' || REPLACE(gen_random_uuid()::TEXT, '-', ''),
      NOW()
    )
    RETURNING id INTO v_deposit_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.deposits AS d
    WHERE d.match_id = p_match_id
      AND d.user_id = p_user_id
      AND d.status IN ('pending', 'paid', 'held')
    ORDER BY d.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE;
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.status;
    RETURN;
  END;

  RETURN QUERY SELECT v_deposit_id, 'paid'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.mock_pay_deposit_for_match(UUID, UUID, UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mock_pay_deposit_for_match(UUID, UUID, UUID, INT) FROM anon;
REVOKE ALL ON FUNCTION public.mock_pay_deposit_for_match(UUID, UUID, UUID, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mock_pay_deposit_for_match(UUID, UUID, UUID, INT) TO service_role;

-- Toss approval is finalized only after the match and deposit are locked and
-- revalidated in one database transaction.
CREATE OR REPLACE FUNCTION public.finalize_toss_deposit_payment(
  p_deposit_id UUID,
  p_match_id UUID,
  p_group_id UUID,
  p_user_id UUID,
  p_payment_key TEXT,
  p_order_id TEXT,
  p_paid_at TIMESTAMPTZ
)
RETURNS TABLE (
  deposit_id UUID,
  match_id UUID,
  status TEXT,
  toss_order_id TEXT,
  toss_payment_key TEXT,
  paid_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_deposit public.deposits%ROWTYPE;
BEGIN
  IF NULLIF(BTRIM(p_payment_key), '') IS NULL OR NULLIF(BTRIM(p_order_id), '') IS NULL THEN
    RAISE EXCEPTION 'payment_evidence_required';
  END IF;

  SELECT * INTO v_match
  FROM public.matches AS m
  WHERE m.id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_match.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'match_not_payable';
  END IF;
  IF p_group_id NOT IN (v_match.group_a_id, v_match.group_b_id) THEN
    RAISE EXCEPTION 'group_not_in_match';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members AS gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = p_user_id
      AND gm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_group_member';
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposits AS d
  WHERE d.id = p_deposit_id
    AND d.match_id = p_match_id
    AND d.group_id = p_group_id
    AND d.user_id = p_user_id
    AND d.toss_order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit_order_not_found';
  END IF;
  IF v_deposit.amount <> 10000 THEN
    RAISE EXCEPTION 'invalid_deposit_amount';
  END IF;
  IF v_deposit.status IN ('paid', 'held') THEN
    IF v_deposit.toss_payment_key IS DISTINCT FROM p_payment_key THEN
      RAISE EXCEPTION 'payment_key_conflict';
    END IF;
  ELSIF v_deposit.status = 'pending' THEN
    UPDATE public.deposits AS d
    SET status = 'paid',
        toss_payment_key = p_payment_key,
        paid_at = COALESCE(p_paid_at, NOW()),
        updated_at = NOW()
    WHERE d.id = v_deposit.id
    RETURNING * INTO v_deposit;
  ELSE
    RAISE EXCEPTION 'deposit_not_payable';
  END IF;

  RETURN QUERY SELECT
    v_deposit.id,
    v_deposit.match_id,
    v_deposit.status,
    v_deposit.toss_order_id,
    v_deposit.toss_payment_key,
    v_deposit.paid_at;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_toss_deposit_payment(UUID, UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_toss_deposit_payment(UUID, UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_toss_deposit_payment(UUID, UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_toss_deposit_payment(UUID, UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- Step 1: create or return a pending request. This function never marks the
-- deposit as refunded and never emits a completion notification.
CREATE OR REPLACE FUNCTION public.prepare_refund_request(
  p_match_id UUID,
  p_refund_amount INT,
  p_zero_refund_reasons TEXT[] DEFAULT NULL,
  p_zero_refund_comment TEXT DEFAULT NULL
)
RETURNS TABLE (
  refund_request_id UUID,
  deposit_id UUID,
  requested_refund_amount INT,
  deposit_amount INT,
  app_revenue INT,
  request_status TEXT,
  settlement_version INT,
  settlement_provider TEXT,
  settlement_provider_status TEXT,
  settled_refund_amount INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_match public.matches%ROWTYPE;
  v_deposit public.deposits%ROWTYPE;
  v_request public.deposit_refund_requests%ROWTYPE;
  v_total INT;
  v_continue INT;
  v_end INT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_refund_amount IS NULL OR p_refund_amount < 0 THEN
    RAISE EXCEPTION 'invalid_refund_amount';
  END IF;

  SELECT * INTO v_request
  FROM public.deposit_refund_requests AS r
  WHERE r.match_id = p_match_id
    AND r.user_id = v_caller
  FOR UPDATE;

  IF FOUND AND v_request.status IN ('pending', 'processed') THEN
    SELECT * INTO v_deposit
    FROM public.deposits AS d
    WHERE d.id = v_request.deposit_id
      AND d.match_id = v_request.match_id
      AND d.user_id = v_request.user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'deposit_match_mismatch';
    END IF;

    IF v_request.requested_refund_amount <> p_refund_amount THEN
      RAISE EXCEPTION 'refund_request_conflict';
    END IF;
    IF v_request.status = 'processed'
       AND COALESCE(v_request.provider, 'legacy_unverified') = 'legacy_unverified' THEN
      RAISE EXCEPTION 'legacy_refund_verification_required';
    END IF;

    RETURN QUERY SELECT
      v_request.id,
      v_request.deposit_id,
      v_request.requested_refund_amount,
      v_deposit.amount,
      v_deposit.amount - v_request.requested_refund_amount,
      v_request.status,
      v_request.settlement_version,
      v_request.provider,
      v_request.provider_status,
      v_request.settled_refund_amount;
    RETURN;
  END IF;

  SELECT * INTO v_match
  FROM public.matches AS m
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_match.status <> 'completed' THEN
    RAISE EXCEPTION 'match_not_completed';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.group_members AS gm
  WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
    AND gm.left_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.deposits AS d
      WHERE d.match_id = p_match_id
        AND d.user_id = gm.user_id
        AND d.status = 'forfeited'
    );

  SELECT
    COUNT(*) FILTER (WHERE c.choice = 'continue'),
    COUNT(*) FILTER (WHERE c.choice = 'end')
  INTO v_continue, v_end
  FROM public.match_continuation_choices AS c
  WHERE c.match_id = p_match_id;

  IF v_end > 0 THEN
    RAISE EXCEPTION 'auto_refund_pending';
  END IF;
  IF v_total = 0 OR v_continue < v_total THEN
    RAISE EXCEPTION 'both_continue_required';
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposits AS d
  WHERE d.match_id = p_match_id
    AND d.user_id = v_caller
    AND d.status IN ('paid', 'held')
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.deposits AS d
      WHERE d.match_id = p_match_id
        AND d.user_id = v_caller
        AND d.status = 'forfeited'
    ) THEN
      RAISE EXCEPTION 'no_show_cannot_refund';
    END IF;
    RAISE EXCEPTION 'deposit_not_found_or_already_refunded';
  END IF;

  IF p_refund_amount > v_deposit.amount THEN
    RAISE EXCEPTION 'refund_exceeds_deposit';
  END IF;

  INSERT INTO public.deposit_refund_requests (
    match_id,
    user_id,
    deposit_id,
    requested_refund_amount,
    zero_refund_reasons,
    zero_refund_comment,
    status,
    processed_at
  ) VALUES (
    p_match_id,
    v_caller,
    v_deposit.id,
    p_refund_amount,
    COALESCE(p_zero_refund_reasons, '{}'::TEXT[]),
    p_zero_refund_comment,
    'pending',
    NULL
  )
  ON CONFLICT (match_id, user_id) DO UPDATE
  SET deposit_id = EXCLUDED.deposit_id,
      requested_refund_amount = EXCLUDED.requested_refund_amount,
      zero_refund_reasons = EXCLUDED.zero_refund_reasons,
      zero_refund_comment = EXCLUDED.zero_refund_comment,
      status = 'pending',
      processed_at = NULL,
      settlement_version = public.deposit_refund_requests.settlement_version + 1,
      provider = NULL,
      provider_status = NULL,
      settlement_key = NULL,
      provider_request_key = NULL,
      provider_payment_key = NULL,
      provider_order_id = NULL,
      settled_refund_amount = NULL
  WHERE public.deposit_refund_requests.status = 'cancelled'
  RETURNING * INTO v_request;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'refund_request_conflict';
  END IF;

  RETURN QUERY SELECT
    v_request.id,
    v_deposit.id,
    v_request.requested_refund_amount,
    v_deposit.amount,
    v_deposit.amount - v_request.requested_refund_amount,
    v_request.status,
    v_request.settlement_version,
    v_request.provider,
    v_request.provider_status,
    v_request.settled_refund_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_refund_request(UUID, INT, TEXT[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_refund_request(UUID, INT, TEXT[], TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.prepare_refund_request(UUID, INT, TEXT[], TEXT) TO authenticated;

-- Step 2: service-only finalization after Toss confirms the cancellation.
DROP FUNCTION IF EXISTS public.finalize_refund_request(UUID, INT, TEXT, TEXT, TEXT, TEXT, TEXT, INT);
CREATE OR REPLACE FUNCTION public.finalize_refund_request(
  p_refund_request_id UUID,
  p_settlement_version INT,
  p_provider TEXT,
  p_settlement_key TEXT,
  p_provider_request_key TEXT,
  p_provider_status TEXT,
  p_provider_payment_key TEXT,
  p_provider_order_id TEXT,
  p_settled_refund_amount INT
)
RETURNS TABLE (
  refund_request_id UUID,
  deposit_id UUID,
  requested_refund_amount INT,
  deposit_amount INT,
  app_revenue INT,
  request_status TEXT,
  settlement_version INT,
  settlement_provider TEXT,
  settlement_provider_status TEXT,
  settled_refund_amount INT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_request public.deposit_refund_requests%ROWTYPE;
  v_deposit public.deposits%ROWTYPE;
  v_match public.matches%ROWTYPE;
  v_app_revenue INT;
BEGIN
  SELECT * INTO v_request
  FROM public.deposit_refund_requests AS r
  WHERE r.id = p_refund_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_request_not_found';
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposits AS d
  WHERE d.id = v_request.deposit_id
    AND d.match_id = v_request.match_id
    AND d.user_id = v_request.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit_match_mismatch';
  END IF;

  v_app_revenue := v_deposit.amount - v_request.requested_refund_amount;

  IF v_request.settlement_version <> p_settlement_version THEN
    RAISE EXCEPTION 'refund_settlement_version_mismatch';
  END IF;

  IF v_request.status = 'processed' THEN
    RETURN QUERY SELECT
      v_request.id,
      v_deposit.id,
      v_request.requested_refund_amount,
      v_deposit.amount,
      v_app_revenue,
      v_request.status,
      v_request.settlement_version,
      v_request.provider,
      v_request.provider_status,
      v_request.settled_refund_amount;
    RETURN;
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'refund_request_not_pending';
  END IF;

  IF p_provider = 'toss' THEN
    IF p_provider_status IS NULL
       OR p_provider_status NOT IN ('CANCELED', 'PARTIAL_CANCELED')
       OR NULLIF(BTRIM(p_settlement_key), '') IS NULL
       OR NULLIF(BTRIM(p_provider_request_key), '') IS NULL
       OR p_provider_payment_key IS DISTINCT FROM v_deposit.toss_payment_key
       OR p_provider_order_id IS DISTINCT FROM v_deposit.toss_order_id
       OR p_settled_refund_amount IS DISTINCT FROM v_request.requested_refund_amount THEN
      RAISE EXCEPTION 'provider_settlement_not_confirmed';
    END IF;
  ELSIF p_provider = 'mock' THEN
    IF p_provider_status IS DISTINCT FROM 'MOCK'
       OR p_provider_payment_key IS DISTINCT FROM v_deposit.toss_payment_key
       OR p_provider_order_id IS DISTINCT FROM v_deposit.toss_order_id
       OR p_settled_refund_amount IS DISTINCT FROM v_request.requested_refund_amount THEN
      RAISE EXCEPTION 'provider_settlement_not_confirmed';
    END IF;
  ELSIF p_provider = 'not_required' THEN
    IF p_provider_status IS DISTINCT FROM 'NOT_REQUIRED'
       OR v_request.requested_refund_amount <> 0
       OR p_settled_refund_amount IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'provider_settlement_not_confirmed';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported_refund_provider';
  END IF;

  UPDATE public.deposit_refund_requests AS r
  SET status = 'processed',
      processed_at = NOW(),
      provider = p_provider,
      provider_status = p_provider_status,
      settlement_key = p_settlement_key,
      provider_request_key = p_provider_request_key,
      provider_payment_key = p_provider_payment_key,
      provider_order_id = p_provider_order_id,
      settled_refund_amount = p_settled_refund_amount
  WHERE r.id = v_request.id;

  UPDATE public.deposits AS d
  SET status = 'refunded',
      refunded_at = NOW(),
      refunded_amount = p_settled_refund_amount,
      retained_amount = v_app_revenue,
      notes = COALESCE(d.notes || ' | ', '')
        || 'refund_provider=' || LEFT(p_provider, 24)
        || ' provider_status=' || LEFT(p_provider_status, 40)
        || ' provider_ref=' || LEFT(COALESCE(p_settlement_key, ''), 120)
        || ' refund_amount=' || v_request.requested_refund_amount::TEXT
        || ' app_revenue=' || v_app_revenue::TEXT
  WHERE d.id = v_deposit.id;

  INSERT INTO public.notifications (user_id, kind, payload)
  VALUES (
    v_request.user_id,
    'refund_processed',
    jsonb_build_object(
      'match_id', v_request.match_id,
      'refund_amount', v_request.requested_refund_amount,
      'deposit_amount', v_deposit.amount,
      'app_revenue', v_app_revenue,
      'reason', 'provider_settlement_confirmed'
    )
  );

  IF v_app_revenue = 0 THEN
    SELECT * INTO v_match
    FROM public.matches AS m
    WHERE m.id = v_request.match_id;

    INSERT INTO public.notifications (user_id, kind, payload)
    SELECT
      gm.user_id,
      'partner_paid_zero',
      jsonb_build_object(
        'match_id', v_request.match_id,
        'from_user_id', v_request.user_id,
        'app_fee_amount', 0
      )
    FROM public.group_members AS gm
    WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
      AND gm.user_id <> v_request.user_id
      AND gm.left_at IS NULL;
  END IF;

  v_request.status := 'processed';
  v_request.provider := p_provider;
  v_request.provider_status := p_provider_status;
  v_request.settled_refund_amount := p_settled_refund_amount;
  RETURN QUERY SELECT
    v_request.id,
    v_deposit.id,
    v_request.requested_refund_amount,
    v_deposit.amount,
    v_app_revenue,
    v_request.status,
    v_request.settlement_version,
    v_request.provider,
    v_request.provider_status,
    v_request.settled_refund_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_refund_request(UUID, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_refund_request(UUID, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_refund_request(UUID, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_refund_request(UUID, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO service_role;

-- Automatic end-choice flow now queues pending settlements. It never claims a
-- refund is complete before the payment provider confirms it.
CREATE OR REPLACE FUNCTION public.trg_continuation_both_continue_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_total INT;
  v_continue INT;
  v_end INT;
BEGIN
  SELECT * INTO v_match
  FROM public.matches AS m
  WHERE m.id = NEW.match_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.group_members AS gm
  WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
    AND gm.left_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.deposits AS d
      WHERE d.match_id = NEW.match_id
        AND d.user_id = gm.user_id
        AND d.status = 'forfeited'
    );

  SELECT
    COUNT(*) FILTER (WHERE c.choice = 'continue'),
    COUNT(*) FILTER (WHERE c.choice = 'end')
  INTO v_continue, v_end
  FROM public.match_continuation_choices AS c
  WHERE c.match_id = NEW.match_id;

  IF v_total > 0 AND v_continue = v_total THEN
    PERFORM public.notify_match_members(NEW.match_id, 'both_continue', '{}'::jsonb);
  END IF;

  IF NEW.choice = 'end' AND v_end = 1 THEN
    PERFORM public.notify_match_members(NEW.match_id, 'review_request', '{}'::jsonb);

    INSERT INTO public.deposit_refund_requests (
      match_id,
      user_id,
      deposit_id,
      requested_refund_amount,
      status,
      processed_at
    )
    SELECT
      NEW.match_id,
      d.user_id,
      d.id,
      d.amount,
      'pending',
      NULL
    FROM public.deposits AS d
    WHERE d.match_id = NEW.match_id
      AND d.status IN ('paid', 'held')
    ON CONFLICT (match_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_continuation_both_continue_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_continuation_both_continue_check() FROM anon;
REVOKE ALL ON FUNCTION public.trg_continuation_both_continue_check() FROM authenticated;

-- The legacy expiry job is retained as a queueing job only. Provider settlement
-- must be completed by trusted server code calling finalize_refund_request.
CREATE OR REPLACE FUNCTION public.expire_refund_requests()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_queued INT := 0;
BEGIN
  INSERT INTO public.deposit_refund_requests (
    match_id,
    user_id,
    deposit_id,
    requested_refund_amount,
    status,
    processed_at
  )
  SELECT
    m.id,
    d.user_id,
    d.id,
    d.amount,
    'pending',
    NULL
  FROM public.matches AS m
  JOIN public.deposits AS d
    ON d.match_id = m.id
   AND d.status IN ('paid', 'held')
  WHERE m.status = 'completed'
    AND m.completed_at <= NOW() - INTERVAL '14 days'
    AND EXISTS (
      SELECT 1
      FROM public.match_continuation_choices AS c
      WHERE c.match_id = m.id
        AND c.user_id = d.user_id
        AND c.choice = 'end'
    )
  ON CONFLICT (match_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_queued = ROW_COUNT;
  RETURN v_queued;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_refund_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_refund_requests() FROM anon;
REVOKE ALL ON FUNCTION public.expire_refund_requests() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_refund_requests() TO service_role;

-- Replace automatic friendship creation with read-only, consent-based
-- suggestions. Existing active friendships are not removed automatically.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_friend_discovery_enabled BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF to_regprocedure('public.sync_department_friendships(integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.sync_department_friendships(INT) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.sync_department_friendships(INT) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.sync_department_friendships(INT) FROM authenticated';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.sync_department_friendships(INT);

-- Rows created by the removed auto-friend function have no accepted request
-- evidence. Remove them so mutual consent is required going forward.
DELETE FROM public.friendships
WHERE status = 'active'
  AND created_from_request_id IS NULL;

CREATE OR REPLACE FUNCTION public.get_department_friend_suggestions(
  p_limit INT DEFAULT 24
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID;
  v_school TEXT;
  v_department TEXT;
  v_discovery_enabled BOOLEAN;
  v_school_verified BOOLEAN;
  v_limit INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT
    NULLIF(regexp_replace(btrim(p.school), '[[:space:]]+', ' ', 'g'), ''),
    NULLIF(regexp_replace(btrim(p.department), '[[:space:]]+', ' ', 'g'), ''),
    p.department_friend_discovery_enabled,
    (
      u.school_email_verified_at IS NOT NULL
      AND lower(COALESCE(u.school_email, '')) LIKE '%@pusan.ac.kr'
    )
  INTO v_school, v_department, v_discovery_enabled, v_school_verified
  FROM public.profiles AS p
  LEFT JOIN public.users AS u ON u.id = p.user_id
  WHERE p.user_id = v_caller;

  IF v_school IS NULL THEN
    RAISE EXCEPTION 'profile_school_required';
  END IF;
  IF v_department IS NULL THEN
    RAISE EXCEPTION 'profile_department_required';
  END IF;
  IF NOT COALESCE(v_discovery_enabled, FALSE) THEN
    RAISE EXCEPTION 'department_discovery_consent_required';
  END IF;
  IF NOT COALESCE(v_school_verified, FALSE) THEN
    RAISE EXCEPTION 'school_verification_required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 50);

  RETURN QUERY
  SELECT p.user_id, p.display_name
  FROM public.profiles AS p
  JOIN public.users AS u ON u.id = p.user_id
  WHERE p.user_id <> v_caller
    AND p.department_friend_discovery_enabled = TRUE
    AND u.school_email_verified_at IS NOT NULL
    AND lower(COALESCE(u.school_email, '')) LIKE '%@pusan.ac.kr'
    AND lower(regexp_replace(btrim(p.school), '[[:space:]]+', ' ', 'g')) = lower(v_school)
    AND lower(regexp_replace(btrim(p.department), '[[:space:]]+', ' ', 'g')) = lower(v_department)
    AND NOT EXISTS (
      SELECT 1
      FROM public.friendships AS f
      WHERE f.user_id = LEAST(v_caller, p.user_id)
        AND f.friend_user_id = GREATEST(v_caller, p.user_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.friend_requests AS r
      WHERE r.status = 'pending'
        AND (
          (r.sender_user_id = v_caller AND r.receiver_user_id = p.user_id)
          OR (r.sender_user_id = p.user_id AND r.receiver_user_id = v_caller)
        )
    )
  ORDER BY p.updated_at DESC NULLS LAST, p.user_id
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_department_friend_suggestions(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_department_friend_suggestions(INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_department_friend_suggestions(INT) TO authenticated;

COMMENT ON FUNCTION public.get_department_friend_suggestions(INT) IS
  'Returns same-school and same-department suggestions only. Friendship creation requires a separate accepted friend request.';

-- Match readiness must count only deposits owned by the current match.
CREATE OR REPLACE FUNCTION public.confirm_match(
  p_match_id UUID
)
RETURNS TABLE (
  match_id UUID,
  status TEXT,
  group_a_confirmed_at TIMESTAMPTZ,
  group_b_confirmed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID;
  v_match public.matches%ROWTYPE;
  v_side TEXT;
  v_caller_group_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_a_at TIMESTAMPTZ;
  v_b_at TIMESTAMPTZ;
  v_new_status TEXT;
  v_new_confirmed_at TIMESTAMPTZ;
  v_active_count INT;
  v_card_count INT;
  v_deposit_count INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match
  FROM public.matches AS m
  WHERE m.id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.groups AS g
    WHERE g.id = v_match.group_a_id
      AND g.leader_user_id = v_caller
  ) THEN
    v_side := 'a';
    v_caller_group_id := v_match.group_a_id;
  ELSIF EXISTS (
    SELECT 1
    FROM public.groups AS g
    WHERE g.id = v_match.group_b_id
      AND g.leader_user_id = v_caller
  ) THEN
    v_side := 'b';
    v_caller_group_id := v_match.group_b_id;
  ELSE
    RAISE EXCEPTION 'not_match_leader';
  END IF;

  IF v_match.status <> 'pending' THEN
    RAISE EXCEPTION 'match_not_pending';
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM public.group_members AS gm
  WHERE gm.group_id = v_caller_group_id
    AND gm.left_at IS NULL;

  SELECT COUNT(DISTINCT cards.user_id) INTO v_card_count
  FROM public.match_card_submissions AS cards
  JOIN public.group_members AS gm
    ON gm.group_id = v_caller_group_id
   AND gm.user_id = cards.user_id
   AND gm.left_at IS NULL
  WHERE cards.match_id = p_match_id
    AND cards.group_id = v_caller_group_id;

  IF v_card_count < v_active_count THEN
    RAISE EXCEPTION 'match_card_incomplete';
  END IF;

  SELECT COUNT(DISTINCT d.user_id) INTO v_deposit_count
  FROM public.deposits AS d
  JOIN public.group_members AS gm
    ON gm.group_id = v_caller_group_id
   AND gm.user_id = d.user_id
   AND gm.left_at IS NULL
  WHERE d.match_id = p_match_id
    AND d.group_id = v_caller_group_id
    AND d.status IN ('paid', 'held');

  IF v_deposit_count < v_active_count THEN
    RAISE EXCEPTION 'deposit_not_paid';
  END IF;

  v_a_at := v_match.group_a_confirmed_at;
  v_b_at := v_match.group_b_confirmed_at;

  IF v_side = 'a' THEN
    IF v_a_at IS NULL THEN v_a_at := v_now; END IF;
  ELSE
    IF v_b_at IS NULL THEN v_b_at := v_now; END IF;
  END IF;

  IF v_a_at IS NOT NULL AND v_b_at IS NOT NULL THEN
    v_new_status := 'confirmed';
    v_new_confirmed_at := GREATEST(v_a_at, v_b_at);
    PERFORM public.assign_match_meeting_for_confirmed_match(p_match_id);
  ELSE
    v_new_status := 'pending';
    v_new_confirmed_at := NULL;
  END IF;

  UPDATE public.matches AS m
  SET group_a_confirmed_at = v_a_at,
      group_b_confirmed_at = v_b_at,
      status = v_new_status,
      confirmed_at = v_new_confirmed_at
  WHERE m.id = p_match_id;

  RETURN QUERY
  SELECT p_match_id, v_new_status, v_a_at, v_b_at, v_new_confirmed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_match(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_match(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_match(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_match_detail(
  p_match_id UUID
)
RETURNS TABLE (
  match_id UUID,
  my_group_id UUID,
  opp_group_id UUID,
  opp_group_size INT,
  opp_group_gender TEXT,
  match_status TEXT,
  matched_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  my_confirmed_at TIMESTAMPTZ,
  opp_confirmed_at TIMESTAMPTZ,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  venue_name TEXT,
  venue_address TEXT,
  venue_map_url TEXT,
  my_card_submitted_at TIMESTAMPTZ,
  my_card_content_text TEXT,
  my_group_active_count INT,
  my_group_card_submitted_count INT,
  my_group_deposit_paid_count INT,
  my_group_ready BOOLEAN,
  opp_group_active_count INT,
  opp_group_card_submitted_count INT,
  opp_group_deposit_paid_count INT,
  opp_group_ready BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID;
  v_match public.matches%ROWTYPE;
  v_in_a BOOLEAN;
  v_in_b BOOLEAN;
  v_my_group_id UUID;
  v_opp_group_id UUID;
  v_ga public.groups%ROWTYPE;
  v_gb public.groups%ROWTYPE;
  v_scheduled_start TIMESTAMPTZ;
  v_scheduled_end TIMESTAMPTZ;
  v_venue_name TEXT;
  v_venue_address TEXT;
  v_venue_map_url TEXT;
  v_my_active_count INT;
  v_my_card_count INT;
  v_my_deposit_count INT;
  v_opp_active_count INT;
  v_opp_card_count INT;
  v_opp_deposit_count INT;
  v_my_card_submitted_at TIMESTAMPTZ;
  v_my_card_content_text TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM public.lazy_complete_match(p_match_id);

  SELECT * INTO v_match
  FROM public.matches AS m
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_match.approval_status <> 'approved' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.group_members AS gm
    WHERE gm.group_id = v_match.group_a_id
      AND gm.user_id = v_caller
      AND gm.left_at IS NULL
  ) INTO v_in_a;

  SELECT EXISTS (
    SELECT 1
    FROM public.group_members AS gm
    WHERE gm.group_id = v_match.group_b_id
      AND gm.user_id = v_caller
      AND gm.left_at IS NULL
  ) INTO v_in_b;

  IF NOT v_in_a AND NOT v_in_b THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  v_my_group_id := CASE WHEN v_in_a THEN v_match.group_a_id ELSE v_match.group_b_id END;
  v_opp_group_id := CASE WHEN v_in_a THEN v_match.group_b_id ELSE v_match.group_a_id END;

  SELECT * INTO v_ga
  FROM public.groups AS g
  WHERE g.id = v_match.group_a_id;

  SELECT * INTO v_gb
  FROM public.groups AS g
  WHERE g.id = v_match.group_b_id;

  SELECT
    info.scheduled_start,
    info.scheduled_end,
    info.venue_name,
    info.venue_address,
    info.venue_map_url
  INTO
    v_scheduled_start,
    v_scheduled_end,
    v_venue_name,
    v_venue_address,
    v_venue_map_url
  FROM public.get_match_meeting_info(p_match_id) AS info;

  SELECT COUNT(*) INTO v_my_active_count
  FROM public.group_members AS gm
  WHERE gm.group_id = v_my_group_id
    AND gm.left_at IS NULL;

  SELECT COUNT(*) INTO v_opp_active_count
  FROM public.group_members AS gm
  WHERE gm.group_id = v_opp_group_id
    AND gm.left_at IS NULL;

  SELECT COUNT(DISTINCT cards.user_id) INTO v_my_card_count
  FROM public.match_card_submissions AS cards
  JOIN public.group_members AS gm
    ON gm.group_id = v_my_group_id
   AND gm.user_id = cards.user_id
   AND gm.left_at IS NULL
  WHERE cards.match_id = p_match_id
    AND cards.group_id = v_my_group_id;

  SELECT COUNT(DISTINCT cards.user_id) INTO v_opp_card_count
  FROM public.match_card_submissions AS cards
  JOIN public.group_members AS gm
    ON gm.group_id = v_opp_group_id
   AND gm.user_id = cards.user_id
   AND gm.left_at IS NULL
  WHERE cards.match_id = p_match_id
    AND cards.group_id = v_opp_group_id;

  SELECT COUNT(DISTINCT d.user_id) INTO v_my_deposit_count
  FROM public.deposits AS d
  JOIN public.group_members AS gm
    ON gm.group_id = v_my_group_id
   AND gm.user_id = d.user_id
   AND gm.left_at IS NULL
  WHERE d.match_id = p_match_id
    AND d.group_id = v_my_group_id
    AND d.status IN ('paid', 'held');

  SELECT COUNT(DISTINCT d.user_id) INTO v_opp_deposit_count
  FROM public.deposits AS d
  JOIN public.group_members AS gm
    ON gm.group_id = v_opp_group_id
   AND gm.user_id = d.user_id
   AND gm.left_at IS NULL
  WHERE d.match_id = p_match_id
    AND d.group_id = v_opp_group_id
    AND d.status IN ('paid', 'held');

  SELECT cards.updated_at, cards.content_text
  INTO v_my_card_submitted_at, v_my_card_content_text
  FROM public.match_card_submissions AS cards
  WHERE cards.match_id = p_match_id
    AND cards.user_id = v_caller;

  RETURN QUERY
  SELECT
    v_match.id,
    v_my_group_id,
    v_opp_group_id,
    CASE WHEN v_in_a THEN v_gb.size ELSE v_ga.size END,
    public.get_group_composition_gender(
      CASE WHEN v_in_a THEN v_match.group_b_id ELSE v_match.group_a_id END
    ),
    v_match.status::TEXT,
    v_match.matched_at,
    v_match.confirmed_at,
    v_match.completed_at,
    CASE WHEN v_in_a THEN v_match.group_a_confirmed_at ELSE v_match.group_b_confirmed_at END,
    CASE WHEN v_in_a THEN v_match.group_b_confirmed_at ELSE v_match.group_a_confirmed_at END,
    v_scheduled_start,
    v_scheduled_end,
    v_venue_name,
    v_venue_address,
    v_venue_map_url,
    v_my_card_submitted_at,
    v_my_card_content_text,
    v_my_active_count,
    v_my_card_count,
    v_my_deposit_count,
    v_my_active_count > 0
      AND v_my_card_count >= v_my_active_count
      AND v_my_deposit_count >= v_my_active_count,
    v_opp_active_count,
    v_opp_card_count,
    v_opp_deposit_count,
    v_opp_active_count > 0
      AND v_opp_card_count >= v_opp_active_count
      AND v_opp_deposit_count >= v_opp_active_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_match_detail(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_match_detail(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_match_detail(UUID) TO authenticated;
