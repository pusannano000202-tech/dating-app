-- Migration: require exact group size before entering the match pool.
-- Purpose:
--   The product has separate 2:2 and 3:3 matching paths. A group selecting 3:3
--   must not enter the queue with only two active members. This keeps the
--   Supabase RPC aligned with the frontend gate in /api/match-pool/enter.

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

  IF v_active_count <> v_group.size THEN
    RAISE EXCEPTION 'group_not_full';
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

GRANT EXECUTE ON FUNCTION public.enter_match_pool(UUID) TO authenticated;

COMMENT ON FUNCTION public.enter_match_pool(UUID) IS
  'Leader queue entry. Requires active member count to equal groups.size. Deposits are collected after provisional match card creation.';
