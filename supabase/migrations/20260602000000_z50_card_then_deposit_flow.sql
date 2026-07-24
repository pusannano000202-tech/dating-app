-- Migration: move deposit payment after provisional match card creation.
-- Date: 2026-06-02
--
-- Queue entry no longer requires paid deposits. Deposits are now collected after
-- a provisional match exists and users complete the match card step.

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

  IF v_active_count > v_group.size THEN
    RAISE EXCEPTION 'group_overflow';
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

CREATE TABLE IF NOT EXISTS public.match_member_aliases (
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  viewer_group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_theme TEXT NOT NULL DEFAULT 'animals',
  sort_order INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, viewer_group_id, target_user_id),
  UNIQUE (match_id, viewer_group_id, alias)
);

ALTER TABLE public.match_member_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_member_aliases_select_viewer_group_members
  ON public.match_member_aliases;

CREATE POLICY match_member_aliases_select_viewer_group_members
  ON public.match_member_aliases
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.group_members gm
       WHERE gm.group_id = match_member_aliases.viewer_group_id
         AND gm.user_id = auth.uid()
         AND gm.left_at IS NULL
    )
  );

COMMENT ON FUNCTION public.enter_match_pool(UUID) IS
  'Leader queue entry. Requires active members >= 2, but deposit payment happens after provisional match card creation.';

COMMENT ON TABLE public.match_member_aliases IS
  'Per viewer-group anonymous aliases for matched counterpart members during card reveal.';
