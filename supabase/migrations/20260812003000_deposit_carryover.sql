-- Preserve the original provider payment while moving the active 10,000 won
-- deposit entitlement to a later match. Every move is recorded independently.

CREATE TABLE public.deposit_carryovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id UUID NOT NULL REFERENCES public.deposits(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT,
  target_match_id UUID REFERENCES public.matches(id) ON DELETE RESTRICT,
  target_group_id UUID REFERENCES public.groups(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'applied', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  CONSTRAINT deposit_carryovers_source_once
    UNIQUE (deposit_id, source_match_id),
  CONSTRAINT deposit_carryovers_applied_target_valid CHECK (
    (status = 'applied' AND target_match_id IS NOT NULL AND target_group_id IS NOT NULL AND applied_at IS NOT NULL)
    OR
    (status <> 'applied' AND target_match_id IS NULL AND target_group_id IS NULL AND applied_at IS NULL)
  )
);

CREATE UNIQUE INDEX deposit_carryovers_one_available_per_user_idx
  ON public.deposit_carryovers (user_id)
  WHERE status = 'available';

CREATE INDEX deposit_carryovers_deposit_idx
  ON public.deposit_carryovers (deposit_id, created_at DESC);

ALTER TABLE public.deposit_carryovers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.deposit_carryovers FROM PUBLIC;
REVOKE ALL ON TABLE public.deposit_carryovers FROM anon;
REVOKE ALL ON TABLE public.deposit_carryovers FROM authenticated;
GRANT SELECT ON TABLE public.deposit_carryovers TO authenticated;
GRANT ALL ON TABLE public.deposit_carryovers TO service_role;

CREATE POLICY deposit_carryovers_select_self
  ON public.deposit_carryovers
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.choose_deposit_carryover(p_match_id UUID)
RETURNS TABLE (
  carryover_id UUID,
  deposit_id UUID,
  source_match_id UUID,
  carryover_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_match public.matches%ROWTYPE;
  v_deposit public.deposits%ROWTYPE;
  v_carryover public.deposit_carryovers%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members AS gm
    WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
      AND gm.user_id = v_caller
      AND gm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposits AS d
  WHERE d.match_id = p_match_id
    AND d.user_id = v_caller
    AND d.status IN ('paid', 'held')
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.deposits AS d
      WHERE d.match_id = p_match_id
        AND d.user_id = v_caller
        AND d.status = 'forfeited'
    ) THEN
      RAISE EXCEPTION 'no_show_cannot_carryover';
    END IF;
    RAISE EXCEPTION 'deposit_not_available_for_carryover';
  END IF;
  IF v_deposit.amount <> 10000 THEN
    RAISE EXCEPTION 'deposit_amount_not_carryable';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.deposit_refund_requests AS r
    WHERE r.deposit_id = v_deposit.id
      AND r.status IN ('pending', 'processed')
  ) THEN
    RAISE EXCEPTION 'refund_already_requested';
  END IF;

  SELECT * INTO v_carryover
  FROM public.deposit_carryovers AS c
  WHERE c.deposit_id = v_deposit.id
    AND c.source_match_id = p_match_id
  FOR UPDATE;

  IF v_carryover.id IS NOT NULL AND v_carryover.status = 'available' THEN
    RETURN QUERY SELECT v_carryover.id, v_carryover.deposit_id,
      v_carryover.source_match_id, v_carryover.status;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.deposit_carryovers AS c
    WHERE c.user_id = v_caller
      AND c.status = 'available'
  ) THEN
    RAISE EXCEPTION 'carryover_already_available';
  END IF;

  IF v_carryover.id IS NOT NULL AND v_carryover.status = 'cancelled' THEN
    UPDATE public.deposit_carryovers AS c
    SET status = 'available'
    WHERE c.id = v_carryover.id
    RETURNING * INTO v_carryover;
  ELSE
    INSERT INTO public.deposit_carryovers (
      deposit_id, user_id, source_match_id, status
    ) VALUES (
      v_deposit.id, v_caller, p_match_id, 'available'
    )
    RETURNING * INTO v_carryover;
  END IF;

  UPDATE public.deposits AS d
  SET status = 'held',
      updated_at = NOW(),
      notes = concat_ws(E'\n', NULLIF(d.notes, ''),
        'carryover_available:' || v_carryover.id::TEXT)
  WHERE d.id = v_deposit.id;

  RETURN QUERY SELECT v_carryover.id, v_carryover.deposit_id,
    v_carryover.source_match_id, v_carryover.status;
END;
$$;

