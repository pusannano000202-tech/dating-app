-- Migration: support member exit/removal while a group is explicitly in_pool.
-- Purpose:
--   Earlier queue RPCs mostly used groups.status='ready' for queued groups, but
--   the schema and frontend also allow 'in_pool'. If a group ever reaches
--   in_pool, members must still be able to leave or be removed before a match is
--   actually locked. Both flows cancel active pool entries and reopen the group.

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

  SELECT *
    INTO v_group
    FROM groups AS g
   WHERE g.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id = v_caller THEN
    RAISE EXCEPTION 'leader_cannot_leave';
  END IF;

  SELECT *
    INTO v_member
    FROM group_members AS gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_caller
     AND gm.left_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_active_member';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready', 'in_pool') THEN
    RAISE EXCEPTION 'group_locked';
  END IF;

  PERFORM set_config('app.bypass_group_members_guard', 'on', TRUE);
  UPDATE group_members AS gm
     SET left_at = v_now
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_caller
     AND gm.left_at IS NULL;
  PERFORM set_config('app.bypass_group_members_guard', 'off', TRUE);

  IF v_group.status IN ('ready', 'in_pool') THEN
    PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
    UPDATE match_pool AS mp
       SET status = 'cancelled'
     WHERE mp.group_id = p_group_id
       AND mp.status IN ('waiting', 'rolled_over');
    PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);

    PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
    UPDATE groups AS g
       SET status = 'forming'
     WHERE g.id = p_group_id;
    PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);
  END IF;

  RETURN QUERY SELECT p_group_id, v_caller, v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_group(UUID) TO authenticated;

COMMENT ON FUNCTION public.leave_group(UUID) IS
  'Non-leader active member leaves a forming/ready/in_pool group; queued pool entries are cancelled and group status reopens.';

CREATE OR REPLACE FUNCTION public.remove_group_member(
  p_group_id UUID,
  p_member_user_id UUID
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

  IF p_member_user_id IS NULL THEN
    RAISE EXCEPTION 'member_user_id_required';
  END IF;

  SELECT *
    INTO v_group
    FROM groups AS g
   WHERE g.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id <> v_caller THEN
    RAISE EXCEPTION 'not_group_leader';
  END IF;

  IF p_member_user_id = v_caller THEN
    RAISE EXCEPTION 'cannot_remove_self';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready', 'in_pool') THEN
    RAISE EXCEPTION 'group_locked';
  END IF;

  SELECT *
    INTO v_member
    FROM group_members AS gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = p_member_user_id
     AND gm.left_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_active_member';
  END IF;

  IF v_member.role = 'leader' THEN
    RAISE EXCEPTION 'cannot_remove_leader';
  END IF;

  PERFORM set_config('app.bypass_group_members_guard', 'on', TRUE);
  UPDATE group_members AS gm
     SET left_at = v_now
   WHERE gm.group_id = p_group_id
     AND gm.user_id = p_member_user_id
     AND gm.left_at IS NULL;
  PERFORM set_config('app.bypass_group_members_guard', 'off', TRUE);

  IF v_group.status IN ('ready', 'in_pool') THEN
    PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
    UPDATE match_pool AS mp
       SET status = 'cancelled'
     WHERE mp.group_id = p_group_id
       AND mp.status IN ('waiting', 'rolled_over');
    PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);
  END IF;

  IF v_group.status <> 'forming' THEN
    PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
    UPDATE groups AS g
       SET status = 'forming'
     WHERE g.id = p_group_id;
    PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);
  END IF;

  RETURN QUERY SELECT p_group_id, p_member_user_id, v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.remove_group_member(UUID, UUID) IS
  'Leader marks a non-leader active member left in a forming/ready/in_pool group; queued pool entries are cancelled and leader rows are protected.';
