-- Migration: 그룹 떠나기 / 해체 RPC
-- Owner:  충현
-- Decision: 그룹 생성한 사용자가 다시 나갈 경로 없음 → critical UX
-- Date:   2026-05-21
--
-- 동작:
--   1) leave_group: 본인이 비-리더 멤버이면 left_at = NOW()
--                   리더이면 거부 (먼저 disband 또는 리더 위임 필요)
--   2) disband_group: 본인이 리더면 groups.status='disbanded' 로 set →
--                     z11 트리거가 active 멤버 전원 left_at 자동 set
--                     이미 큐 진입 상태라면 거부 (큐 cancel 먼저 필요)

CREATE OR REPLACE FUNCTION public.leave_group(
  p_group_id UUID
)
RETURNS TABLE (
  group_id UUID,
  member_user_id UUID,
  left_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group groups%ROWTYPE;
  v_member group_members%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_group FROM groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id = v_caller THEN
    RAISE EXCEPTION 'leader_cannot_leave';
  END IF;

  SELECT * INTO v_member
    FROM group_members
   WHERE group_id = p_group_id AND user_id = v_caller AND left_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_active_member';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready') THEN
    RAISE EXCEPTION 'group_locked';
  END IF;

  PERFORM set_config('app.bypass_group_members_guard', 'on', TRUE);
  UPDATE group_members
     SET left_at = v_now
   WHERE group_id = p_group_id AND user_id = v_caller AND left_at IS NULL;
  PERFORM set_config('app.bypass_group_members_guard', 'off', TRUE);

  -- 큐에 있는데 멤버가 빠지면 큐 취소 (멤버가 2 미만이면 매칭 의미 없음)
  IF v_group.status = 'ready' THEN
    PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
    UPDATE match_pool
       SET status = 'cancelled'
     WHERE match_pool.group_id = p_group_id
       AND status IN ('waiting', 'rolled_over');
    PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);

    PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
    UPDATE groups SET status = 'forming' WHERE id = p_group_id;
    PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);
  END IF;

  RETURN QUERY SELECT p_group_id, v_caller, v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_group(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.disband_group(
  p_group_id UUID
)
RETURNS TABLE (
  group_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group groups%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_group FROM groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id <> v_caller THEN
    RAISE EXCEPTION 'not_group_leader';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready') THEN
    RAISE EXCEPTION 'group_locked';
  END IF;

  -- 큐에 있으면 먼저 cancel
  IF v_group.status = 'ready' THEN
    PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
    UPDATE match_pool
       SET status = 'cancelled'
     WHERE match_pool.group_id = p_group_id
       AND status IN ('waiting', 'rolled_over');
    PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);
  END IF;

  PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
  UPDATE groups SET status = 'disbanded' WHERE id = p_group_id;
  PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);

  -- z11 트리거 handle_group_terminal_status 가 group_members.left_at 자동 set

  RETURN QUERY SELECT p_group_id, 'disbanded'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disband_group(UUID) TO authenticated;

COMMENT ON FUNCTION public.leave_group(UUID) IS
  '비-리더 멤버가 그룹 떠나기. 큐에 있던 그룹은 큐 cancel 후 status=forming 복귀.';
COMMENT ON FUNCTION public.disband_group(UUID) IS
  '리더가 그룹 해체. groups.status=disbanded → z11 트리거가 멤버 left_at 자동 set.';
