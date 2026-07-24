-- Migration: enter_match_pool 에 보증금 검증 추가 + mock 결제 RPC
-- Owner:  충현
-- Decision: MASTER_PLAN_V1_6 12.C (보증금 / 토스페이먼츠)
-- Date:   2026-05-21
--
-- 배경:
--   - v1 정의서: 1인당 2만원 보증금 (lib/constants.ts DEPOSIT_AMOUNT)
--   - 토스페이먼츠 통합 미완 → 본 단계는 mock 결제로 흐름만 완성
--   - enter_match_pool 이 deposits.status='paid' 검증 없이 큐 진입 가능했음
--
-- 변경:
--   1) enter_match_pool RPC 재정의:
--      - 활성 멤버 전원이 paid/held 보증금 보유 시에만 큐 진입 허용
--      - 에러 코드: deposit_not_paid
--   2) mock_pay_deposit RPC: 본인 + 그룹 멤버 검증 후 deposits insert (status='paid')
--      → 토스 결제 통합 시 deposits insert + 결제창 → webhook → paid 흐름으로 교체될 자리
--   3) cancel_match_pool 은 영향 없음 (취소 시 보증금 환불 흐름은 별도)

-- ─────────────────────────────────────────────
-- enter_match_pool 재정의 (deposit 검증 추가)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enter_match_pool(
  p_group_id UUID
)
RETURNS TABLE (
  pool_id UUID,
  group_id UUID,
  group_status TEXT,
  pool_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group groups%ROWTYPE;
  v_active_count INT;
  v_unpaid_count INT;
  v_existing UUID;
  v_pool_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_group
    FROM groups
   WHERE id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id <> v_caller THEN
    RAISE EXCEPTION 'not_group_leader';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready') THEN
    RAISE EXCEPTION 'group_not_open';
  END IF;

  SELECT id
    INTO v_existing
    FROM match_pool
   WHERE match_pool.group_id = p_group_id
     AND status IN ('waiting', 'rolled_over')
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'already_in_queue';
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM group_members
   WHERE group_members.group_id = p_group_id
     AND left_at IS NULL;

  IF v_active_count < 2 THEN
    RAISE EXCEPTION 'not_enough_members';
  END IF;

  IF v_active_count > v_group.size THEN
    RAISE EXCEPTION 'group_overflow';
  END IF;

  -- 보증금 검증: 활성 멤버 중 paid/held deposit 이 없는 사람이 있으면 거부
  SELECT COUNT(*)
    INTO v_unpaid_count
    FROM group_members gm
   WHERE gm.group_id = p_group_id
     AND gm.left_at IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM deposits d
        WHERE d.group_id = gm.group_id
          AND d.user_id = gm.user_id
          AND d.status IN ('paid', 'held')
     );

  IF v_unpaid_count > 0 THEN
    RAISE EXCEPTION 'deposit_not_paid';
  END IF;

  IF v_group.status = 'forming' THEN
    PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
    UPDATE groups SET status = 'ready' WHERE id = p_group_id;
    PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);
  END IF;

  PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
  INSERT INTO match_pool (group_id, status, rollover_count, batch_id)
  VALUES (p_group_id, 'waiting', 0, NULL)
  RETURNING id INTO v_pool_id;
  PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);

  RETURN QUERY
  SELECT v_pool_id, p_group_id, 'ready'::TEXT, 'waiting'::TEXT;
END;
$$;

-- ─────────────────────────────────────────────
-- mock_pay_deposit: 토스 통합 전 임시 보증금 결제
-- 토스 통합 후 교체 자리: client SDK -> webhook -> deposits.status='paid'
-- ─────────────────────────────────────────────
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
  v_active BOOLEAN;
  v_existing UUID;
  v_deposit_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT TRUE INTO v_active
    FROM group_members gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_caller
     AND gm.left_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_group_member';
  END IF;

  SELECT id INTO v_existing
    FROM deposits
   WHERE group_id = p_group_id
     AND user_id = v_caller
     AND status IN ('paid', 'held', 'pending')
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

COMMENT ON FUNCTION public.enter_match_pool(UUID) IS
  '리더 호출. 활성 멤버 >= 2 + 전원 paid/held 보증금 + groups status / match_pool waiting insert.';
COMMENT ON FUNCTION public.mock_pay_deposit(UUID, INT) IS
  '토스 통합 전 임시 보증금 결제. 본인 + 그룹 멤버 검증 후 deposits paid insert. 후속에서 토스 흐름으로 교체.';
