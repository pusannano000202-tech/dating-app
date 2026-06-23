-- Migration: expose safe active-member gender in group member summaries.
-- Purpose:
--   The group UI needs to show "male/female/mixed" composition from active
--   members, so stale groups.gender never drives the visible matching state.
--   This exposes only profile gender with the existing member summary fields.

DROP FUNCTION IF EXISTS public.get_group_member_summaries(UUID);

CREATE OR REPLACE FUNCTION public.get_group_member_summaries(
  p_group_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  gender TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM group_members gm
     WHERE gm.group_id = p_group_id
       AND gm.user_id = auth.uid()
       AND gm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_group_member';
  END IF;

  RETURN QUERY
  SELECT
    gm.user_id,
    p.display_name,
    p.gender::TEXT,
    gm.role::TEXT,
    gm.joined_at
  FROM group_members gm
  LEFT JOIN profiles p ON p.user_id = gm.user_id
  WHERE gm.group_id = p_group_id
    AND gm.left_at IS NULL
  ORDER BY gm.joined_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_member_summaries(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_group_member_summaries(UUID) IS
  'Returns active group member summary including safe profile gender for current group composition UI.';
