-- Guided-event rooms: each occurrence is one five-person room. Applications
-- are assigned to the first compatible room, then overflow creates B, C, ...
-- Friend invitations reserve one same-gender seat for fifteen minutes.

ALTER TABLE public.quantum_event_occurrences
  ADD COLUMN IF NOT EXISTS room_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS room_code TEXT;

UPDATE public.quantum_event_occurrences
SET room_code = pg_catalog.upper(pg_catalog.substr(
  pg_catalog.replace(id::TEXT, '-', ''),
  1,
  6
))
WHERE room_code IS NULL;

ALTER TABLE public.quantum_event_occurrences
  ALTER COLUMN room_code SET NOT NULL;

ALTER TABLE public.quantum_event_occurrences
  DROP CONSTRAINT IF EXISTS quantum_event_occurrences_event_id_starts_at_key;

ALTER TABLE public.quantum_event_occurrences
  DROP CONSTRAINT IF EXISTS quantum_event_occurrences_room_number_check;
ALTER TABLE public.quantum_event_occurrences
  ADD CONSTRAINT quantum_event_occurrences_room_number_check
  CHECK (room_number BETWEEN 1 AND 26);

CREATE UNIQUE INDEX IF NOT EXISTS quantum_event_occurrences_event_room_unique
  ON public.quantum_event_occurrences(event_id, starts_at, room_number);
CREATE UNIQUE INDEX IF NOT EXISTS quantum_event_occurrences_room_code_unique
  ON public.quantum_event_occurrences(room_code);

