-- Phase 9: secure match chat foundation
-- - only confirmed/completed match participants can read/send
-- - messages are always tied to match_id
-- - no public read/write paths

CREATE TABLE IF NOT EXISTS public.match_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 1000),
  sender_alias TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_chat_messages_match_created
  ON public.match_chat_messages (match_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_chat_messages_sender
  ON public.match_chat_messages (sender_user_id);

ALTER TABLE public.match_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_match_chat(p_match_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.matches m
      WHERE m.id = p_match_id
        AND m.status IN ('confirmed', 'completed')
        AND m.approval_status = 'approved'
        AND (
          EXISTS (
            SELECT 1
              FROM public.group_members gm
             WHERE gm.group_id = m.group_a_id
               AND gm.user_id = p_user_id
               AND gm.left_at IS NULL
          )
          OR EXISTS (
            SELECT 1
              FROM public.group_members gm
             WHERE gm.group_id = m.group_b_id
               AND gm.user_id = p_user_id
               AND gm.left_at IS NULL
          )
        )
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_match_chat(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_match_chat_messages(
  p_match_id UUID,
  p_limit INT DEFAULT 60,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  sender_user_id UUID,
  alias TEXT,
  message TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.can_access_match_chat(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    p_limit := 60;
  END IF;

  RETURN QUERY
  SELECT m.id, m.sender_user_id, m.sender_alias, m.message, m.created_at
  FROM public.match_chat_messages m
  WHERE m.match_id = p_match_id
    AND (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_chat_messages(UUID, INT, TIMESTAMPTZ) TO authenticated;

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
SET search_path = public
AS $$
DECLARE
  v_sender UUID := auth.uid();
  v_alias TEXT;
  v_inserted match_chat_messages;
BEGIN
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_message_text IS NULL OR char_length(btrim(p_message_text)) < 1 OR char_length(btrim(p_message_text)) > 1000 THEN
    RAISE EXCEPTION 'invalid_message';
  END IF;

  IF NOT public.can_access_match_chat(p_match_id, v_sender) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  v_alias := '익명';
  IF to_regclass('public.match_member_aliases') IS NOT NULL THEN
    SELECT alias INTO v_alias
    FROM public.match_member_aliases
    WHERE match_id = p_match_id
      AND user_id = v_sender
    LIMIT 1;
  END IF;

  INSERT INTO public.match_chat_messages (match_id, sender_user_id, message, sender_alias)
  VALUES (p_match_id, v_sender, btrim(p_message_text), v_alias)
  RETURNING id, sender_user_id, sender_alias, message, created_at
  INTO v_inserted;

  RETURN QUERY
  SELECT v_inserted.id, v_inserted.sender_user_id, v_inserted.sender_alias, v_inserted.message, v_inserted.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_match_chat_message(UUID, TEXT) TO authenticated;

DROP POLICY IF EXISTS match_chat_messages_select_participants ON public.match_chat_messages;
CREATE POLICY match_chat_messages_select_participants
  ON public.match_chat_messages
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_match_chat(match_id, auth.uid())
  );

DROP POLICY IF EXISTS match_chat_messages_insert_participants ON public.match_chat_messages;
CREATE POLICY match_chat_messages_insert_participants
  ON public.match_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND public.can_access_match_chat(match_id, auth.uid())
  );

DROP POLICY IF EXISTS match_chat_messages_update_admin ON public.match_chat_messages;
DROP POLICY IF EXISTS match_chat_messages_delete_admin ON public.match_chat_messages;

CREATE POLICY match_chat_messages_update_admin
  ON public.match_chat_messages
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY match_chat_messages_delete_admin
  ON public.match_chat_messages
  FOR DELETE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.match_chat_messages IS
  'Phase 9 secure match chat storage. Access is limited to confirmed/completed approved match participants.';
COMMENT ON FUNCTION public.can_access_match_chat(UUID, UUID) IS
  'Checks if user is active member of either side and match is approved + confirmed/completed.';
COMMENT ON FUNCTION public.get_match_chat_messages(UUID, INT, TIMESTAMPTZ) IS
  'Returns chat messages for a match visible to participants.';
COMMENT ON FUNCTION public.send_match_chat_message(UUID, TEXT) IS
  'Validates access and stores a new match chat message.';
