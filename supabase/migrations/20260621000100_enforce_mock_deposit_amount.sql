-- Phase: deposit policy hardening
-- Purpose: keep the local/mock payment RPC aligned with the current 10,000 KRW deposit policy.
-- Safety: this does not call any external payment provider and does not touch production data by itself.

CREATE OR REPLACE FUNCTION public.mock_pay_deposit(
  p_group_id UUID,
  p_amount INT
)
RETURNS TABLE (
  deposit_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_existing UUID;
  v_deposit_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <> 10000 THEN
    RAISE EXCEPTION 'invalid_deposit_amount';
  END IF;

  PERFORM 1
    FROM group_members AS gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_caller
     AND gm.left_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_group_member';
  END IF;

  SELECT d.id INTO v_existing
    FROM deposits AS d
   WHERE d.group_id = p_group_id
     AND d.user_id = v_caller
     AND d.status IN ('paid', 'held', 'pending')
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'deposit_already_exists';
  END IF;

  INSERT INTO deposits (
    user_id, group_id, amount, status,
    toss_payment_key, toss_order_id, paid_at
  )
  VALUES (
    v_caller, p_group_id, p_amount, 'paid',
    'MOCK_' || REPLACE(gen_random_uuid()::TEXT, '-', ''),
    'MOCK_' || REPLACE(gen_random_uuid()::TEXT, '-', ''),
    NOW()
  )
  RETURNING id INTO v_deposit_id;

  RETURN QUERY
  SELECT v_deposit_id, 'paid'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mock_pay_deposit(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.mock_pay_deposit(UUID, INT) IS
  'Temporary mock deposit payment for local/test payment flow. Enforces the current 10,000원 deposit amount.';