CREATE TABLE IF NOT EXISTS public.quantum_event_room_invites (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  occurrence_id UUID NOT NULL
    REFERENCES public.quantum_event_occurrences(id) ON DELETE CASCADE,
  inviter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (pg_catalog.now() + INTERVAL '15 minutes'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CHECK (inviter_user_id <> invited_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS quantum_event_room_invites_one_pending_invitee
  ON public.quantum_event_room_invites(invited_user_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS quantum_event_room_invites_occurrence_status_idx
  ON public.quantum_event_room_invites(occurrence_id, status, expires_at);
CREATE INDEX IF NOT EXISTS quantum_event_room_invites_inviter_idx
  ON public.quantum_event_room_invites(inviter_user_id, status, created_at DESC);

ALTER TABLE public.quantum_event_room_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quantum_event_room_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quantum_event_room_invites TO service_role;

CREATE OR REPLACE FUNCTION public.quantum_event_room_label(p_room_number INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_room_number BETWEEN 1 AND 26
      THEN pg_catalog.chr(64 + p_room_number) || '방'
    ELSE '방'
  END;
$$;

REVOKE ALL ON FUNCTION public.quantum_event_room_label(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quantum_event_room_label(INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_or_create_quantum_event_occurrence(
  p_event_id TEXT,
  p_event_mode TEXT,
  p_now TIMESTAMPTZ DEFAULT pg_catalog.now()
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_local_now TIMESTAMP := pg_catalog.timezone('Asia/Seoul', p_now);
  v_local_start TIMESTAMP;
  v_starts_at TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_duration INTERVAL;
  v_location TEXT;
  v_male INTEGER;
  v_female INTEGER;
  v_target_dow INTEGER;
  v_days_ahead INTEGER;
  v_occurrence_id UUID;
BEGIN
  IF p_event_mode = 'tonight' THEN
    CASE p_event_id
      WHEN 'tonight-onsenjjang-run' THEN
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + TIME '19:30';
        v_duration := INTERVAL '90 minutes';
        v_location := '온천장역 1번 출구';
        v_male := 3;
        v_female := 2;
      WHEN 'tonight-board-game' THEN
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + TIME '20:00';
        v_duration := INTERVAL '120 minutes';
        v_location := '부산대 앞 보드게임 카페';
        v_male := 2;
        v_female := 3;
      WHEN 'tonight-casual-drinks' THEN
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + TIME '20:30';
        v_duration := INTERVAL '120 minutes';
        v_location := '부산대 장전동';
        v_male := 3;
        v_female := 2;
      WHEN 'tonight-late-dinner' THEN
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + TIME '21:00';
        v_duration := INTERVAL '90 minutes';
        v_location := '온천장 금강공원 입구';
        v_male := 2;
        v_female := 3;
      ELSE
        RAISE EXCEPTION 'invalid_event' USING ERRCODE = '22023';
    END CASE;

    v_starts_at := pg_catalog.timezone('Asia/Seoul', v_local_start);
    IF v_starts_at < p_now + INTERVAL '2 hours' THEN
      v_local_start := v_local_start + INTERVAL '1 day';
      v_starts_at := pg_catalog.timezone('Asia/Seoul', v_local_start);
    END IF;
  ELSIF p_event_mode = 'scheduled' THEN
    CASE p_event_id
      WHEN 'scheduled-board-game' THEN
        v_target_dow := 2;
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + TIME '19:30';
        v_duration := INTERVAL '150 minutes';
        v_location := '부산대 앞 보드게임 카페';
        v_male := 3;
        v_female := 2;
      WHEN 'scheduled-jogging' THEN
        v_target_dow := 3;
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + TIME '20:00';
        v_duration := INTERVAL '120 minutes';
        v_location := '온천천 산책로';
        v_male := 2;
        v_female := 3;
      WHEN 'scheduled-dinner' THEN
        v_target_dow := 4;
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + TIME '19:00';
        v_duration := INTERVAL '120 minutes';
        v_location := '온천장 금강공원 입구';
        v_male := 2;
        v_female := 3;
      WHEN 'scheduled-walk' THEN
        v_target_dow := 6;
        v_local_start := pg_catalog.date_trunc('day', v_local_now) + TIME '16:00';
        v_duration := INTERVAL '120 minutes';
        v_location := '온천장 금강공원 산책로';
        v_male := 3;
        v_female := 2;
      ELSE
        RAISE EXCEPTION 'invalid_event' USING ERRCODE = '22023';
    END CASE;

    v_days_ahead := (
      v_target_dow - pg_catalog.date_part('dow', v_local_now)::INTEGER + 7
    ) % 7;
    IF v_days_ahead = 0 THEN
      v_days_ahead := 7;
    END IF;
    v_local_start := v_local_start + pg_catalog.make_interval(days => v_days_ahead);
    v_starts_at := pg_catalog.timezone('Asia/Seoul', v_local_start);
  ELSE
    RAISE EXCEPTION 'invalid_event_mode' USING ERRCODE = '22023';
  END IF;

  v_ends_at := v_starts_at + v_duration;

  INSERT INTO public.quantum_event_occurrences (
    event_id, event_mode, starts_at, ends_at, application_closes_at,
    location_name, male_capacity, female_capacity, room_number, room_code
  ) VALUES (
    p_event_id, p_event_mode, v_starts_at, v_ends_at,
    v_starts_at - INTERVAL '2 hours', v_location, v_male, v_female,
    1,
    pg_catalog.upper(pg_catalog.substr(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''), 1, 6
    ))
  )
  ON CONFLICT (event_id, starts_at, room_number) DO UPDATE
  SET updated_at = public.quantum_event_occurrences.updated_at
  RETURNING id INTO v_occurrence_id;

  RETURN v_occurrence_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_quantum_event_occurrence(TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_quantum_event_occurrence(TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

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
  v_seed_id UUID;
  v_seed public.quantum_event_occurrences%ROWTYPE;
  v_room public.quantum_event_occurrences%ROWTYPE;
  v_current_male INTEGER;
  v_current_female INTEGER;
  v_reserved_male INTEGER;
  v_reserved_female INTEGER;
  v_next_room_number INTEGER;
  v_room_id UUID;
BEGIN
  IF p_incoming_gender NOT IN ('male', 'female') THEN
    RAISE EXCEPTION 'profile_gender_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_incoming_count < 1 OR p_incoming_count > 3 THEN
    RAISE EXCEPTION 'invalid_party_size' USING ERRCODE = '22023';
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
    ), pending_reservations AS (
      SELECT profile.gender
      FROM public.quantum_event_room_invites AS invite
      JOIN public.profiles AS profile ON profile.user_id = invite.invited_user_id
      WHERE invite.occurrence_id = v_room.id
        AND invite.status = 'pending'
        AND invite.expires_at > p_now
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

CREATE OR REPLACE FUNCTION public.set_my_quantum_event_participation(
  p_event_id TEXT,
  p_event_mode TEXT,
  p_party_type TEXT,
  p_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_group_leader_id UUID;
  v_group_status TEXT;
  v_incoming_gender TEXT;
  v_incoming_count INTEGER := 1;
  v_gender_mismatch_count INTEGER;
  v_occurrence_id UUID;
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_existing public.quantum_event_participations%ROWTYPE;
  v_current_total INTEGER := 0;
  v_current_male INTEGER := 0;
  v_current_female INTEGER := 0;
  v_party_member_conflicts INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_party_type NOT IN ('solo', 'friends') THEN
    RAISE EXCEPTION 'invalid_party_type' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    (p_event_mode = 'tonight' AND p_event_id IN (
      'tonight-onsenjjang-run', 'tonight-board-game',
      'tonight-casual-drinks', 'tonight-late-dinner'
    )) OR
    (p_event_mode = 'scheduled' AND p_event_id IN (
      'scheduled-board-game', 'scheduled-jogging',
      'scheduled-dinner', 'scheduled-walk'
    ))
  ) THEN
    RAISE EXCEPTION 'invalid_event' USING ERRCODE = '22023';
  END IF;
  IF p_party_type = 'solo' AND p_group_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_group_id' USING ERRCODE = '22023';
  END IF;

  SELECT participation.* INTO v_existing
  FROM public.quantum_event_participations AS participation
  WHERE participation.user_id = v_user_id
  FOR UPDATE;

  IF FOUND AND v_existing.status IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;

  IF p_party_type = 'friends' THEN
    IF p_group_id IS NULL THEN
      RAISE EXCEPTION 'friend_group_required' USING ERRCODE = '22023';
    END IF;

    SELECT group_row.leader_user_id, group_row.status, group_row.gender
    INTO v_group_leader_id, v_group_status, v_incoming_gender
    FROM public.groups AS group_row
    JOIN public.group_members AS mine
      ON mine.group_id = group_row.id
     AND mine.user_id = v_user_id
     AND mine.left_at IS NULL
    WHERE group_row.id = p_group_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'friend_group_required' USING ERRCODE = 'P0001';
    END IF;
    IF v_group_leader_id <> v_user_id THEN
      RAISE EXCEPTION 'friend_group_leader_required' USING ERRCODE = 'P0001';
    END IF;
    IF v_group_status NOT IN ('forming', 'ready') THEN
      RAISE EXCEPTION 'friend_group_not_ready' USING ERRCODE = 'P0001';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER INTO v_incoming_count
    FROM public.group_members AS member
    WHERE member.group_id = p_group_id AND member.left_at IS NULL;

    IF v_incoming_count < 2 OR v_incoming_count > 3 THEN
      RAISE EXCEPTION 'friend_group_member_count' USING ERRCODE = 'P0001';
    END IF;
    IF v_incoming_gender IS NULL OR v_incoming_gender NOT IN ('male', 'female') THEN
      RAISE EXCEPTION 'friend_group_gender_mismatch' USING ERRCODE = 'P0001';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER INTO v_gender_mismatch_count
    FROM public.group_members AS member
    LEFT JOIN public.profiles AS profile ON profile.user_id = member.user_id
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL
      AND profile.gender IS DISTINCT FROM v_incoming_gender;

    IF v_gender_mismatch_count > 0 THEN
      RAISE EXCEPTION 'friend_group_gender_mismatch' USING ERRCODE = 'P0001';
    END IF;

    SELECT pg_catalog.count(*)::INTEGER INTO v_party_member_conflicts
    FROM public.group_members AS member
    JOIN public.quantum_event_participations AS participation
      ON participation.user_id = member.user_id
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL
      AND member.user_id <> v_user_id
      AND participation.status IN ('recruiting', 'confirmed');

    IF v_party_member_conflicts > 0 THEN
      RAISE EXCEPTION 'party_member_already_applied' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT profile.gender INTO v_incoming_gender
    FROM public.profiles AS profile
    WHERE profile.user_id = v_user_id;

    IF v_incoming_gender IS NULL OR v_incoming_gender NOT IN ('male', 'female') THEN
      RAISE EXCEPTION 'profile_gender_required' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_existing.user_id IS NOT NULL
     AND v_existing.status = 'recruiting'
     AND v_existing.event_id = p_event_id
     AND v_existing.event_mode = p_event_mode
     AND v_existing.party_type = p_party_type
     AND v_existing.group_id IS NOT DISTINCT FROM p_group_id
     AND v_existing.occurrence_id IS NOT NULL THEN
    RETURN public.get_my_quantum_event_lifecycle();
  END IF;

  v_occurrence_id := public.assign_quantum_event_room(
    p_event_id,
    p_event_mode,
    v_incoming_gender,
    v_incoming_count,
    pg_catalog.now()
  );

  SELECT occurrence.* INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = v_occurrence_id
  FOR UPDATE;

  IF v_occurrence.status <> 'recruiting' THEN
    RAISE EXCEPTION 'event_not_recruiting' USING ERRCODE = 'P0001';
  END IF;
  IF pg_catalog.now() >= v_occurrence.application_closes_at THEN
    RAISE EXCEPTION 'application_closed' USING ERRCODE = 'P0001';
  END IF;

  WITH target_people AS (
    SELECT participation.user_id, profile.gender
    FROM public.quantum_event_participations AS participation
    LEFT JOIN public.profiles AS profile ON profile.user_id = participation.user_id
    WHERE participation.occurrence_id = v_occurrence_id
      AND participation.status IN ('recruiting', 'confirmed')
      AND participation.party_type = 'solo'
      AND participation.user_id <> v_user_id
    UNION
    SELECT member.user_id, profile.gender
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id AND member.left_at IS NULL
    LEFT JOIN public.profiles AS profile ON profile.user_id = member.user_id
    WHERE participation.occurrence_id = v_occurrence_id
      AND participation.status IN ('recruiting', 'confirmed')
      AND participation.party_type = 'friends'
      AND participation.user_id <> v_user_id
  )
  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(*) FILTER (WHERE gender = 'male')::INTEGER,
    pg_catalog.count(*) FILTER (WHERE gender = 'female')::INTEGER
  INTO v_current_total, v_current_male, v_current_female
  FROM target_people;

  IF v_current_total + v_incoming_count > v_occurrence.required_total THEN
    RAISE EXCEPTION 'event_full' USING ERRCODE = 'P0001';
  END IF;
  IF v_incoming_gender = 'male'
     AND v_current_male + v_incoming_count > v_occurrence.male_capacity THEN
    RAISE EXCEPTION 'gender_capacity_full' USING ERRCODE = 'P0001';
  END IF;
  IF v_incoming_gender = 'female'
     AND v_current_female + v_incoming_count > v_occurrence.female_capacity THEN
    RAISE EXCEPTION 'gender_capacity_full' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.quantum_event_participations (
    user_id, event_id, event_mode, party_type, group_id, occurrence_id,
    status, match_id, cancel_reason, completed_at
  ) VALUES (
    v_user_id, p_event_id, p_event_mode, p_party_type, p_group_id,
    v_occurrence_id, 'recruiting', NULL, NULL, NULL
  )
  ON CONFLICT (user_id) DO UPDATE
  SET event_id = EXCLUDED.event_id,
      event_mode = EXCLUDED.event_mode,
      party_type = EXCLUDED.party_type,
      group_id = EXCLUDED.group_id,
      occurrence_id = EXCLUDED.occurrence_id,
      status = 'recruiting',
      match_id = NULL,
      cancel_reason = NULL,
      completed_at = NULL,
      updated_at = pg_catalog.now()
  WHERE public.quantum_event_participations.status IN ('recruiting', 'cancelled');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;

  RETURN public.get_my_quantum_event_lifecycle();
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_my_quantum_event_participation()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_status TEXT;
  v_occurrence_id UUID;
  v_cancelled BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT participation.status, participation.occurrence_id
  INTO v_status, v_occurrence_id
  FROM public.quantum_event_participations AS participation
  WHERE participation.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_status = 'cancelled' THEN
    RETURN FALSE;
  END IF;
  IF v_status IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.quantum_event_participations
  SET status = 'cancelled',
      cancel_reason = 'user_cancelled',
      updated_at = pg_catalog.now()
  WHERE user_id = v_user_id AND status = 'recruiting';

  v_cancelled := FOUND;

  UPDATE public.quantum_event_room_invites
  SET status = 'cancelled', updated_at = pg_catalog.now()
  WHERE occurrence_id = v_occurrence_id
    AND inviter_user_id = v_user_id
    AND status = 'pending';

  RETURN v_cancelled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_quantum_event_participation(TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_quantum_event_participation(TEXT, TEXT, TEXT, UUID)
  TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_my_quantum_event_participation()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_quantum_event_participation()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_quantum_event_room_invite_candidates()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.quantum_event_participations AS participation
    WHERE participation.user_id = v_user_id
      AND participation.party_type = 'solo'
      AND participation.status = 'recruiting'
      AND participation.occurrence_id IS NOT NULL
  ) THEN
    RETURN '[]'::JSONB;
  END IF;

  WITH my_profile AS (
    SELECT profile.gender
    FROM public.profiles AS profile
    WHERE profile.user_id = v_user_id
  ), active_friends AS (
    SELECT CASE
      WHEN friendship.user_id = v_user_id THEN friendship.friend_user_id
      ELSE friendship.user_id
    END AS friend_user_id
    FROM public.friendships AS friendship
    WHERE friendship.status = 'active'
      AND (friendship.user_id = v_user_id OR friendship.friend_user_id = v_user_id)
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'user_id', active_friends.friend_user_id,
      'display_name', COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''), '친구'),
      'avatar_url', NULL
    ) ORDER BY profile.display_name NULLS LAST, active_friends.friend_user_id
  ), '[]'::JSONB)
  INTO v_result
  FROM active_friends
  JOIN public.profiles AS profile ON profile.user_id = active_friends.friend_user_id
  CROSS JOIN my_profile
  WHERE profile.gender = my_profile.gender
    AND NOT EXISTS (
      SELECT 1
      FROM public.quantum_event_participations AS participation
      WHERE participation.user_id = active_friends.friend_user_id
        AND participation.status IN ('recruiting', 'confirmed', 'completed')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.quantum_event_room_invites AS invite
      WHERE invite.invited_user_id = active_friends.friend_user_id
        AND invite.status = 'pending'
        AND invite.expires_at > pg_catalog.now()
    );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_quantum_event_room_invite(
  p_invited_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_participation public.quantum_event_participations%ROWTYPE;
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_inviter_gender TEXT;
  v_friend_gender TEXT;
  v_existing public.quantum_event_room_invites%ROWTYPE;
  v_invite public.quantum_event_room_invites%ROWTYPE;
  v_current_gender_count INTEGER := 0;
  v_reserved_gender_count INTEGER := 0;
  v_gender_capacity INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_invited_user_id IS NULL OR p_invited_user_id = v_user_id THEN
    RAISE EXCEPTION 'invalid_friend' USING ERRCODE = '22023';
  END IF;

  SELECT participation.* INTO v_participation
  FROM public.quantum_event_participations AS participation
  WHERE participation.user_id = v_user_id
    AND participation.party_type = 'solo'
    AND participation.status = 'recruiting'
    AND participation.occurrence_id IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_solo_room_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT occurrence.* INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = v_participation.occurrence_id
  FOR UPDATE;

  IF NOT FOUND OR v_occurrence.status <> 'recruiting'
     OR v_occurrence.application_closes_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'application_closed' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.quantum_event_room_invites
  SET status = 'expired', updated_at = pg_catalog.now()
  WHERE status = 'pending' AND expires_at <= pg_catalog.now();

  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships AS friendship
    WHERE friendship.user_id = LEAST(v_user_id, p_invited_user_id)
      AND friendship.friend_user_id = GREATEST(v_user_id, p_invited_user_id)
      AND friendship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_friendship_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT profile.gender INTO v_inviter_gender
  FROM public.profiles AS profile
  WHERE profile.user_id = v_user_id;
  SELECT profile.gender INTO v_friend_gender
  FROM public.profiles AS profile
  WHERE profile.user_id = p_invited_user_id;

  IF v_inviter_gender NOT IN ('male', 'female') OR v_friend_gender IS NULL THEN
    RAISE EXCEPTION 'profile_gender_required' USING ERRCODE = 'P0001';
  END IF;
  IF v_friend_gender <> v_inviter_gender THEN
    RAISE EXCEPTION 'friend_gender_mismatch' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quantum_event_participations AS participation
    WHERE participation.user_id = p_invited_user_id
      AND participation.status IN ('recruiting', 'confirmed', 'completed')
  ) THEN
    RAISE EXCEPTION 'friend_already_participating' USING ERRCODE = 'P0001';
  END IF;

  SELECT invite.* INTO v_existing
  FROM public.quantum_event_room_invites AS invite
  WHERE invite.occurrence_id = v_occurrence.id
    AND invite.inviter_user_id = v_user_id
    AND invite.invited_user_id = p_invited_user_id
    AND invite.status = 'pending'
    AND invite.expires_at > pg_catalog.now()
  FOR UPDATE;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'token', v_existing.token,
      'event_id', v_participation.event_id,
      'event_mode', v_participation.event_mode,
      'room_number', v_occurrence.room_number,
      'room_label', public.quantum_event_room_label(v_occurrence.room_number),
      'room_code', v_occurrence.room_code,
      'expires_at', v_existing.expires_at,
      'status', v_existing.status,
      'invited_user_id', v_existing.invited_user_id
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quantum_event_room_invites AS invite
    WHERE invite.invited_user_id = p_invited_user_id
      AND invite.status = 'pending'
      AND invite.expires_at > pg_catalog.now()
  ) THEN
    RAISE EXCEPTION 'friend_invite_pending' USING ERRCODE = 'P0001';
  END IF;

  WITH occurrence_people AS (
    SELECT participation.user_id, profile.gender
    FROM public.quantum_event_participations AS participation
    JOIN public.profiles AS profile ON profile.user_id = participation.user_id
    WHERE participation.occurrence_id = v_occurrence.id
      AND participation.status IN ('recruiting', 'confirmed')
      AND participation.party_type = 'solo'
    UNION
    SELECT member.user_id, profile.gender
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id AND member.left_at IS NULL
    JOIN public.profiles AS profile ON profile.user_id = member.user_id
    WHERE participation.occurrence_id = v_occurrence.id
      AND participation.status IN ('recruiting', 'confirmed')
      AND participation.party_type = 'friends'
  )
  SELECT pg_catalog.count(*)::INTEGER INTO v_current_gender_count
  FROM occurrence_people
  WHERE gender = v_friend_gender;

  SELECT pg_catalog.count(*)::INTEGER INTO v_reserved_gender_count
  FROM public.quantum_event_room_invites AS invite
  JOIN public.profiles AS profile ON profile.user_id = invite.invited_user_id
  WHERE invite.occurrence_id = v_occurrence.id
    AND invite.status = 'pending'
    AND invite.expires_at > pg_catalog.now()
    AND profile.gender = v_friend_gender;

  v_gender_capacity := CASE
    WHEN v_friend_gender = 'male' THEN v_occurrence.male_capacity
    ELSE v_occurrence.female_capacity
  END;
  IF v_current_gender_count + v_reserved_gender_count + 1 > v_gender_capacity THEN
    RAISE EXCEPTION 'friend_room_full' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.quantum_event_room_invites (
    occurrence_id, inviter_user_id, invited_user_id
  ) VALUES (
    v_occurrence.id, v_user_id, p_invited_user_id
  )
  RETURNING * INTO v_invite;

  RETURN pg_catalog.jsonb_build_object(
    'token', v_invite.token,
    'event_id', v_participation.event_id,
    'event_mode', v_participation.event_mode,
    'room_number', v_occurrence.room_number,
    'room_label', public.quantum_event_room_label(v_occurrence.room_number),
    'room_code', v_occurrence.room_code,
    'expires_at', v_invite.expires_at,
    'status', v_invite.status,
    'invited_user_id', v_invite.invited_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_quantum_event_room_invites()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.quantum_event_room_invites
  SET status = 'expired', updated_at = pg_catalog.now()
  WHERE status = 'pending' AND expires_at <= pg_catalog.now();

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'token', invite.token,
      'role', CASE WHEN invite.inviter_user_id = v_user_id THEN 'inviter' ELSE 'invitee' END,
      'counterpart_user_id', CASE
        WHEN invite.inviter_user_id = v_user_id THEN invite.invited_user_id
        ELSE invite.inviter_user_id
      END,
      'counterpart_display_name', COALESCE(NULLIF(pg_catalog.btrim(profile.display_name), ''), '친구'),
      'event_id', occurrence.event_id,
      'event_mode', occurrence.event_mode,
      'room_number', occurrence.room_number,
      'room_label', public.quantum_event_room_label(occurrence.room_number),
      'room_code', occurrence.room_code,
      'status', invite.status,
      'expires_at', invite.expires_at
    ) ORDER BY invite.created_at DESC
  ), '[]'::JSONB)
  INTO v_result
  FROM public.quantum_event_room_invites AS invite
  JOIN public.quantum_event_occurrences AS occurrence ON occurrence.id = invite.occurrence_id
  LEFT JOIN public.profiles AS profile ON profile.user_id = CASE
    WHEN invite.inviter_user_id = v_user_id THEN invite.invited_user_id
    ELSE invite.inviter_user_id
  END
  WHERE (invite.inviter_user_id = v_user_id OR invite.invited_user_id = v_user_id)
    AND invite.status IN ('pending', 'accepted')
    AND (invite.status = 'accepted' OR invite.expires_at > pg_catalog.now());

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_quantum_event_room_invite(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite public.quantum_event_room_invites%ROWTYPE;
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_inviter_gender TEXT;
  v_friend_gender TEXT;
  v_existing public.quantum_event_participations%ROWTYPE;
  v_current_gender_count INTEGER := 0;
  v_reserved_gender_count INTEGER := 0;
  v_gender_capacity INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid_invite' USING ERRCODE = '22023';
  END IF;

  SELECT invite.* INTO v_invite
  FROM public.quantum_event_room_invites AS invite
  WHERE invite.token = p_token
    AND invite.invited_user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.status = 'accepted' THEN
    RETURN public.get_my_quantum_event_lifecycle();
  END IF;
  IF v_invite.status <> 'pending' OR v_invite.expires_at <= pg_catalog.now() THEN
    UPDATE public.quantum_event_room_invites
    SET status = 'expired', updated_at = pg_catalog.now()
    WHERE id = v_invite.id AND status = 'pending';
    RAISE EXCEPTION 'invite_expired' USING ERRCODE = 'P0001';
  END IF;

  SELECT occurrence.* INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = v_invite.occurrence_id
  FOR UPDATE;

  IF NOT FOUND OR v_occurrence.status <> 'recruiting'
     OR v_occurrence.application_closes_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'application_closed' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships AS friendship
    WHERE friendship.user_id = LEAST(v_invite.inviter_user_id, v_user_id)
      AND friendship.friend_user_id = GREATEST(v_invite.inviter_user_id, v_user_id)
      AND friendship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_friendship_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT profile.gender INTO v_inviter_gender
  FROM public.profiles AS profile
  WHERE profile.user_id = v_invite.inviter_user_id;
  SELECT profile.gender INTO v_friend_gender
  FROM public.profiles AS profile
  WHERE profile.user_id = v_user_id;
  IF v_friend_gender IS NULL OR v_friend_gender <> v_inviter_gender THEN
    RAISE EXCEPTION 'friend_gender_mismatch' USING ERRCODE = 'P0001';
  END IF;

  SELECT participation.* INTO v_existing
  FROM public.quantum_event_participations AS participation
  WHERE participation.user_id = v_user_id
  FOR UPDATE;
  IF FOUND AND v_existing.status IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;
  IF FOUND AND v_existing.status = 'recruiting'
     AND v_existing.occurrence_id <> v_occurrence.id THEN
    RAISE EXCEPTION 'active_event_conflict' USING ERRCODE = 'P0001';
  END IF;

  WITH occurrence_people AS (
    SELECT participation.user_id, profile.gender
    FROM public.quantum_event_participations AS participation
    JOIN public.profiles AS profile ON profile.user_id = participation.user_id
    WHERE participation.occurrence_id = v_occurrence.id
      AND participation.status IN ('recruiting', 'confirmed')
      AND participation.party_type = 'solo'
      AND participation.user_id <> v_user_id
    UNION
    SELECT member.user_id, profile.gender
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id AND member.left_at IS NULL
    JOIN public.profiles AS profile ON profile.user_id = member.user_id
    WHERE participation.occurrence_id = v_occurrence.id
      AND participation.status IN ('recruiting', 'confirmed')
      AND participation.party_type = 'friends'
      AND member.user_id <> v_user_id
  )
  SELECT pg_catalog.count(*)::INTEGER INTO v_current_gender_count
  FROM occurrence_people
  WHERE gender = v_friend_gender;

  SELECT pg_catalog.count(*)::INTEGER INTO v_reserved_gender_count
  FROM public.quantum_event_room_invites AS invite
  JOIN public.profiles AS profile ON profile.user_id = invite.invited_user_id
  WHERE invite.occurrence_id = v_occurrence.id
    AND invite.id <> v_invite.id
    AND invite.status = 'pending'
    AND invite.expires_at > pg_catalog.now()
    AND profile.gender = v_friend_gender;

  v_gender_capacity := CASE
    WHEN v_friend_gender = 'male' THEN v_occurrence.male_capacity
    ELSE v_occurrence.female_capacity
  END;
  IF v_current_gender_count + v_reserved_gender_count + 1 > v_gender_capacity THEN
    RAISE EXCEPTION 'friend_room_full' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.quantum_event_participations (
    user_id, event_id, event_mode, party_type, group_id, occurrence_id,
    status, match_id, cancel_reason, completed_at
  ) VALUES (
    v_user_id, v_occurrence.event_id, v_occurrence.event_mode, 'solo', NULL,
    v_occurrence.id, 'recruiting', NULL, NULL, NULL
  )
  ON CONFLICT (user_id) DO UPDATE
  SET event_id = EXCLUDED.event_id,
      event_mode = EXCLUDED.event_mode,
      party_type = 'solo',
      group_id = NULL,
      occurrence_id = EXCLUDED.occurrence_id,
      status = 'recruiting',
      match_id = NULL,
      cancel_reason = NULL,
      completed_at = NULL,
      updated_at = pg_catalog.now()
  WHERE public.quantum_event_participations.status IN ('recruiting', 'cancelled');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_state_locked' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.quantum_event_room_invites
  SET status = 'accepted', accepted_at = pg_catalog.now(), updated_at = pg_catalog.now()
  WHERE id = v_invite.id;

  UPDATE public.quantum_event_room_invites
  SET status = 'cancelled', updated_at = pg_catalog.now()
  WHERE invited_user_id = v_user_id
    AND id <> v_invite.id
    AND status = 'pending';

  RETURN public.get_my_quantum_event_lifecycle();
END;
$$;

CREATE OR REPLACE FUNCTION public.list_quantum_event_rooms(
  p_event_id TEXT,
  p_event_mode TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_starts_at TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT occurrence.starts_at INTO v_starts_at
  FROM public.quantum_event_participations AS participation
  JOIN public.quantum_event_occurrences AS occurrence ON occurrence.id = participation.occurrence_id
  WHERE participation.user_id = v_user_id
    AND participation.event_id = p_event_id
    AND participation.event_mode = p_event_mode
    AND participation.status IN ('recruiting', 'confirmed', 'completed')
  LIMIT 1;

  IF v_starts_at IS NULL THEN
    SELECT pg_catalog.min(occurrence.starts_at) INTO v_starts_at
    FROM public.quantum_event_occurrences AS occurrence
    WHERE occurrence.event_id = p_event_id
      AND occurrence.event_mode = p_event_mode
      AND occurrence.status = 'recruiting'
      AND occurrence.application_closes_at > pg_catalog.now();
  END IF;

  IF v_starts_at IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  WITH room_people AS (
    SELECT participation.occurrence_id, participation.user_id, profile.gender
    FROM public.quantum_event_participations AS participation
    JOIN public.profiles AS profile ON profile.user_id = participation.user_id
    WHERE participation.status IN ('recruiting', 'confirmed')
      AND participation.party_type = 'solo'
    UNION
    SELECT participation.occurrence_id, member.user_id, profile.gender
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id AND member.left_at IS NULL
    JOIN public.profiles AS profile ON profile.user_id = member.user_id
    WHERE participation.status IN ('recruiting', 'confirmed')
      AND participation.party_type = 'friends'
  ), people_counts AS (
    SELECT room_people.occurrence_id,
      pg_catalog.count(DISTINCT room_people.user_id)::INTEGER AS total,
      pg_catalog.count(DISTINCT room_people.user_id) FILTER (WHERE room_people.gender = 'male')::INTEGER AS male,
      pg_catalog.count(DISTINCT room_people.user_id) FILTER (WHERE room_people.gender = 'female')::INTEGER AS female
    FROM room_people
    GROUP BY room_people.occurrence_id
  ), reservation_counts AS (
    SELECT invite.occurrence_id,
      pg_catalog.count(*)::INTEGER AS total,
      pg_catalog.count(*) FILTER (WHERE profile.gender = 'male')::INTEGER AS male,
      pg_catalog.count(*) FILTER (WHERE profile.gender = 'female')::INTEGER AS female
    FROM public.quantum_event_room_invites AS invite
    JOIN public.profiles AS profile ON profile.user_id = invite.invited_user_id
    WHERE invite.status = 'pending' AND invite.expires_at > pg_catalog.now()
    GROUP BY invite.occurrence_id
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'occurrence_id', occurrence.id,
      'room_number', occurrence.room_number,
      'room_label', public.quantum_event_room_label(occurrence.room_number),
      'room_code', occurrence.room_code,
      'total', COALESCE(people_counts.total, 0),
      'male', COALESCE(people_counts.male, 0),
      'female', COALESCE(people_counts.female, 0),
      'reserved_total', COALESCE(reservation_counts.total, 0),
      'reserved_male', COALESCE(reservation_counts.male, 0),
      'reserved_female', COALESCE(reservation_counts.female, 0),
      'required_total', occurrence.required_total,
      'male_capacity', occurrence.male_capacity,
      'female_capacity', occurrence.female_capacity,
      'is_my_room', EXISTS (
        SELECT 1 FROM public.quantum_event_participations AS mine
        WHERE mine.user_id = v_user_id
          AND mine.occurrence_id = occurrence.id
          AND mine.status IN ('recruiting', 'confirmed', 'completed')
      )
    ) ORDER BY occurrence.room_number
  ), '[]'::JSONB)
  INTO v_result
  FROM public.quantum_event_occurrences AS occurrence
  LEFT JOIN people_counts ON people_counts.occurrence_id = occurrence.id
  LEFT JOIN reservation_counts ON reservation_counts.occurrence_id = occurrence.id
  WHERE occurrence.event_id = p_event_id
    AND occurrence.event_mode = p_event_mode
    AND occurrence.starts_at = v_starts_at
    AND occurrence.status IN ('recruiting', 'confirmed', 'completed');

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_quantum_event_lifecycle()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  WITH mine AS (
    SELECT
      participation.*,
      COALESCE(active_meeting.scheduled_start, occurrence.starts_at) AS starts_at,
      COALESCE(active_meeting.scheduled_end, occurrence.ends_at) AS ends_at,
      COALESCE(active_meeting.venue_name, occurrence.location_name) AS location_name,
      occurrence.required_total,
      occurrence.room_number,
      occurrence.room_code
    FROM public.quantum_event_participations AS participation
    JOIN public.quantum_event_occurrences AS occurrence ON occurrence.id = participation.occurrence_id
    LEFT JOIN LATERAL (
      SELECT meeting.scheduled_start, meeting.scheduled_end, venue.name AS venue_name
      FROM public.match_meetings AS meeting
      LEFT JOIN public.venues AS venue ON venue.id = meeting.venue_id
      WHERE meeting.match_id = participation.match_id AND meeting.status = 'scheduled'
      ORDER BY meeting.scheduled_start, meeting.id
      LIMIT 1
    ) AS active_meeting ON TRUE
    WHERE participation.user_id = v_user_id
  ), occurrence_people AS (
    SELECT DISTINCT people.user_id, profile.gender
    FROM (
      SELECT participation.user_id
      FROM public.quantum_event_participations AS participation
      JOIN mine ON mine.occurrence_id = participation.occurrence_id
      WHERE participation.status IN ('recruiting', 'confirmed')
        AND participation.party_type = 'solo'
      UNION ALL
      SELECT member.user_id
      FROM public.quantum_event_participations AS participation
      JOIN mine ON mine.occurrence_id = participation.occurrence_id
      JOIN public.group_members AS member
        ON member.group_id = participation.group_id AND member.left_at IS NULL
      WHERE participation.status IN ('recruiting', 'confirmed')
        AND participation.party_type = 'friends'
    ) AS people
    LEFT JOIN public.profiles AS profile ON profile.user_id = people.user_id
  ), my_party AS (
    SELECT mine.user_id FROM mine
    UNION
    SELECT member.user_id
    FROM mine
    JOIN public.group_members AS member
      ON member.group_id = mine.group_id AND member.left_at IS NULL
    WHERE mine.party_type = 'friends'
    UNION
    SELECT CASE
      WHEN invite.inviter_user_id = v_user_id THEN invite.invited_user_id
      ELSE invite.inviter_user_id
    END
    FROM mine
    JOIN public.quantum_event_room_invites AS invite
      ON invite.occurrence_id = mine.occurrence_id
     AND invite.status = 'accepted'
     AND (invite.inviter_user_id = v_user_id OR invite.invited_user_id = v_user_id)
  )
  SELECT pg_catalog.jsonb_build_object(
    'occurrence_id', mine.occurrence_id,
    'event_id', mine.event_id,
    'event_mode', mine.event_mode,
    'party_type', mine.party_type,
    'group_id', mine.group_id,
    'status', mine.status,
    'starts_at', mine.starts_at,
    'ends_at', mine.ends_at,
    'chat_opens_at', mine.starts_at - INTERVAL '20 minutes',
    'server_now', pg_catalog.now(),
    'match_id', mine.match_id,
    'location_name', mine.location_name,
    'cancel_reason', mine.cancel_reason,
    'room_number', mine.room_number,
    'room_label', public.quantum_event_room_label(mine.room_number),
    'room_code', mine.room_code,
    'participant_counts', pg_catalog.jsonb_build_object(
      'total', (SELECT pg_catalog.count(*) FROM occurrence_people),
      'male', (SELECT pg_catalog.count(*) FROM occurrence_people WHERE gender = 'male'),
      'female', (SELECT pg_catalog.count(*) FROM occurrence_people WHERE gender = 'female'),
      'required_total', mine.required_total
    ),
    'party_members', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'user_id', my_party.user_id,
        'display_name', CASE WHEN my_party.user_id = v_user_id THEN '나' ELSE '내 친구' END,
        'avatar_url', NULL
      ) ORDER BY my_party.user_id)
      FROM my_party
      LEFT JOIN public.profiles AS profile ON profile.user_id = my_party.user_id
    ), '[]'::JSONB),
    'review_required', mine.status = 'completed',
    'updated_at', mine.updated_at
  )
  INTO v_result
  FROM mine;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_quantum_event_room_invite_candidates()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quantum_event_room_invite_candidates()
  TO authenticated;
REVOKE ALL ON FUNCTION public.create_quantum_event_room_invite(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_quantum_event_room_invite(UUID)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_quantum_event_room_invites()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_quantum_event_room_invites()
  TO authenticated;
REVOKE ALL ON FUNCTION public.accept_quantum_event_room_invite(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_quantum_event_room_invite(TEXT)
  TO authenticated;
REVOKE ALL ON FUNCTION public.list_quantum_event_rooms(TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_quantum_event_rooms(TEXT, TEXT)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_quantum_event_lifecycle()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_quantum_event_lifecycle()
  TO authenticated;

COMMENT ON TABLE public.quantum_event_room_invites IS
  'Private same-room friend invitations. Pending rows reserve one same-gender seat for fifteen minutes.';
COMMENT ON FUNCTION public.assign_quantum_event_room(TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ) IS
  'Assigns a party to the first compatible numbered room and creates the next room on overflow.';
COMMENT ON FUNCTION public.create_quantum_event_room_invite(UUID) IS
  'Reserves one same-gender seat in the caller room for an active friend for fifteen minutes.';
COMMENT ON FUNCTION public.accept_quantum_event_room_invite(TEXT) IS
  'Accepts an unexpired exact-room friend invitation without exposing other room member identities.';
