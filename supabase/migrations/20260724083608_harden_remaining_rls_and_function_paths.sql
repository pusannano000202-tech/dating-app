BEGIN;

-- Legacy profile policies used auth.role() without a target role, which made
-- them participate in every role's policy set. Keep ownership access explicit
-- and scope server access to service_role only.
DROP POLICY IF EXISTS "service_role_only" ON public.appearance_scores;
CREATE POLICY "service_role_only"
  ON public.appearance_scores
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "owner_rw" ON public.profiles;
DROP POLICY IF EXISTS "service_role_all" ON public.profiles;

CREATE POLICY "owner_rw"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "service_role_all"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "owner_rw" ON public.photos;
DROP POLICY IF EXISTS "service_role_read" ON public.photos;

CREATE POLICY "owner_rw"
  ON public.photos
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "service_role_read"
  ON public.photos
  FOR SELECT
  TO service_role
  USING (TRUE);

-- These tables are writable only through SECURITY DEFINER RPCs. With RLS
-- enabled, the absence of direct write policies is the fail-closed rule.
DROP POLICY IF EXISTS "admins_no_direct_write" ON public.admins;
DROP POLICY IF EXISTS "app_config_no_direct_write" ON public.app_config;
DROP POLICY IF EXISTS "asa_no_direct_write" ON public.appearance_score_audits;

-- Pin every remaining mutable function search path. public CREATE has already
-- been revoked by the matching security hardening migration.
ALTER FUNCTION public.guard_friend_requests_update()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.guard_friendships_update()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.guard_group_members_update()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.guard_match_pool_update()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.guard_group_invites_update()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.touch_updated_at()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.haversine_distance_m(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION
)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.touch_match_card_submission_updated_at()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.touch_pre_match_card_draft_updated_at()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.normalize_profile_display_name(TEXT)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.touch_profile_display_name_claim_updated_at()
  SET search_path TO pg_catalog, public, pg_temp;

-- Recreate the chat write RPC so the output column "alias" cannot conflict
-- with match_member_aliases.alias during PL/pgSQL name resolution.
CREATE OR REPLACE FUNCTION public.send_match_chat_message(
  p_match_id UUID,
  p_message_text TEXT
)
RETURNS TABLE (
  id UUID,
  sender_user_id UUID,
  alias TEXT,
  message TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sender UUID := auth.uid();
  v_alias TEXT;
  v_inserted public.match_chat_messages%ROWTYPE;
BEGIN
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_message_text IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_message_text)) < 1
     OR pg_catalog.char_length(pg_catalog.btrim(p_message_text)) > 1000 THEN
    RAISE EXCEPTION 'invalid_message';
  END IF;

  IF NOT public.can_access_match_chat(p_match_id, v_sender) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  v_alias := '익명';
  IF pg_catalog.to_regclass('public.match_member_aliases') IS NOT NULL THEN
    SELECT member_alias.alias
      INTO v_alias
      FROM public.match_member_aliases AS member_alias
     WHERE member_alias.match_id = p_match_id
       AND member_alias.target_user_id = v_sender
     LIMIT 1;
  END IF;

  INSERT INTO public.match_chat_messages (
    match_id,
    sender_user_id,
    message,
    sender_alias
  )
  VALUES (
    p_match_id,
    v_sender,
    pg_catalog.btrim(p_message_text),
    v_alias
  )
  RETURNING *
    INTO v_inserted;

  RETURN QUERY
  SELECT
    v_inserted.id,
    v_inserted.sender_user_id,
    v_inserted.sender_alias,
    v_inserted.message,
    v_inserted.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.send_match_chat_message(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_match_chat_message(UUID, TEXT)
  TO authenticated;

COMMIT;
