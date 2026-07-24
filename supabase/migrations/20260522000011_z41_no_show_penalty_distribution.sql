-- Migration: 노쇼 페널티 분배 RPC
-- Owner:  충현
-- Decision: DISPUTE_CONFIG.NO_SHOW_DISTRIBUTION='attendees_equal' (8-9) 정책 자동화.
--           v1 에서는 운영자/admin 이 수동 호출. v1.1 에서 GPS 출석 결과로 자동 호출.
-- Date:   2026-05-22
--
-- RPC: distribute_no_show_penalty(p_match_id UUID, p_no_show_user_ids UUID[])
--   1. 매칭 status='completed' 여야 함
--   2. p_no_show_user_ids 는 매칭 참여 그룹의 active 멤버여야 함
--   3. 각 no-show 사용자의 deposits 가 status='paid' or 'held' 여야 함
--   4. attendees = (전체 참여 멤버) - (no_show_user_ids)
--   5. 각 no-show deposit: status='forfeited', distribution_to=attendees[], refunded_at=NOW()
--   6. 출석자 deposits 는 별도 RPC (refund_attendee_deposits) 가 처리 — 본 RPC는 페널티만
--
-- 권한: 본 RPC 는 매칭 참여자 누구나 호출 가능하지만, 실제 운영은 admin/ops 만 호출하도록
--       애플리케이션 레이어에서 제한 (v1.1 admin 페이지). v1 에서는 직접 호출 X.

CREATE OR REPLACE FUNCTION public.distribute_no_show_penalty(
  p_match_id UUID,
  p_no_show_user_ids UUID[]
)
RETURNS TABLE (
  forfeited_count INT,
  attendee_count  INT,
  total_forfeited_amount INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_total_amount INT := 0;
  v_forfeited INT := 0;
  v_attendees UUID[];
  v_all_participants UUID[];
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_no_show_user_ids IS NULL OR array_length(p_no_show_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_show_list_empty';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.status <> 'completed' THEN
    RAISE EXCEPTION 'match_not_completed';
  END IF;

  -- 호출자가 매칭 참여자인지 확인 (or v1.1 admin role)
  IF NOT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND user_id = v_caller
       AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  -- 전체 참여자 = 양쪽 그룹 active 멤버 (left_at IS NULL)
  SELECT array_agg(gm.user_id) INTO v_all_participants
    FROM group_members gm
   WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND gm.left_at IS NULL;

  -- p_no_show 가 모두 참여자에 포함되는지 검증
  IF NOT (p_no_show_user_ids <@ v_all_participants) THEN
    RAISE EXCEPTION 'no_show_user_not_participant';
  END IF;

  -- 출석자 = 전체 - 노쇼
  v_attendees := ARRAY(
    SELECT u FROM unnest(v_all_participants) u
     WHERE u <> ALL (p_no_show_user_ids)
  );

  IF array_length(v_attendees, 1) IS NULL THEN
    RAISE EXCEPTION 'no_attendees_to_distribute';
  END IF;

  -- 노쇼 보증금 forfeit + distribution_to 채우기
  -- deposits 정책: user_id = auth.uid() 만 접근. SECURITY DEFINER 라 우회 가능.
  UPDATE deposits
     SET status = 'forfeited',
         distribution_to = v_attendees,
         refunded_at = NOW(),
         notes = COALESCE(notes || ' | ', '') || 'forfeited via distribute_no_show_penalty match=' || p_match_id::TEXT
   WHERE user_id = ANY (p_no_show_user_ids)
     AND group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND status IN ('paid', 'held');

  GET DIAGNOSTICS v_forfeited = ROW_COUNT;

  SELECT COALESCE(SUM(amount), 0)::INT INTO v_total_amount
    FROM deposits
   WHERE user_id = ANY (p_no_show_user_ids)
     AND group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND status = 'forfeited';

  RETURN QUERY SELECT v_forfeited, array_length(v_attendees, 1), v_total_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.distribute_no_show_penalty(UUID, UUID[]) TO authenticated;

COMMENT ON FUNCTION public.distribute_no_show_penalty(UUID, UUID[]) IS
  '노쇼 보증금 forfeit + 출석자에게 균등 분배 (8-9). v1 수동 호출, v1.1 GPS 자동.';
