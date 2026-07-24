-- Migration: 그룹 리더 위임 RPC
-- Owner:  충현
-- Decision: 리더가 떠날 수 없는 한계 (z27 leave_group: leader_cannot_leave).
--           disband 만 가능 → 다른 멤버에게 리더 위임 후 떠나는 경로 필요.
-- Date:   2026-05-22
--
-- 동작:
--   - 입력: p_group_id, p_new_leader_user_id
--   - 호출자가 현재 리더여야 함
--   - 새 리더는 active 멤버여야 하고 본인 아니어야 함
--   - groups.status 가 forming / ready 일 때만 허용 (matched/disbanded/cancelled 등은 거부)
--   - groups.leader_user_id 만 갱신 (created_by 는 불변)

CREATE OR REPLACE FUNCTION public.transfer_group_leadership(
  p_group_id UUID,
  p_new_leader_user_id UUID
)
RETURNS TABLE (
  group_id UUID,
  new_leader_user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group groups%ROWTYPE;
  v_target_active BOOLEAN;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_new_leader_user_id IS NULL THEN
    RAISE EXCEPTION 'new_leader_required';
  END IF;

  IF p_new_leader_user_id = v_caller THEN
    RAISE EXCEPTION 'new_leader_is_caller';
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

  SELECT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id = p_group_id
       AND user_id = p_new_leader_user_id
       AND left_at IS NULL
  ) INTO v_target_active;

  IF NOT v_target_active THEN
    RAISE EXCEPTION 'new_leader_not_member';
  END IF;

  PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
  UPDATE groups
     SET leader_user_id = p_new_leader_user_id
   WHERE id = p_group_id;
  PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);

  RETURN QUERY SELECT p_group_id, p_new_leader_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_group_leadership(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.transfer_group_leadership(UUID, UUID) IS
  '리더가 같은 그룹의 active 멤버에게 리더 위임. groups.status forming/ready 일 때만 허용.';
