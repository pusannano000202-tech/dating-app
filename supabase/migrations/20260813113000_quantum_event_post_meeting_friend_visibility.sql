-- Quantum guided-meeting privacy lifecycle.
-- Before completion, event participants stay anonymous. When the server marks
-- a Quantum event match completed, its participants become active friends.
-- A user can later hide that relationship; the pair then stays out of future
-- event rooms until the same user restores it.

BEGIN;

ALTER TABLE public.friendships
  ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL;

ALTER TABLE public.friendships
  DROP CONSTRAINT IF EXISTS friendships_block_state_check;
ALTER TABLE public.friendships
  ADD CONSTRAINT friendships_block_state_check CHECK (
    (status = 'active' AND blocked_by IS NULL AND blocked_at IS NULL)
    OR
    (
      status = 'blocked'
      AND blocked_by IN (user_id, friend_user_id)
      AND blocked_at IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS friendships_blocked_by_idx
  ON public.friendships(blocked_by)
  WHERE status = 'blocked';

DROP POLICY IF EXISTS "friendships_participant_read" ON public.friendships;
CREATE POLICY "friendships_participant_read" ON public.friendships
  FOR SELECT
  USING (
    (
      status = 'active'
      AND (user_id = (SELECT auth.uid()) OR friend_user_id = (SELECT auth.uid()))
    )
    OR
    (
      status = 'blocked'
      AND blocked_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "friendships_participant_delete" ON public.friendships;

CREATE OR REPLACE FUNCTION public.guard_friendships_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('app.bypass_friendships_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.friend_user_id IS DISTINCT FROM OLD.friend_user_id
     OR NEW.created_from_request_id IS DISTINCT FROM OLD.created_from_request_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.blocked_by IS DISTINCT FROM OLD.blocked_by
     OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.source_match_id IS DISTINCT FROM OLD.source_match_id THEN
    RAISE EXCEPTION 'friendships: use the connection control RPC';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_friendships_update()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.connect_completed_quantum_event_match(
  p_match_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  IF p_match_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.matches AS match_row
    WHERE match_row.id = p_match_id
      AND match_row.status = 'completed'
      AND match_row.completed_at IS NOT NULL
  ) THEN
    RETURN 0;
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_friendships_guard', 'on', TRUE);

  INSERT INTO public.friendships (
    user_id,
    friend_user_id,
    status,
    created_from_request_id,
    blocked_by,
    blocked_at,
    source_match_id
  )
  SELECT
    LEAST(left_member.user_id, right_member.user_id),
    GREATEST(left_member.user_id, right_member.user_id),
    'active',
    NULL,
    NULL,
    NULL,
    p_match_id
  FROM public.quantum_event_match_members AS left_member
  JOIN public.quantum_event_match_members AS right_member
    ON right_member.match_id = left_member.match_id
   AND right_member.user_id > left_member.user_id
  WHERE left_member.match_id = p_match_id
  ON CONFLICT ON CONSTRAINT friendships_pkey DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  PERFORM pg_catalog.set_config('app.bypass_friendships_guard', 'off', TRUE);
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.connect_completed_quantum_event_match(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connect_completed_quantum_event_match(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.handle_completed_quantum_event_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
       FROM public.quantum_event_match_members AS member
       WHERE member.match_id = NEW.id
     ) THEN
    PERFORM public.connect_completed_quantum_event_match(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_completed_quantum_event_match()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_connect_completed_quantum_event_match
  ON public.matches;
CREATE TRIGGER trg_connect_completed_quantum_event_match
  AFTER UPDATE OF status ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_completed_quantum_event_match();

DO $$
DECLARE
  v_match_id UUID;
BEGIN
  FOR v_match_id IN
    SELECT DISTINCT member.match_id
    FROM public.quantum_event_match_members AS member
    JOIN public.matches AS match_row ON match_row.id = member.match_id
    WHERE match_row.status = 'completed'
      AND match_row.completed_at IS NOT NULL
  LOOP
    PERFORM public.connect_completed_quantum_event_match(v_match_id);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.complete_due_quantum_event_matches(
  p_now TIMESTAMPTZ DEFAULT pg_catalog.now()
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_completed INTEGER := 0;
BEGIN
  WITH due_matches AS (
    SELECT match_row.id, occurrence.id AS occurrence_id
    FROM public.matches AS match_row
    JOIN public.quantum_event_occurrences AS occurrence
      ON occurrence.match_id = match_row.id
    JOIN public.match_meetings AS meeting
      ON meeting.event_occurrence_id = occurrence.id
    WHERE match_row.status = 'confirmed'
      AND occurrence.status = 'confirmed'
      AND meeting.scheduled_end <= p_now
    ORDER BY meeting.scheduled_end
    FOR UPDATE OF match_row, occurrence SKIP LOCKED
  ), completed_matches AS (
    UPDATE public.matches AS match_row
    SET status = 'completed', completed_at = p_now
    FROM due_matches
    WHERE match_row.id = due_matches.id
    RETURNING match_row.id
  ), completed_occurrences AS (
    UPDATE public.quantum_event_occurrences AS occurrence
    SET status = 'completed', updated_at = p_now
    FROM due_matches
    WHERE occurrence.id = due_matches.occurrence_id
    RETURNING occurrence.id
  ), completed_participations AS (
    UPDATE public.quantum_event_participations AS participation
    SET status = 'completed', completed_at = p_now, updated_at = p_now
    WHERE participation.match_id IN (SELECT id FROM completed_matches)
      AND participation.status = 'confirmed'
    RETURNING participation.user_id
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO v_completed
  FROM completed_matches;

  RETURN v_completed;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_due_quantum_event_matches(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_due_quantum_event_matches(TIMESTAMPTZ)
  TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'quantum-event-complete-due-matches';

    PERFORM cron.schedule(
      'quantum-event-complete-due-matches',
      '*/5 * * * *',
      'SELECT public.complete_due_quantum_event_matches();'
    );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.remove_friend_and_exclude(
  p_friend_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_updated INTEGER := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_friend_user_id IS NULL OR p_friend_user_id = v_caller THEN
    RAISE EXCEPTION 'invalid_friend' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_friendships_guard', 'on', TRUE);
  UPDATE public.friendships AS friendship
  SET status = 'blocked',
      blocked_by = v_caller,
      blocked_at = pg_catalog.now()
  WHERE friendship.user_id = LEAST(v_caller, p_friend_user_id)
    AND friendship.friend_user_id = GREATEST(v_caller, p_friend_user_id)
    AND friendship.status = 'active';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM pg_catalog.set_config('app.bypass_friendships_guard', 'off', TRUE);

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'active_friendship_required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.friend_date_proposals
  SET status = 'cancelled', responded_at = pg_catalog.now()
  WHERE friendship_user_id = LEAST(v_caller, p_friend_user_id)
    AND friendship_friend_user_id = GREATEST(v_caller, p_friend_user_id)
    AND status = 'pending';

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_friend_and_exclude(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_friend_and_exclude(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_friend_visibility(
  p_friend_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_updated INTEGER := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_friend_user_id IS NULL OR p_friend_user_id = v_caller THEN
    RAISE EXCEPTION 'invalid_friend' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_friendships_guard', 'on', TRUE);
  UPDATE public.friendships AS friendship
  SET status = 'active', blocked_by = NULL, blocked_at = NULL
  WHERE friendship.user_id = LEAST(v_caller, p_friend_user_id)
    AND friendship.friend_user_id = GREATEST(v_caller, p_friend_user_id)
    AND friendship.status = 'blocked'
    AND friendship.blocked_by = v_caller;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM pg_catalog.set_config('app.bypass_friendships_guard', 'off', TRUE);

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'friend_restore_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_friend_visibility(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_friend_visibility(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_hidden_friend_summaries()
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  can_restore BOOLEAN,
  blocked_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN friendship.user_id = auth.uid() THEN friendship.friend_user_id
      ELSE friendship.user_id
    END,
    profile.display_name,
    friendship.blocked_by = auth.uid(),
    friendship.blocked_at
  FROM public.friendships AS friendship
  LEFT JOIN public.profiles AS profile
    ON profile.user_id = CASE
      WHEN friendship.user_id = auth.uid() THEN friendship.friend_user_id
      ELSE friendship.user_id
    END
  WHERE auth.uid() IS NOT NULL
    AND friendship.status = 'blocked'
    AND friendship.blocked_by = auth.uid()
    AND (friendship.user_id = auth.uid() OR friendship.friend_user_id = auth.uid())
  ORDER BY friendship.blocked_at DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_my_hidden_friend_summaries()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_hidden_friend_summaries()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_friend_profile_summary(
  p_friend_user_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  age INTEGER,
  school TEXT,
  department TEXT,
  year INTEGER,
  height INTEGER,
  body_type TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    profile.user_id,
    profile.display_name,
    profile.age,
    profile.school,
    profile.department,
    profile.year,
    profile.height,
    profile.body_type
  FROM public.profiles AS profile
  WHERE auth.uid() IS NOT NULL
    AND profile.user_id = p_friend_user_id
    AND EXISTS (
      SELECT 1
      FROM public.friendships AS friendship
      WHERE friendship.user_id = LEAST(auth.uid(), p_friend_user_id)
        AND friendship.friend_user_id = GREATEST(auth.uid(), p_friend_user_id)
        AND friendship.status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.get_friend_profile_summary(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_profile_summary(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.has_blocked_member_pair_between_groups(
  p_group_a UUID,
  p_group_b UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members AS member_a
    JOIN public.group_members AS member_b
      ON member_b.group_id = p_group_b
     AND member_b.left_at IS NULL
    JOIN public.friendships AS friendship
      ON friendship.user_id = LEAST(member_a.user_id, member_b.user_id)
     AND friendship.friend_user_id = GREATEST(member_a.user_id, member_b.user_id)
     AND friendship.status = 'blocked'
    WHERE member_a.group_id = p_group_a
      AND member_a.left_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.has_blocked_member_pair_between_groups(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_blocked_member_pair_between_groups(UUID, UUID)
  TO service_role;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.quantum_event_room_has_blocked_pair(
  p_occurrence_id UUID,
  p_incoming_user_ids UUID[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH occurrence_people AS (
    SELECT participation.user_id
    FROM public.quantum_event_participations AS participation
    WHERE participation.occurrence_id = p_occurrence_id
      AND participation.status IN ('recruiting', 'confirmed')
      AND participation.party_type = 'solo'
    UNION
    SELECT member.user_id
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id
     AND member.left_at IS NULL
    WHERE participation.occurrence_id = p_occurrence_id
      AND participation.status IN ('recruiting', 'confirmed')
      AND participation.party_type = 'friends'
  )
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(p_incoming_user_ids) AS incoming(user_id)
    JOIN occurrence_people AS existing
      ON existing.user_id <> incoming.user_id
    JOIN public.friendships AS friendship
      ON friendship.user_id = LEAST(incoming.user_id, existing.user_id)
     AND friendship.friend_user_id = GREATEST(incoming.user_id, existing.user_id)
     AND friendship.status = 'blocked'
  );
$$;

REVOKE ALL ON FUNCTION private.quantum_event_room_has_blocked_pair(UUID, UUID[])
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_quantum_event_room(
  p_event_id TEXT,
  p_event_mode TEXT,
  p_incoming_gender TEXT,
  p_incoming_count INTEGER,
  p_now TIMESTAMPTZ DEFAULT pg_catalog.now()
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_seed_id UUID;
  v_seed public.quantum_event_occurrences%ROWTYPE;
  v_room public.quantum_event_occurrences%ROWTYPE;
  v_current_male INTEGER;
  v_current_female INTEGER;
  v_reserved_male INTEGER;
  v_reserved_female INTEGER;
  v_next_room_number INTEGER;
  v_room_id UUID;
  v_incoming_user_ids UUID[];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_incoming_gender NOT IN ('male', 'female') THEN
    RAISE EXCEPTION 'profile_gender_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_incoming_count < 1 OR p_incoming_count > 3 THEN
    RAISE EXCEPTION 'invalid_party_size' USING ERRCODE = '22023';
  END IF;

  IF p_incoming_count = 1 THEN
    v_incoming_user_ids := ARRAY[v_caller];
  ELSE
    SELECT pg_catalog.array_agg(member.user_id ORDER BY member.user_id)
    INTO v_incoming_user_ids
    FROM public.groups AS group_row
    JOIN public.group_members AS member
      ON member.group_id = group_row.id
     AND member.left_at IS NULL
    WHERE group_row.leader_user_id = v_caller
      AND group_row.status IN ('forming', 'ready')
    GROUP BY group_row.id, group_row.updated_at
    HAVING pg_catalog.count(*) = p_incoming_count
    ORDER BY group_row.updated_at DESC
    LIMIT 1;
  END IF;

  IF pg_catalog.cardinality(v_incoming_user_ids) IS DISTINCT FROM p_incoming_count
     OR NOT (v_caller = ANY(v_incoming_user_ids)) THEN
    RAISE EXCEPTION 'invalid_party_members' USING ERRCODE = 'P0001';
  END IF;

  v_seed_id := public.get_or_create_quantum_event_occurrence(
    p_event_id,
    p_event_mode,
    p_now
  );

  SELECT occurrence.* INTO v_seed
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = v_seed_id;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id || '|' || v_seed.starts_at::TEXT, 0)
  );

  UPDATE public.quantum_event_room_invites
  SET status = 'expired', updated_at = pg_catalog.now()
  WHERE status = 'pending' AND expires_at <= pg_catalog.now();

  FOR v_room IN
    SELECT occurrence.*
    FROM public.quantum_event_occurrences AS occurrence
    WHERE occurrence.event_id = p_event_id
      AND occurrence.starts_at = v_seed.starts_at
      AND occurrence.status = 'recruiting'
      AND occurrence.application_closes_at > p_now
    ORDER BY occurrence.room_number
    FOR UPDATE
  LOOP
    IF private.quantum_event_room_has_blocked_pair(v_room.id, v_incoming_user_ids) THEN
      CONTINUE;
    END IF;

    WITH occurrence_people AS (
      SELECT participation.user_id, profile.gender
      FROM public.quantum_event_participations AS participation
      LEFT JOIN public.profiles AS profile ON profile.user_id = participation.user_id
      WHERE participation.occurrence_id = v_room.id
        AND participation.status IN ('recruiting', 'confirmed')
        AND participation.party_type = 'solo'
      UNION
      SELECT member.user_id, profile.gender
      FROM public.quantum_event_participations AS participation
      JOIN public.group_members AS member
        ON member.group_id = participation.group_id AND member.left_at IS NULL
      LEFT JOIN public.profiles AS profile ON profile.user_id = member.user_id
      WHERE participation.occurrence_id = v_room.id
        AND participation.status IN ('recruiting', 'confirmed')
        AND participation.party_type = 'friends'
    )
    SELECT
      pg_catalog.count(*) FILTER (WHERE gender = 'male')::INTEGER,
      pg_catalog.count(*) FILTER (WHERE gender = 'female')::INTEGER
    INTO v_current_male, v_current_female
    FROM occurrence_people;

    SELECT
      pg_catalog.count(*) FILTER (WHERE profile.gender = 'male')::INTEGER,
      pg_catalog.count(*) FILTER (WHERE profile.gender = 'female')::INTEGER
    INTO v_reserved_male, v_reserved_female
    FROM public.quantum_event_room_invites AS invite
    JOIN public.profiles AS profile ON profile.user_id = invite.invited_user_id
    WHERE invite.occurrence_id = v_room.id
      AND invite.status = 'pending'
      AND invite.expires_at > p_now;

    IF p_incoming_gender = 'male'
       AND v_current_male + v_reserved_male + p_incoming_count <= v_room.male_capacity THEN
      RETURN v_room.id;
    END IF;
    IF p_incoming_gender = 'female'
       AND v_current_female + v_reserved_female + p_incoming_count <= v_room.female_capacity THEN
      RETURN v_room.id;
    END IF;
  END LOOP;

  SELECT pg_catalog.max(occurrence.room_number) + 1
  INTO v_next_room_number
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.event_id = p_event_id AND occurrence.starts_at = v_seed.starts_at;

  v_next_room_number := COALESCE(v_next_room_number, 1);
  IF v_next_room_number > 26 THEN
    RAISE EXCEPTION 'event_room_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.quantum_event_occurrences (
    event_id, event_mode, starts_at, ends_at, application_closes_at,
    location_name, male_capacity, female_capacity, required_total,
    status, room_number, room_code
  ) VALUES (
    v_seed.event_id, v_seed.event_mode, v_seed.starts_at, v_seed.ends_at,
    v_seed.application_closes_at, v_seed.location_name,
    v_seed.male_capacity, v_seed.female_capacity, v_seed.required_total,
    'recruiting', v_next_room_number,
    pg_catalog.upper(pg_catalog.substr(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''), 1, 6
    ))
  )
  RETURNING id INTO v_room_id;

  RETURN v_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_quantum_event_room(TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_quantum_event_room(TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ)
  TO service_role;

CREATE OR REPLACE FUNCTION private.guard_quantum_event_blocked_pair()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_incoming_user_ids UUID[];
BEGIN
  IF NEW.status NOT IN ('recruiting', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF NEW.party_type = 'friends' AND NEW.group_id IS NOT NULL THEN
    SELECT pg_catalog.array_agg(member.user_id ORDER BY member.user_id)
    INTO v_incoming_user_ids
    FROM public.group_members AS member
    WHERE member.group_id = NEW.group_id
      AND member.left_at IS NULL;
  ELSE
    v_incoming_user_ids := ARRAY[NEW.user_id];
  END IF;

  IF private.quantum_event_room_has_blocked_pair(
    NEW.occurrence_id,
    COALESCE(v_incoming_user_ids, ARRAY[NEW.user_id])
  ) THEN
    RAISE EXCEPTION 'match_pair_excluded' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_quantum_event_blocked_pair()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_quantum_event_blocked_pair
  ON public.quantum_event_participations;
CREATE TRIGGER trg_guard_quantum_event_blocked_pair
  BEFORE INSERT OR UPDATE OF occurrence_id, status, group_id, party_type
  ON public.quantum_event_participations
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_quantum_event_blocked_pair();

COMMENT ON FUNCTION public.connect_completed_quantum_event_match(UUID) IS
  'Creates active friendships among completed Quantum event participants. Existing blocked rows are never reactivated.';
COMMENT ON FUNCTION public.remove_friend_and_exclude(UUID) IS
  'Hides both profiles and excludes the pair from future matching by marking their normalized friendship blocked.';
COMMENT ON FUNCTION public.restore_friend_visibility(UUID) IS
  'Restores a blocked friendship only when the caller originally hid it.';
COMMENT ON FUNCTION public.get_friend_profile_summary(UUID) IS
  'Returns profile details only while the caller and target are active friends.';
COMMENT ON FUNCTION public.has_blocked_member_pair_between_groups(UUID, UUID) IS
  'Service-only guard that prevents blocked users from being paired in regular group matching.';

COMMIT;
