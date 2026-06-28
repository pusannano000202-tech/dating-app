-- Migration: harden leader member removal.
-- Purpose:
--   remove_group_member already soft-removes active members with left_at and
--   cancels queue state. This guard makes the database reject removal of any
--   leader row, not only the caller, so corrupted or stale membership roles
--   cannot leave a group without an active leader.
--
-- Note:
--   Supabase CLI was not available in this workspace, so this migration file was
--   added manually with a timestamp later than the existing group-member
--   composition migrations.

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

  IF v_group.status NOT IN ('forming', 'ready') THEN
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

  PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
  UPDATE match_pool AS mp
     SET status = 'cancelled'
   WHERE mp.group_id = p_group_id
     AND mp.status IN ('waiting', 'rolled_over');
  PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);

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
  'Leader removes a non-leader active member from a forming/ready group; queue state is cancelled and leader rows are protected.';
