-- Keep super-admin market and venue-partner directories bounded. List pages
-- contain ledger identifiers only; account and venue labels are hydrated for
-- one explicitly selected membership by the server route.

BEGIN;

CREATE INDEX IF NOT EXISTS tonight_market_memberships_market_page
  ON public.tonight_market_memberships (market_code, granted_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS venue_partner_memberships_page
  ON public.venue_partner_memberships (granted_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS venue_partner_memberships_venue_page
  ON public.venue_partner_memberships (venue_id, granted_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS venue_partner_memberships_user_page
  ON public.venue_partner_memberships (user_id, granted_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.super_admin_list_tonight_market_memberships_page(
  p_market_code TEXT,
  p_limit INTEGER DEFAULT 50,
  p_after_membership_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  membership_id UUID,
  market_code TEXT,
  user_id UUID,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revision INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_market_code TEXT := pg_catalog.upper(pg_catalog.btrim(p_market_code));
  v_cursor_granted_at TIMESTAMPTZ;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF v_market_code IS NULL
    OR v_market_code !~ '^[A-Z0-9_-]{2,24}$' THEN
    RAISE EXCEPTION 'invalid_market_code';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  IF p_after_membership_id IS NOT NULL THEN
    SELECT membership.granted_at
    INTO v_cursor_granted_at
    FROM public.tonight_market_memberships AS membership
    WHERE membership.id = p_after_membership_id
      AND membership.market_code = v_market_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'membership_cursor_not_found'; END IF;
  END IF;

  RETURN QUERY
  SELECT
    membership.id,
    membership.market_code,
    membership.user_id,
    membership.granted_at,
    membership.revoked_at,
    membership.revision
  FROM public.tonight_market_memberships AS membership
  WHERE membership.market_code = v_market_code
    AND (p_user_id IS NULL OR membership.user_id = p_user_id)
    AND (
      p_after_membership_id IS NULL
      OR membership.granted_at < v_cursor_granted_at
      OR (
        membership.granted_at = v_cursor_granted_at
        AND membership.id < p_after_membership_id
      )
    )
  ORDER BY membership.granted_at DESC, membership.id DESC
  LIMIT p_limit + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_get_tonight_market_membership(
  p_membership_id UUID
)
RETURNS TABLE (
  membership_id UUID,
  market_code TEXT,
  user_id UUID,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revision INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_membership_id IS NULL THEN RAISE EXCEPTION 'membership_id_required'; END IF;

  RETURN QUERY
  SELECT
    membership.id,
    membership.market_code,
    membership.user_id,
    membership.granted_at,
    membership.revoked_at,
    membership.revision
  FROM public.tonight_market_memberships AS membership
  WHERE membership.id = p_membership_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_venue_partner_memberships_page(
  p_limit INTEGER DEFAULT 50,
  p_after_membership_id UUID DEFAULT NULL,
  p_venue_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_include_revoked BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  membership_id UUID,
  user_id UUID,
  venue_id UUID,
  membership_role TEXT,
  granted_by UUID,
  granted_at TIMESTAMPTZ,
  revoked_by UUID,
  revoked_at TIMESTAMPTZ,
  revision INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_cursor_granted_at TIMESTAMPTZ;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  IF p_include_revoked IS NULL THEN RAISE EXCEPTION 'include_revoked_required'; END IF;

  IF p_after_membership_id IS NOT NULL THEN
    SELECT membership.granted_at
    INTO v_cursor_granted_at
    FROM public.venue_partner_memberships AS membership
    WHERE membership.id = p_after_membership_id
      AND (p_venue_id IS NULL OR membership.venue_id = p_venue_id)
      AND (p_user_id IS NULL OR membership.user_id = p_user_id)
      AND (p_include_revoked OR membership.revoked_at IS NULL);
    IF NOT FOUND THEN RAISE EXCEPTION 'membership_cursor_not_found'; END IF;
  END IF;

  RETURN QUERY
  SELECT
    membership.id,
    membership.user_id,
    membership.venue_id,
    membership.role,
    membership.granted_by,
    membership.granted_at,
    membership.revoked_by,
    membership.revoked_at,
    membership.revision
  FROM public.venue_partner_memberships AS membership
  WHERE (p_venue_id IS NULL OR membership.venue_id = p_venue_id)
    AND (p_user_id IS NULL OR membership.user_id = p_user_id)
    AND (p_include_revoked OR membership.revoked_at IS NULL)
    AND (
      p_after_membership_id IS NULL
      OR membership.granted_at < v_cursor_granted_at
      OR (
        membership.granted_at = v_cursor_granted_at
        AND membership.id < p_after_membership_id
      )
    )
  ORDER BY membership.granted_at DESC, membership.id DESC
  LIMIT p_limit + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_get_venue_partner_membership(
  p_membership_id UUID
)
RETURNS TABLE (
  membership_id UUID,
  user_id UUID,
  venue_id UUID,
  membership_role TEXT,
  granted_by UUID,
  granted_at TIMESTAMPTZ,
  revoked_by UUID,
  revoked_at TIMESTAMPTZ,
  revision INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_membership_id IS NULL THEN RAISE EXCEPTION 'membership_id_required'; END IF;

  RETURN QUERY
  SELECT
    membership.id,
    membership.user_id,
    membership.venue_id,
    membership.role,
    membership.granted_by,
    membership.granted_at,
    membership.revoked_by,
    membership.revoked_at,
    membership.revision
  FROM public.venue_partner_memberships AS membership
  WHERE membership.id = p_membership_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_list_tonight_market_memberships(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_list_tonight_market_memberships_page(TEXT, INTEGER, UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_get_tonight_market_membership(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_venue_partner_memberships(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_list_venue_partner_memberships_page(INTEGER, UUID, UUID, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_get_venue_partner_membership(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.super_admin_list_tonight_market_memberships_page(TEXT, INTEGER, UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tonight_market_membership(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_list_venue_partner_memberships_page(INTEGER, UUID, UUID, UUID, BOOLEAN)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_get_venue_partner_membership(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.super_admin_list_tonight_market_memberships_page(TEXT, INTEGER, UUID, UUID) IS
  'Recently reauthenticated super-admin market membership page. Returns at most requested limit plus one cursor sentinel and no display PII.';
COMMENT ON FUNCTION public.super_admin_get_tonight_market_membership(UUID) IS
  'Recently reauthenticated super-admin lookup for one explicitly selected market membership.';
COMMENT ON FUNCTION public.super_admin_list_venue_partner_memberships_page(INTEGER, UUID, UUID, UUID, BOOLEAN) IS
  'Recently reauthenticated super-admin venue-partner membership page. Returns at most requested limit plus one cursor sentinel and no display PII.';
COMMENT ON FUNCTION public.super_admin_get_venue_partner_membership(UUID) IS
  'Recently reauthenticated super-admin lookup for one explicitly selected venue-partner membership.';

COMMIT;
