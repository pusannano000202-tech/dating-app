-- Keep Quantum event identities out of legacy match and chat surfaces.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_quantum_event_match_route(
  p_match_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'event_id', occurrence.event_id,
    'event_mode', occurrence.event_mode,
    'party_type', participation.party_type,
    'status', match_row.status
  )
  FROM public.quantum_event_match_members AS member
  JOIN public.quantum_event_occurrences AS occurrence
    ON occurrence.id = member.occurrence_id
   AND occurrence.match_id = member.match_id
  JOIN public.matches AS match_row ON match_row.id = member.match_id
  LEFT JOIN public.quantum_event_participations AS participation
    ON participation.user_id = auth.uid()
   AND participation.match_id = member.match_id
  WHERE auth.uid() IS NOT NULL
    AND member.match_id = p_match_id
    AND member.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_quantum_event_match_route(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quantum_event_match_route(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_safe_match_chat_messages(
  p_match_id UUID,
  p_limit INTEGER DEFAULT 60,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  is_mine BOOLEAN,
  alias TEXT,
  message TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_window JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  v_window := public.get_my_match_chat_window(p_match_id);
  IF NOT COALESCE((v_window ->> 'is_open')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION 'chat_not_open' USING ERRCODE = 'P0001';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    p_limit := 60;
  END IF;

  RETURN QUERY
  SELECT
    chat.id,
    chat.sender_user_id = v_user_id,
    CASE WHEN chat.sender_user_id = v_user_id THEN '나' ELSE COALESCE(chat.sender_alias, '참가자') END,
    chat.message,
    chat.created_at
  FROM public.match_chat_messages AS chat
  WHERE chat.match_id = p_match_id
    AND (p_before IS NULL OR chat.created_at < p_before)
  ORDER BY chat.created_at DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_safe_match_chat_message(
  p_match_id UUID,
  p_message_text TEXT
)
RETURNS TABLE (
  id UUID,
  is_mine BOOLEAN,
  alias TEXT,
  message TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT sent.id, TRUE, '나'::TEXT, sent.message, sent.created_at
  FROM public.send_match_chat_message(p_match_id, p_message_text) AS sent;
$$;

REVOKE ALL ON FUNCTION public.get_safe_match_chat_messages(UUID, INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_safe_match_chat_messages(UUID, INTEGER, TIMESTAMPTZ)
  TO authenticated;

REVOKE ALL ON FUNCTION public.send_safe_match_chat_message(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_safe_match_chat_message(UUID, TEXT)
  TO authenticated;

-- The old chat functions return raw sender UUIDs. Keep them internal and expose
-- only the safe wrappers above to authenticated clients.
REVOKE ALL ON FUNCTION public.get_match_chat_messages(UUID, INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_match_chat_message(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

-- Legacy contacts reveal real names and phone numbers. Quantum event matches
-- use event aliases before completion and the friends surface afterwards.
CREATE OR REPLACE FUNCTION public.get_match_connections(
  p_match_id UUID
)
RETURNS TABLE (
  target_user_id UUID,
  target_display_name TEXT,
  contact_revealed_at TIMESTAMPTZ,
  scheduled_reveal_at TIMESTAMPTZ,
  target_phone TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_match public.matches%ROWTYPE;
  v_caller_in_a BOOLEAN;
  v_caller_in_b BOOLEAN;
  v_caller_group_id UUID;
  v_opp_group_id UUID;
  v_scheduled_at TIMESTAMPTZ;
  v_should_reveal BOOLEAN;
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quantum_event_match_members AS member
    WHERE member.match_id = p_match_id
  ) THEN
    RAISE EXCEPTION 'event_match_contact_hidden' USING ERRCODE = 'P0001';
  END IF;

  SELECT match_row.* INTO v_match
  FROM public.matches AS match_row
  WHERE match_row.id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_match.status NOT IN ('confirmed', 'completed') THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.group_members AS member
    WHERE member.group_id = v_match.group_a_id
      AND member.user_id = v_caller
      AND member.left_at IS NULL
  ) INTO v_caller_in_a;
  SELECT EXISTS (
    SELECT 1 FROM public.group_members AS member
    WHERE member.group_id = v_match.group_b_id
      AND member.user_id = v_caller
      AND member.left_at IS NULL
  ) INTO v_caller_in_b;
  IF NOT v_caller_in_a AND NOT v_caller_in_b THEN
    RAISE EXCEPTION 'not_match_participant' USING ERRCODE = '42501';
  END IF;

  v_caller_group_id := CASE WHEN v_caller_in_a THEN v_match.group_a_id ELSE v_match.group_b_id END;
  v_opp_group_id := CASE WHEN v_caller_in_a THEN v_match.group_b_id ELSE v_match.group_a_id END;
  v_scheduled_at := public.get_match_scheduled_reveal_at(p_match_id);
  v_should_reveal := v_scheduled_at IS NOT NULL AND v_scheduled_at <= v_now;

  IF v_should_reveal THEN
    PERFORM pg_catalog.set_config('app.bypass_connections_guard', 'on', TRUE);
    INSERT INTO public.connections (
      match_id, user_a_id, user_b_id, a_agreed, b_agreed, contact_revealed_at
    )
    SELECT
      p_match_id,
      LEAST(mine.user_id, opponent.user_id),
      GREATEST(mine.user_id, opponent.user_id),
      TRUE,
      TRUE,
      v_scheduled_at
    FROM public.group_members AS mine
    JOIN public.group_members AS opponent
      ON opponent.group_id = v_opp_group_id
     AND opponent.left_at IS NULL
     AND opponent.user_id <> mine.user_id
    WHERE mine.group_id = v_caller_group_id
      AND mine.left_at IS NULL
    ON CONFLICT (match_id, user_a_id, user_b_id) DO UPDATE
      SET contact_revealed_at = COALESCE(public.connections.contact_revealed_at, EXCLUDED.contact_revealed_at),
          a_agreed = TRUE,
          b_agreed = TRUE;
    PERFORM pg_catalog.set_config('app.bypass_connections_guard', 'off', TRUE);
  END IF;

  RETURN QUERY
  SELECT
    member.user_id,
    profile.display_name,
    connection.contact_revealed_at,
    v_scheduled_at,
    CASE
      WHEN connection.contact_revealed_at IS NOT NULL
       AND connection.contact_revealed_at <= v_now THEN app_user.phone
      ELSE NULL
    END
  FROM public.group_members AS member
  JOIN public.users AS app_user ON app_user.id = member.user_id
  LEFT JOIN public.profiles AS profile ON profile.user_id = member.user_id
  LEFT JOIN public.connections AS connection
    ON connection.match_id = p_match_id
   AND connection.user_a_id = LEAST(v_caller, member.user_id)
   AND connection.user_b_id = GREATEST(v_caller, member.user_id)
  WHERE member.group_id = v_opp_group_id
    AND member.left_at IS NULL
    AND member.user_id <> v_caller
  ORDER BY profile.display_name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_match_connections(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_match_connections(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.get_quantum_event_match_route(UUID) IS
  'Returns only the caller event route metadata. Event participant profiles remain private.';
COMMENT ON FUNCTION public.get_safe_match_chat_messages(UUID, INTEGER, TIMESTAMPTZ) IS
  'Returns chat aliases and is_mine without exposing sender user ids.';
COMMENT ON FUNCTION public.get_match_connections(UUID) IS
  'Legacy match contacts. Quantum event matches fail closed with event_match_contact_hidden.';

COMMIT;
