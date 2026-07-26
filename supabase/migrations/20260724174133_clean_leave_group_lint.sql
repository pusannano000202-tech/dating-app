-- Keep the final leave_group definition warning-free and schema-qualified.

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
SET search_path = ''
AS $$
DECLARE
  v_caller UUID;
  v_group public.groups%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_group
    FROM public.groups AS g
   WHERE g.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id = v_caller THEN
    RAISE EXCEPTION 'leader_cannot_leave';
  END IF;

  PERFORM 1
    FROM public.group_members AS gm
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
  UPDATE public.group_members AS gm
     SET left_at = v_now
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_caller
     AND gm.left_at IS NULL;
  PERFORM set_config('app.bypass_group_members_guard', 'off', TRUE);

  IF v_group.status IN ('ready', 'in_pool') THEN
    PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
    UPDATE public.match_pool AS mp
       SET status = 'cancelled'
     WHERE mp.group_id = p_group_id
       AND mp.status IN ('waiting', 'rolled_over');
    PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);

    PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
    UPDATE public.groups AS g
       SET status = 'forming'
     WHERE g.id = p_group_id;
    PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);
  END IF;

  RETURN QUERY SELECT p_group_id, v_caller, v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_group(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_group(UUID) TO authenticated;

COMMENT ON FUNCTION public.leave_group(UUID) IS
  'Non-leader active member leaves a forming/ready/in_pool group; queued pool entries are cancelled and group status reopens.';
