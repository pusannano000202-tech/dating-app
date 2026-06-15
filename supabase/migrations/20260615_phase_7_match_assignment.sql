-- Phase 7: assign meeting schedule/venue when both leaders confirm.

CREATE OR REPLACE FUNCTION public.assign_match_meeting_for_confirmed_match(
  p_match_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_group_size INT;
  v_candidate_day_idx INT;
  v_candidate_start_min INT;
  v_candidate_end_min INT;
  v_now timestamptz := NOW();
  v_today timestamptz;
  v_today_isodow INT;
  v_target_isodow INT;
  v_offset INT;
  v_scheduled_start timestamptz;
  v_scheduled_end timestamptz;
  v_venue_id UUID;
  v_checkin_radius INT;
  v_assignment_reason JSONB;
  v_existing UUID;
  v_meeting_id UUID;
BEGIN
  IF to_regclass('public.matches') IS NULL
    OR to_regclass('public.group_members') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.venues') IS NULL
    OR to_regclass('public.match_meetings') IS NULL
  THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_match.status <> 'confirmed' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_existing FROM match_meetings WHERE match_id = p_match_id LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT COUNT(*)
    INTO v_group_size
    FROM (
      SELECT group_id FROM group_members WHERE group_id = v_match.group_a_id AND left_at IS NULL
      UNION ALL
      SELECT group_id FROM group_members WHERE group_id = v_match.group_b_id AND left_at IS NULL
    ) m;

  IF v_group_size <= 0 THEN
    RETURN NULL;
  END IF;

  -- Find first overlapping time window between group A and group B weekly slots.
  WITH group_a_slots AS (
    SELECT
      CASE lower(slot_data.slot ->> 'day')
        WHEN 'monday' THEN 0
        WHEN 'tuesday' THEN 1
        WHEN 'wednesday' THEN 2
        WHEN 'thursday' THEN 3
        WHEN 'friday' THEN 4
        WHEN 'saturday' THEN 5
        WHEN 'sunday' THEN 6
        ELSE NULL
      END AS day_idx,
      CASE
        WHEN (slot_data.slot ->> 'start') ~ '^(?:[01]?[0-9]|2[0-3]):[0-5][0-9]$'
          THEN split_part(slot_data.slot ->> 'start', ':', 1)::INT * 60 + split_part(slot_data.slot ->> 'start', ':', 2)::INT
        ELSE NULL
      END AS start_min,
      CASE
        WHEN (slot_data.slot ->> 'end') ~ '^(?:[01]?[0-9]|2[0-3]):[0-5][0-9]$'
          THEN split_part(slot_data.slot ->> 'end', ':', 1)::INT * 60 + split_part(slot_data.slot ->> 'end', ':', 2)::INT
        ELSE NULL
      END AS end_min
    FROM group_members gm
    JOIN profiles p ON p.user_id = gm.user_id
    LEFT JOIN LATERAL jsonb_array_elements(COALESCE(p.available_timeslots -> 'slots', '[]'::jsonb)) slot_data(slot)
      ON TRUE
    WHERE gm.group_id = v_match.group_a_id
      AND gm.left_at IS NULL
      AND p.available_timeslots IS NOT NULL
      AND p.available_timeslots ? 'slots'
  ),
  group_b_slots AS (
    SELECT
      CASE lower(slot_data.slot ->> 'day')
        WHEN 'monday' THEN 0
        WHEN 'tuesday' THEN 1
        WHEN 'wednesday' THEN 2
        WHEN 'thursday' THEN 3
        WHEN 'friday' THEN 4
        WHEN 'saturday' THEN 5
        WHEN 'sunday' THEN 6
        ELSE NULL
      END AS day_idx,
      CASE
        WHEN (slot_data.slot ->> 'start') ~ '^(?:[01]?[0-9]|2[0-3]):[0-5][0-9]$'
          THEN split_part(slot_data.slot ->> 'start', ':', 1)::INT * 60 + split_part(slot_data.slot ->> 'start', ':', 2)::INT
        ELSE NULL
      END AS start_min,
      CASE
        WHEN (slot_data.slot ->> 'end') ~ '^(?:[01]?[0-9]|2[0-3]):[0-5][0-9]$'
          THEN split_part(slot_data.slot ->> 'end', ':', 1)::INT * 60 + split_part(slot_data.slot ->> 'end', ':', 2)::INT
        ELSE NULL
      END AS end_min
    FROM group_members gm
    JOIN profiles p ON p.user_id = gm.user_id
    LEFT JOIN LATERAL jsonb_array_elements(COALESCE(p.available_timeslots -> 'slots', '[]'::jsonb)) slot_data(slot)
      ON TRUE
    WHERE gm.group_id = v_match.group_b_id
      AND gm.left_at IS NULL
      AND p.available_timeslots IS NOT NULL
      AND p.available_timeslots ? 'slots'
  ),
  matched_overlaps AS (
    SELECT
      a.day_idx,
      GREATEST(a.start_min, b.start_min) AS overlap_start,
      LEAST(a.end_min, b.end_min) AS overlap_end
    FROM group_a_slots a
    JOIN group_b_slots b
      ON a.day_idx = b.day_idx
    WHERE a.day_idx IS NOT NULL
      AND b.day_idx IS NOT NULL
      AND a.start_min IS NOT NULL
      AND a.end_min IS NOT NULL
      AND b.start_min IS NOT NULL
      AND b.end_min IS NOT NULL
      AND a.start_min < a.end_min
      AND b.start_min < b.end_min
      AND GREATEST(a.start_min, b.start_min) < LEAST(a.end_min, b.end_min)
  )
  SELECT
    o.day_idx,
    o.overlap_start,
    o.overlap_end
  INTO
    v_candidate_day_idx,
    v_candidate_start_min,
    v_candidate_end_min
  FROM matched_overlaps o
  ORDER BY o.day_idx ASC, o.overlap_start ASC
  LIMIT 1;

  -- Fallback when no overlap exists: set a generic upcoming slot.
  IF v_candidate_day_idx IS NULL OR v_candidate_start_min IS NULL OR v_candidate_end_min IS NULL THEN
    v_assignment_reason := jsonb_build_object(
      'reason', 'no_timeslot_intersection',
      'fallback', TRUE
    );
    v_candidate_day_idx := extract(isodow FROM v_now AT TIME ZONE 'Asia/Seoul')::INT - 1;
    IF v_candidate_day_idx < 0 THEN
      v_candidate_day_idx := 0;
    END IF;
    v_candidate_start_min := 19 * 60;
    v_candidate_end_min := 21 * 60;
  ELSE
    v_assignment_reason := jsonb_build_object(
      'reason', 'timeslot_intersection',
      'day_idx', v_candidate_day_idx,
      'slot_start_min', v_candidate_start_min,
      'slot_end_min', v_candidate_end_min,
      'source', 'profiles.available_timeslots'
    );
  END IF;

  SELECT
    id,
    checkin_radius_m
  INTO
    v_venue_id,
    v_checkin_radius
  FROM venues
  WHERE status = 'active'
    AND suitable_for_group_meeting = TRUE
    AND min_group_size <= v_group_size
    AND max_group_size >= v_group_size
  ORDER BY quality_score DESC, admin_priority DESC, created_at ASC
  LIMIT 1;

  IF v_venue_id IS NULL THEN
    v_assignment_reason := jsonb_set(
      COALESCE(v_assignment_reason, '{}'::jsonb),
      '{reason}',
      to_jsonb('no_available_venue'::text)
    );
    RETURN NULL;
  END IF;

  v_today := date_trunc('day', v_now AT TIME ZONE 'Asia/Seoul');
  v_today_isodow := extract(isodow FROM v_today)::INT;
  v_target_isodow := CASE v_candidate_day_idx
    WHEN 0 THEN 1
    WHEN 1 THEN 2
    WHEN 2 THEN 3
    WHEN 3 THEN 4
    WHEN 4 THEN 5
    WHEN 5 THEN 6
    WHEN 6 THEN 7
    ELSE 1
  END;
  v_offset := (v_target_isodow - v_today_isodow + 7) % 7;

  v_scheduled_start := (v_today
    + (v_offset || ' days')::interval
    + (v_candidate_start_min || ' minutes')::interval) AT TIME ZONE 'Asia/Seoul';

  IF v_scheduled_start <= v_now THEN
    v_scheduled_start := v_scheduled_start + INTERVAL '7 days';
  END IF;

  v_scheduled_end := v_scheduled_start + (v_candidate_end_min - v_candidate_start_min) * INTERVAL '1 minute';
  IF v_scheduled_end <= v_scheduled_start THEN
    v_scheduled_end := v_scheduled_start + INTERVAL '2 hours';
  END IF;

  INSERT INTO match_meetings (
    match_id,
    venue_id,
    scheduled_start,
    scheduled_end,
    checkin_radius_m,
    status,
    assignment_reason
  )
  VALUES (
    p_match_id,
    v_venue_id,
    v_scheduled_start,
    v_scheduled_end,
    v_checkin_radius,
    'scheduled',
    v_assignment_reason
  )
  RETURNING id INTO v_meeting_id;

  RETURN v_meeting_id;
END;
$$;

DROP FUNCTION IF EXISTS public.confirm_match(UUID);

CREATE OR REPLACE FUNCTION public.confirm_match(
  p_match_id UUID
)
RETURNS TABLE (
  match_id UUID,
  status TEXT,
  group_a_confirmed_at TIMESTAMPTZ,
  group_b_confirmed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_side TEXT;
  v_caller_group_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_a_at TIMESTAMPTZ;
  v_b_at TIMESTAMPTZ;
  v_new_status TEXT;
  v_new_confirmed_at TIMESTAMPTZ;
  v_active_count INT;
  v_card_count INT;
  v_deposit_count INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM groups g WHERE g.id = v_match.group_a_id AND g.leader_user_id = v_caller) THEN
    v_side := 'a';
    v_caller_group_id := v_match.group_a_id;
  ELSIF EXISTS (SELECT 1 FROM groups g WHERE g.id = v_match.group_b_id AND g.leader_user_id = v_caller) THEN
    v_side := 'b';
    v_caller_group_id := v_match.group_b_id;
  ELSE
    RAISE EXCEPTION 'not_match_leader';
  END IF;

  IF v_match.status <> 'pending' THEN
    RAISE EXCEPTION 'match_not_pending';
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM group_members gm
   WHERE gm.group_id = v_caller_group_id
     AND gm.left_at IS NULL;

  SELECT COUNT(DISTINCT mcs.user_id)
    INTO v_card_count
    FROM match_card_submissions mcs
    JOIN group_members gm
      ON gm.group_id = v_caller_group_id
     AND gm.user_id = mcs.user_id
     AND gm.left_at IS NULL
   WHERE mcs.match_id = p_match_id
     AND mcs.group_id = v_caller_group_id;

  IF v_card_count < v_active_count THEN
    RAISE EXCEPTION 'match_card_incomplete';
  END IF;

  SELECT COUNT(DISTINCT d.user_id)
    INTO v_deposit_count
    FROM deposits d
    JOIN group_members gm
      ON gm.group_id = v_caller_group_id
     AND gm.user_id = d.user_id
     AND gm.left_at IS NULL
   WHERE d.group_id = v_caller_group_id
     AND d.status IN ('paid', 'held');

  IF v_deposit_count < v_active_count THEN
    RAISE EXCEPTION 'deposit_not_paid';
  END IF;

  v_a_at := v_match.group_a_confirmed_at;
  v_b_at := v_match.group_b_confirmed_at;

  IF v_side = 'a' THEN
    IF v_a_at IS NULL THEN
      v_a_at := v_now;
    END IF;
  ELSE
    IF v_b_at IS NULL THEN
      v_b_at := v_now;
    END IF;
  END IF;

  IF v_a_at IS NOT NULL AND v_b_at IS NOT NULL THEN
    v_new_status := 'confirmed';
    v_new_confirmed_at := GREATEST(v_a_at, v_b_at);
    PERFORM public.assign_match_meeting_for_confirmed_match(p_match_id);
  ELSE
    v_new_status := 'pending';
    v_new_confirmed_at := NULL;
  END IF;

  UPDATE matches
     SET group_a_confirmed_at = v_a_at,
         group_b_confirmed_at = v_b_at,
         status               = v_new_status,
         confirmed_at         = v_new_confirmed_at
   WHERE id = p_match_id;

  RETURN QUERY SELECT p_match_id, v_new_status, v_a_at, v_b_at, v_new_confirmed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_match(UUID) TO authenticated;

COMMENT ON FUNCTION public.assign_match_meeting_for_confirmed_match(UUID) IS
  'Assign one match_meetings row when both leaders have confirmed. Uses group timeslot overlap when available, with safe fallback scheduling and venue capacity filtering.';
