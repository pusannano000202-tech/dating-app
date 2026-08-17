BEGIN;

-- This helper reads group_members as its owner so the policy below never
-- re-enters group_members RLS while checking the caller's membership.
CREATE OR REPLACE FUNCTION public.is_active_group_member(
  p_group_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.group_members AS membership
      WHERE membership.group_id = p_group_id
        AND membership.user_id = (SELECT auth.uid())
        AND membership.left_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.is_active_group_member(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_group_member(UUID)
  TO authenticated;

DROP POLICY IF EXISTS "group_members_self_read" ON public.group_members;
CREATE POLICY "group_members_self_read" ON public.group_members
  FOR SELECT
  TO authenticated
  USING (
    left_at IS NULL
    AND public.is_active_group_member(group_id)
  );

COMMENT ON FUNCTION public.is_active_group_member(UUID) IS
  'RLS helper: true only when auth.uid() has an active membership in the requested group.';
COMMENT ON POLICY "group_members_self_read" ON public.group_members IS
  'Authenticated users may read active members only in their own active group.';

COMMIT;
