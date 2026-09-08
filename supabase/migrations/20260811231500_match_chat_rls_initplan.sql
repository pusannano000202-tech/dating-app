-- Evaluate the authenticated user once per statement instead of once per row.
-- Authorization still delegates to the self-scoped can_access_match_chat boundary.

DROP POLICY IF EXISTS match_chat_messages_select_participants
  ON public.match_chat_messages;

CREATE POLICY match_chat_messages_select_participants
  ON public.match_chat_messages
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_match_chat(match_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS match_chat_messages_insert_participants
  ON public.match_chat_messages;

CREATE POLICY match_chat_messages_insert_participants
  ON public.match_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_user_id = (SELECT auth.uid())
    AND public.can_access_match_chat(match_id, (SELECT auth.uid()))
  );