REVOKE ALL ON FUNCTION public.choose_deposit_carryover(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.choose_deposit_carryover(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.choose_deposit_carryover(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_deposit_carryover_for_refund(p_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_updated INT := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.deposit_carryovers AS c
  SET status = 'cancelled'
  WHERE c.user_id = v_caller
    AND c.source_match_id = p_match_id
    AND c.status = 'available';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_deposit_carryover_for_refund(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_deposit_carryover_for_refund(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_deposit_carryover_for_refund(UUID) TO authenticated;

-- Relationship and deposit choices are independent. Switching from carryover
-- to refund is performed inside this RPC so the deposit cannot be stranded if
-- a second request fails between the two state changes.
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members AS gm
    WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
      AND gm.user_id = v_caller
      AND gm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_match_participant';
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

  UPDATE public.deposit_carryovers AS c
  SET status = 'cancelled'
  WHERE c.deposit_id = v_deposit.id
    AND c.user_id = v_caller
    AND c.source_match_id = p_match_id
    AND c.status = 'available';

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

CREATE OR REPLACE FUNCTION public.apply_available_deposit_carryover(
  p_match_id UUID,
  p_group_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  match_id UUID,
  status TEXT,
  toss_order_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_carryover public.deposit_carryovers%ROWTYPE;
  v_deposit public.deposits%ROWTYPE;
BEGIN
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

  SELECT * INTO v_carryover
  FROM public.deposit_carryovers AS c
  WHERE c.user_id = p_user_id
    AND c.status = 'available'
  ORDER BY c.created_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposits AS d
  WHERE d.id = v_carryover.deposit_id
    AND d.user_id = p_user_id
    AND d.match_id = v_carryover.source_match_id
    AND d.status = 'held'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'carryover_deposit_mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.deposits AS d
    WHERE d.match_id = p_match_id
      AND d.user_id = p_user_id
      AND d.status IN ('pending', 'paid', 'held')
  ) THEN
    RAISE EXCEPTION 'target_deposit_already_exists';
  END IF;

  UPDATE public.deposits AS d
  SET match_id = p_match_id,
      group_id = p_group_id,
      status = 'held',
      updated_at = NOW(),
      notes = concat_ws(E'\n', NULLIF(d.notes, ''),
        'carryover_applied:' || v_carryover.id::TEXT || ':' || p_match_id::TEXT)
  WHERE d.id = v_deposit.id
  RETURNING d.* INTO v_deposit;

  UPDATE public.deposit_carryovers AS c
  SET status = 'applied',
      target_match_id = p_match_id,
      target_group_id = p_group_id,
      applied_at = NOW()
  WHERE c.id = v_carryover.id;

  RETURN QUERY SELECT v_deposit.id, v_deposit.match_id,
    v_deposit.status, v_deposit.toss_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_available_deposit_carryover(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_available_deposit_carryover(UUID, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.apply_available_deposit_carryover(UUID, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_available_deposit_carryover(UUID, UUID, UUID) TO service_role;

-- A carryover choice and a refund request are mutually exclusive.
CREATE OR REPLACE FUNCTION public.guard_refund_against_carryover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.deposit_carryovers AS c
    WHERE c.deposit_id = NEW.deposit_id
      AND c.source_match_id = NEW.match_id
      AND c.status IN ('available', 'applied')
  ) THEN
    RAISE EXCEPTION 'deposit_carryover_selected';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_refund_against_carryover
  ON public.deposit_refund_requests;
CREATE TRIGGER guard_refund_against_carryover
  BEFORE INSERT OR UPDATE ON public.deposit_refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_refund_against_carryover();

-- Relationship choices no longer make a financial choice for the user.
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
      SELECT 1 FROM public.deposits AS d
      WHERE d.match_id = NEW.match_id
        AND d.user_id = gm.user_id
        AND d.status = 'forfeited'
    );

  SELECT COUNT(*) FILTER (WHERE c.choice = 'continue')
  INTO v_continue
  FROM public.match_continuation_choices AS c
  WHERE c.match_id = NEW.match_id;

  IF v_total > 0 AND v_continue = v_total THEN
    PERFORM public.notify_match_members(NEW.match_id, 'both_continue', '{}'::jsonb);
  END IF;
  IF NEW.choice = 'end' THEN
    PERFORM public.notify_match_members(NEW.match_id, 'review_request', '{}'::jsonb);
  END IF;

  RETURN NEW;
END;
$$;

-- If no financial choice is made within 14 days, default to a full refund.
CREATE OR REPLACE FUNCTION public.expire_refund_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_queued INT := 0;
BEGIN
  WITH eligible AS MATERIALIZED (
    SELECT
      m.id AS match_id,
      d.user_id,
      d.id AS deposit_id,
      d.amount
    FROM public.matches AS m
    JOIN public.deposits AS d
      ON d.match_id = m.id
     AND d.status IN ('paid', 'held')
    WHERE m.status = 'completed'
      AND m.completed_at <= NOW() - INTERVAL '14 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.deposit_carryovers AS c
        WHERE c.deposit_id = d.id
          AND c.source_match_id = m.id
          AND c.status IN ('available', 'applied')
      )
    FOR UPDATE OF d SKIP LOCKED
  )
  INSERT INTO public.deposit_refund_requests (
    match_id, user_id, deposit_id, requested_refund_amount, status, processed_at
  )
  SELECT e.match_id, e.user_id, e.deposit_id, e.amount, 'pending', NULL
  FROM eligible AS e
  ON CONFLICT (match_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_queued = ROW_COUNT;
  RETURN v_queued;
END;
$$;

COMMENT ON TABLE public.deposit_carryovers IS
  'Immutable history for moving one provider-backed deposit between matches.';
COMMENT ON FUNCTION public.choose_deposit_carryover(UUID) IS
  'Authenticated user choice to retain a completed-match deposit for reuse.';
COMMENT ON FUNCTION public.cancel_deposit_carryover_for_refund(UUID) IS
  'Cancels an unused carryover so its original completed match can be refunded.';
COMMENT ON FUNCTION public.apply_available_deposit_carryover(UUID, UUID, UUID) IS
  'Service-only transfer of an available deposit to an exact next match and group.';
