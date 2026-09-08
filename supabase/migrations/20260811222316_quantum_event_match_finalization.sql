BEGIN;

ALTER TABLE public.quantum_event_occurrences
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS male_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS female_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS quantum_event_occurrences_match_unique
  ON public.quantum_event_occurrences(match_id)
  WHERE match_id IS NOT NULL;

ALTER TABLE public.match_meetings
  ADD COLUMN IF NOT EXISTS event_occurrence_id UUID
    REFERENCES public.quantum_event_occurrences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_name TEXT;

ALTER TABLE public.match_meetings
  ALTER COLUMN venue_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'match_meetings_location_source_check'
      AND conrelid = 'public.match_meetings'::regclass
  ) THEN
    ALTER TABLE public.match_meetings
      ADD CONSTRAINT match_meetings_location_source_check
      CHECK (
        venue_id IS NOT NULL
        OR (
          event_occurrence_id IS NOT NULL
          AND pg_catalog.char_length(pg_catalog.btrim(location_name)) > 0
        )
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS match_meetings_event_occurrence_unique
  ON public.match_meetings(event_occurrence_id)
  WHERE event_occurrence_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.match_meetings TO service_role;

CREATE TABLE IF NOT EXISTS public.quantum_event_match_members (
  occurrence_id UUID NOT NULL
    REFERENCES public.quantum_event_occurrences(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  party_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (match_id, user_id),
  UNIQUE (occurrence_id, user_id)
);

CREATE INDEX IF NOT EXISTS quantum_event_match_members_user_idx
  ON public.quantum_event_match_members(user_id, match_id);

ALTER TABLE public.quantum_event_match_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quantum_event_match_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quantum_event_match_members TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_quantum_event_occurrence(
  p_occurrence_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
  v_total INTEGER := 0;
  v_male INTEGER := 0;
  v_female INTEGER := 0;
  v_male_leader UUID;
  v_female_leader UUID;
  v_male_group_id UUID;
  v_female_group_id UUID;
  v_group_a_id UUID;
  v_group_b_id UUID;
  v_match_id UUID;
BEGIN
  IF p_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'invalid_occurrence' USING ERRCODE = '22023';
  END IF;

  SELECT occurrence.*
    INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = p_occurrence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_occurrence_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_occurrence.match_id IS NOT NULL THEN
    RETURN v_occurrence.match_id;
  END IF;
  IF v_occurrence.status <> 'recruiting' THEN
    RETURN NULL;
  END IF;

  WITH occurrence_people AS (
    SELECT participation.user_id, profile.gender, NULL::UUID AS party_group_id
    FROM public.quantum_event_participations AS participation
    JOIN public.profiles AS profile ON profile.user_id = participation.user_id
    WHERE participation.occurrence_id = p_occurrence_id
      AND participation.status = 'recruiting'
      AND participation.party_type = 'solo'
    UNION
    SELECT member.user_id, profile.gender, participation.group_id AS party_group_id
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id
     AND member.left_at IS NULL
    JOIN public.profiles AS profile ON profile.user_id = member.user_id
    WHERE participation.occurrence_id = p_occurrence_id
      AND participation.status = 'recruiting'
      AND participation.party_type = 'friends'
  )
  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(*) FILTER (WHERE gender = 'male')::INTEGER,
    pg_catalog.count(*) FILTER (WHERE gender = 'female')::INTEGER
  INTO v_total, v_male, v_female
  FROM occurrence_people;

  SELECT male_person.user_id
    INTO v_male_leader
  FROM (
    SELECT participation.user_id
    FROM public.quantum_event_participations AS participation
    JOIN public.profiles AS profile ON profile.user_id = participation.user_id
    WHERE participation.occurrence_id = p_occurrence_id
      AND participation.status = 'recruiting'
      AND participation.party_type = 'solo'
      AND profile.gender = 'male'
    UNION
    SELECT member.user_id
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id
     AND member.left_at IS NULL
    JOIN public.profiles AS profile ON profile.user_id = member.user_id
    WHERE participation.occurrence_id = p_occurrence_id
      AND participation.status = 'recruiting'
      AND participation.party_type = 'friends'
      AND profile.gender = 'male'
  ) AS male_person
  ORDER BY male_person.user_id
  LIMIT 1;

  SELECT female_person.user_id
    INTO v_female_leader
  FROM (
    SELECT participation.user_id
    FROM public.quantum_event_participations AS participation
    JOIN public.profiles AS profile ON profile.user_id = participation.user_id
    WHERE participation.occurrence_id = p_occurrence_id
      AND participation.status = 'recruiting'
      AND participation.party_type = 'solo'
      AND profile.gender = 'female'
    UNION
    SELECT member.user_id
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id
     AND member.left_at IS NULL
    JOIN public.profiles AS profile ON profile.user_id = member.user_id
    WHERE participation.occurrence_id = p_occurrence_id
      AND participation.status = 'recruiting'
      AND participation.party_type = 'friends'
      AND profile.gender = 'female'
  ) AS female_person
  ORDER BY female_person.user_id
  LIMIT 1;

  IF v_total <> v_occurrence.required_total
     OR v_male <> v_occurrence.male_capacity
     OR v_female <> v_occurrence.female_capacity THEN
    RETURN NULL;
  END IF;
  IF v_male_leader IS NULL OR v_female_leader IS NULL THEN
    RAISE EXCEPTION 'event_gender_composition_invalid' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.quantum_event_occurrences
  SET status = 'assignment', updated_at = pg_catalog.now()
  WHERE id = p_occurrence_id AND status = 'recruiting';

  IF NOT FOUND THEN
    SELECT occurrence.match_id INTO v_match_id
    FROM public.quantum_event_occurrences AS occurrence
    WHERE occurrence.id = p_occurrence_id;
    RETURN v_match_id;
  END IF;

  INSERT INTO public.groups (leader_user_id, name, size, gender, status)
  VALUES (
    v_male_leader,
    'Quantum event ' || p_occurrence_id::TEXT || ' male',
    v_male,
    'male',
    'matched'
  )
  RETURNING id INTO v_male_group_id;

  INSERT INTO public.groups (leader_user_id, name, size, gender, status)
  VALUES (
    v_female_leader,
    'Quantum event ' || p_occurrence_id::TEXT || ' female',
    v_female,
    'female',
    'matched'
  )
  RETURNING id INTO v_female_group_id;

  IF v_male_group_id < v_female_group_id THEN
    v_group_a_id := v_male_group_id;
    v_group_b_id := v_female_group_id;
  ELSE
    v_group_a_id := v_female_group_id;
    v_group_b_id := v_male_group_id;
  END IF;

  INSERT INTO public.matches (
    group_a_id,
    group_b_id,
    score,
    score_breakdown,
    batch_id,
    is_forced,
    status,
    matched_at,
    confirmed_at,
    group_a_confirmed_at,
    group_b_confirmed_at,
    approval_status
  ) VALUES (
    v_group_a_id,
    v_group_b_id,
    0,
    pg_catalog.jsonb_build_object(
      'source', 'quantum_event',
      'occurrence_id', p_occurrence_id,
      'event_id', v_occurrence.event_id
    ),
    p_occurrence_id,
    TRUE,
    'confirmed',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now(),
    'approved'
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.match_meetings (
    match_id,
    venue_id,
    event_occurrence_id,
    location_name,
    scheduled_start,
    scheduled_end,
    checkin_radius_m,
    status,
    assignment_reason
  ) VALUES (
    v_match_id,
    NULL,
    p_occurrence_id,
    v_occurrence.location_name,
    v_occurrence.starts_at,
    v_occurrence.ends_at,
    50,
    'scheduled',
    pg_catalog.jsonb_build_object(
      'source', 'quantum_event',
      'event_id', v_occurrence.event_id
    )
  );

  INSERT INTO public.quantum_event_match_members (
    occurrence_id,
    match_id,
    user_id,
    gender,
    party_group_id
  )
  SELECT
    p_occurrence_id,
    v_match_id,
    people.user_id,
    people.gender,
    people.party_group_id
  FROM (
    SELECT participation.user_id, profile.gender, NULL::UUID AS party_group_id
    FROM public.quantum_event_participations AS participation
    JOIN public.profiles AS profile ON profile.user_id = participation.user_id
    WHERE participation.occurrence_id = p_occurrence_id
      AND participation.status = 'recruiting'
      AND participation.party_type = 'solo'
    UNION
    SELECT member.user_id, profile.gender, participation.group_id AS party_group_id
    FROM public.quantum_event_participations AS participation
    JOIN public.group_members AS member
      ON member.group_id = participation.group_id
     AND member.left_at IS NULL
    JOIN public.profiles AS profile ON profile.user_id = member.user_id
    WHERE participation.occurrence_id = p_occurrence_id
      AND participation.status = 'recruiting'
      AND participation.party_type = 'friends'
  ) AS people;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.quantum_event_match_members AS event_member
    WHERE event_member.match_id = v_match_id
  ) <> v_occurrence.required_total THEN
    RAISE EXCEPTION 'event_member_count_mismatch' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.quantum_event_participations
  SET status = 'confirmed',
      match_id = v_match_id,
      cancel_reason = NULL,
      updated_at = pg_catalog.now()
  WHERE occurrence_id = p_occurrence_id
    AND status = 'recruiting';

  UPDATE public.quantum_event_occurrences
  SET status = 'confirmed',
      match_id = v_match_id,
      male_group_id = v_male_group_id,
      female_group_id = v_female_group_id,
      updated_at = pg_catalog.now()
  WHERE id = p_occurrence_id;

  RETURN v_match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_quantum_event_occurrence(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_quantum_event_occurrence(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_quantum_event_capacity_reached()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.occurrence_id IS NOT NULL AND NEW.status = 'recruiting' THEN
    PERFORM public.finalize_quantum_event_occurrence(NEW.occurrence_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_quantum_event_capacity_reached()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_quantum_event_finalize_when_full
  ON public.quantum_event_participations;
CREATE TRIGGER trg_quantum_event_finalize_when_full
  AFTER INSERT OR UPDATE OF occurrence_id, status
  ON public.quantum_event_participations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_quantum_event_capacity_reached();

CREATE OR REPLACE FUNCTION public.can_access_match_chat(p_match_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_exists BOOLEAN;
BEGIN
  IF v_caller IS NULL OR p_user_id IS DISTINCT FROM v_caller THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.matches AS match_row
    WHERE match_row.id = p_match_id
      AND match_row.status IN ('confirmed', 'completed')
      AND match_row.approval_status = 'approved'
      AND (
        EXISTS (
          SELECT 1
          FROM public.group_members AS group_member
          WHERE group_member.group_id IN (match_row.group_a_id, match_row.group_b_id)
            AND group_member.user_id = p_user_id
            AND group_member.left_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM public.quantum_event_match_members AS event_member
          WHERE event_member.match_id = match_row.id
            AND event_member.user_id = p_user_id
        )
      )
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_match_chat(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_match_chat(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_meeting_evidence_context(
  p_match_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  match_id UUID,
  group_a_id UUID,
  group_b_id UUID,
  is_participant BOOLEAN,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role TEXT := COALESCE(
    auth.jwt() ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', TRUE),
    ''
  );
BEGIN
  IF v_request_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_match_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_meeting_evidence_context';
  END IF;

  RETURN QUERY
  SELECT
    match_row.id,
    match_row.group_a_id,
    match_row.group_b_id,
    (
      EXISTS (
        SELECT 1
        FROM public.group_members AS group_member
        WHERE group_member.group_id IN (match_row.group_a_id, match_row.group_b_id)
          AND group_member.user_id = p_user_id
          AND group_member.left_at IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public.quantum_event_match_members AS event_member
        WHERE event_member.match_id = match_row.id
          AND event_member.user_id = p_user_id
      )
    ),
    meeting_row.scheduled_start,
    meeting_row.scheduled_end
  FROM public.matches AS match_row
  LEFT JOIN LATERAL (
    SELECT meeting.scheduled_start, meeting.scheduled_end
    FROM public.match_meetings AS meeting
    WHERE meeting.match_id = match_row.id
      AND meeting.status <> 'cancelled'
    ORDER BY meeting.scheduled_start DESC, meeting.id DESC
    LIMIT 1
  ) AS meeting_row ON TRUE
  WHERE match_row.id = p_match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_meeting_evidence_context(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_meeting_evidence_context(UUID, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_quantum_event_qa_fixture(
  p_occurrence_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role TEXT := COALESCE(
    auth.jwt() ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', TRUE),
    ''
  );
  v_occurrence public.quantum_event_occurrences%ROWTYPE;
BEGIN
  IF v_request_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  SELECT occurrence.*
    INTO v_occurrence
  FROM public.quantum_event_occurrences AS occurrence
  WHERE occurrence.id = p_occurrence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  IF v_occurrence.starts_at <= pg_catalog.now() + INTERVAL '300 days' THEN
    RAISE EXCEPTION 'qa_fixture_boundary_required' USING ERRCODE = 'P0001';
  END IF;
  IF v_occurrence.match_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.matches AS match_row
    WHERE match_row.id = v_occurrence.match_id
      AND match_row.score_breakdown ->> 'source' = 'quantum_event'
      AND match_row.batch_id = p_occurrence_id
  ) THEN
    RAISE EXCEPTION 'qa_fixture_match_invalid' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.quantum_event_participations
  WHERE occurrence_id = p_occurrence_id;

  DELETE FROM public.match_meetings
  WHERE event_occurrence_id = p_occurrence_id;

  DELETE FROM public.quantum_event_match_members
  WHERE occurrence_id = p_occurrence_id;

  UPDATE public.quantum_event_occurrences
  SET match_id = NULL, male_group_id = NULL, female_group_id = NULL
  WHERE id = p_occurrence_id;

  IF v_occurrence.match_id IS NOT NULL THEN
    DELETE FROM public.matches WHERE id = v_occurrence.match_id;
  END IF;
  IF v_occurrence.male_group_id IS NOT NULL THEN
    DELETE FROM public.groups WHERE id = v_occurrence.male_group_id;
  END IF;
  IF v_occurrence.female_group_id IS NOT NULL THEN
    DELETE FROM public.groups WHERE id = v_occurrence.female_group_id;
  END IF;

  DELETE FROM public.quantum_event_occurrences WHERE id = p_occurrence_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_quantum_event_qa_fixture(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_quantum_event_qa_fixture(UUID) TO service_role;

COMMENT ON TABLE public.quantum_event_match_members IS
  'Private event-to-match membership bridge. It avoids occupying legacy active group membership slots.';
COMMENT ON FUNCTION public.finalize_quantum_event_occurrence(UUID) IS
  'Atomically creates one confirmed match and meeting when an event occurrence reaches its exact capacity.';
COMMENT ON FUNCTION public.cleanup_quantum_event_qa_fixture(UUID) IS
  'Deletes only isolated Quantum event fixtures scheduled more than 300 days ahead.';

COMMIT;
