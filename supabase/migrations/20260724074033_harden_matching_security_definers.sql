-- Harden the admin authorization helpers that are used by RLS and operator RPCs.
-- This is a follow-up migration: previously applied migrations remain immutable.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL OR p_user_id IS DISTINCT FROM v_caller THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.admins AS admin_row
    WHERE admin_row.user_id = v_caller
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL OR p_user_id IS DISTINCT FROM v_caller THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.admins AS admin_row
    WHERE admin_row.user_id = v_caller
      AND admin_row.role = 'super_admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_admin(
  p_user_id UUID,
  p_role TEXT DEFAULT 'admin',
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  IF p_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_admins_guard', 'on', TRUE);
  INSERT INTO public.admins (user_id, role, granted_by, notes)
  VALUES (p_user_id, p_role, v_caller, p_notes)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role,
        notes = EXCLUDED.notes,
        granted_by = v_caller,
        granted_at = CURRENT_TIMESTAMP;
  PERFORM pg_catalog.set_config('app.bypass_admins_guard', 'off', TRUE);

  RETURN p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_admin(
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_deleted INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'cannot_revoke_self';
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_admins_guard', 'on', TRUE);
  DELETE FROM public.admins AS admin_row
  WHERE admin_row.user_id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  PERFORM pg_catalog.set_config('app.bypass_admins_guard', 'off', TRUE);

  RETURN v_deleted > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_super_admin(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_admin(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_admin(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_admin(UUID, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_admin(UUID)
  TO authenticated;

ALTER VIEW public.admin_revenue_summary
  SET (security_invoker = TRUE);
REVOKE ALL ON TABLE public.admin_revenue_summary
  FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.admin_revenue_summary
  TO authenticated;

COMMIT;
