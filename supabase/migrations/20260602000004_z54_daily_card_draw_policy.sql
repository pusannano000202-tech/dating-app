-- Migration: draw-based daily card policy.
-- Date: 2026-06-02

ALTER TABLE public.match_daily_card_schedule
  DROP CONSTRAINT IF EXISTS match_daily_card_schedule_day_offset_check;

ALTER TABLE public.match_daily_card_schedule
  ADD CONSTRAINT match_daily_card_schedule_day_offset_check
  CHECK (day_offset BETWEEN -7 AND -1);

ALTER TABLE public.match_daily_card_schedule
  ADD COLUMN IF NOT EXISTS reveal_window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reveal_window_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS selected_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_slot SMALLINT,
  ADD COLUMN IF NOT EXISTS forfeited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_match_daily_card_schedule_draw_window
  ON public.match_daily_card_schedule(match_id, viewer_group_id, reveal_window_start, reveal_window_end);

CREATE OR REPLACE FUNCTION public.expire_missed_match_daily_cards(
  p_match_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired INT := 0;
BEGIN
  UPDATE match_daily_card_schedule
     SET forfeited_at = COALESCE(forfeited_at, reveal_window_end)
   WHERE match_id = p_match_id
     AND selected_at IS NULL
     AND forfeited_at IS NULL
     AND reveal_window_end IS NOT NULL
     AND reveal_window_end < NOW();

  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_match_daily_card_schedule(
  p_match_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_scheduled_at TIMESTAMPTZ;
  v_inserted INT := 0;
  v_group_a_size INT := 0;
  v_group_b_size INT := 0;
  v_card_kinds TEXT[];
BEGIN
  SELECT * INTO v_match FROM matches WHERE matches.id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  v_scheduled_at := public.get_match_scheduled_reveal_at(p_match_id);
  IF v_scheduled_at IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_group_a_size
    FROM group_members
   WHERE group_id = v_match.group_a_id
     AND left_at IS NULL;

  SELECT COUNT(*) INTO v_group_b_size
    FROM group_members
   WHERE group_id = v_match.group_b_id
     AND left_at IS NULL;

  IF v_group_a_size = 1 AND v_group_b_size = 1 THEN
    v_card_kinds := ARRAY[
      'mbti',
      'music',
      'pre_meeting_question',
      'debate',
      'preference',
      'relationship_style',
      'intro'
    ];
  ELSE
    v_card_kinds := ARRAY[
      'music',
      'mbti',
      'debate',
      'group_preference',
      'pre_meeting_question',
      'intro',
      'vibe'
    ];
  END IF;

  PERFORM public.populate_match_member_aliases(p_match_id);

  WITH viewer_groups AS (
    SELECT v_match.group_a_id AS viewer_group_id
    UNION ALL
    SELECT v_match.group_b_id
  ),
  days AS (
    SELECT generate_series(-7, -1)::INT AS day_offset
  ),
  aliases AS (
    SELECT
      mma.viewer_group_id,
      mma.target_user_id,
      mma.alias,
      (ROW_NUMBER() OVER (PARTITION BY mma.viewer_group_id ORDER BY mma.sort_order, mma.target_user_id))::INT AS alias_rank,
      (COUNT(*) OVER (PARTITION BY mma.viewer_group_id))::INT AS alias_count
    FROM match_member_aliases mma
    WHERE mma.match_id = p_match_id
  ),
  chosen AS (
    SELECT
      p_match_id AS match_id,
      vg.viewer_group_id,
      a.target_user_id,
      d.day_offset,
      v_card_kinds[((ABS(d.day_offset) - 1) % array_length(v_card_kinds, 1)) + 1] AS card_kind,
      a.alias || ' 두근두근 카드' AS title,
      (date_trunc('day', v_scheduled_at AT TIME ZONE 'Asia/Seoul')
        + (d.day_offset || ' days')::INTERVAL
        + INTERVAL '16 hours') AT TIME ZONE 'Asia/Seoul' AS reveal_at,
      (date_trunc('day', v_scheduled_at AT TIME ZONE 'Asia/Seoul')
        + (d.day_offset || ' days')::INTERVAL
        + INTERVAL '16 hours') AT TIME ZONE 'Asia/Seoul' AS reveal_window_start,
      (date_trunc('day', v_scheduled_at AT TIME ZONE 'Asia/Seoul')
        + (d.day_offset || ' days')::INTERVAL
        + INTERVAL '20 hours') AT TIME ZONE 'Asia/Seoul' AS reveal_window_end
    FROM viewer_groups vg
    JOIN days d ON TRUE
    JOIN aliases a
      ON a.viewer_group_id = vg.viewer_group_id
     AND a.alias_rank = (((ABS(d.day_offset) - 1) % a.alias_count) + 1)
  ),
  inserted AS (
    INSERT INTO match_daily_card_schedule (
      match_id,
      viewer_group_id,
      target_user_id,
      day_offset,
      card_kind,
      title,
      reveal_at,
      reveal_window_start,
      reveal_window_end
    )
    SELECT
      match_id,
      viewer_group_id,
      target_user_id,
      day_offset,
      card_kind,
      title,
      reveal_at,
      reveal_window_start,
      reveal_window_end
    FROM chosen
    ON CONFLICT (match_id, viewer_group_id, day_offset) DO UPDATE
      SET reveal_at = EXCLUDED.reveal_at,
          reveal_window_start = COALESCE(match_daily_card_schedule.reveal_window_start, EXCLUDED.reveal_window_start),
          reveal_window_end = COALESCE(match_daily_card_schedule.reveal_window_end, EXCLUDED.reveal_window_end)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.pick_match_daily_card(
  p_match_id UUID,
  p_selection_slot SMALLINT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  day_offset SMALLINT,
  reveal_at TIMESTAMPTZ,
  reveal_window_start TIMESTAMPTZ,
  reveal_window_end TIMESTAMPTZ,
  can_pick BOOLEAN,
  selected_at TIMESTAMPTZ,
  forfeited_at TIMESTAMPTZ,
  alias TEXT,
  card_kind TEXT,
  title TEXT,
  content_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_viewer_group_id UUID;
  v_card_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE matches.id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  SELECT gm.group_id
    INTO v_viewer_group_id
    FROM group_members gm
   WHERE gm.user_id = v_caller
     AND gm.left_at IS NULL
     AND gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
   LIMIT 1;

  IF v_viewer_group_id IS NULL THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  PERFORM public.assign_match_daily_card_schedule(p_match_id);
  PERFORM public.expire_missed_match_daily_cards(p_match_id);

  SELECT s.id
    INTO v_card_id
    FROM match_daily_card_schedule s
   WHERE s.match_id = p_match_id
     AND s.viewer_group_id = v_viewer_group_id
     AND s.selected_at IS NULL
     AND s.forfeited_at IS NULL
     AND COALESCE(s.reveal_window_start, s.reveal_at) <= NOW()
     AND COALESCE(s.reveal_window_end, s.reveal_at + INTERVAL '4 hours') >= NOW()
   ORDER BY COALESCE(s.reveal_window_start, s.reveal_at) ASC
   LIMIT 1
   FOR UPDATE;

  IF v_card_id IS NULL THEN
    RAISE EXCEPTION 'no_draw_available';
  END IF;

  UPDATE match_daily_card_schedule s
     SET selected_at = NOW(),
         selected_by_user_id = v_caller,
         selected_slot = p_selection_slot
   WHERE s.id = v_card_id;

  RETURN QUERY
  SELECT
    s.id,
    s.day_offset,
    s.reveal_at,
    COALESCE(s.reveal_window_start, s.reveal_at) AS reveal_window_start,
    COALESCE(s.reveal_window_end, s.reveal_at + INTERVAL '4 hours') AS reveal_window_end,
    FALSE AS can_pick,
    s.selected_at,
    s.forfeited_at,
    mma.alias,
    s.card_kind,
    s.title,
    mcs.content_text
  FROM match_daily_card_schedule s
  JOIN match_member_aliases mma
    ON mma.match_id = s.match_id
   AND mma.viewer_group_id = s.viewer_group_id
   AND mma.target_user_id = s.target_user_id
  LEFT JOIN match_card_submissions mcs
    ON mcs.match_id = s.match_id
   AND mcs.user_id = s.target_user_id
  WHERE s.id = v_card_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_match_daily_cards(UUID);

CREATE OR REPLACE FUNCTION public.get_match_daily_cards(
  p_match_id UUID
)
RETURNS TABLE (
  id UUID,
  day_offset SMALLINT,
  reveal_at TIMESTAMPTZ,
  reveal_window_start TIMESTAMPTZ,
  reveal_window_end TIMESTAMPTZ,
  revealed BOOLEAN,
  can_pick BOOLEAN,
  selected_at TIMESTAMPTZ,
  forfeited_at TIMESTAMPTZ,
  alias TEXT,
  card_kind TEXT,
  title TEXT,
  content_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_viewer_group_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE matches.id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  SELECT gm.group_id
    INTO v_viewer_group_id
    FROM group_members gm
   WHERE gm.user_id = v_caller
     AND gm.left_at IS NULL
     AND gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
   LIMIT 1;

  IF v_viewer_group_id IS NULL THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  PERFORM public.assign_match_daily_card_schedule(p_match_id);
  PERFORM public.expire_missed_match_daily_cards(p_match_id);

  RETURN QUERY
  SELECT
    s.id,
    s.day_offset,
    s.reveal_at,
    COALESCE(s.reveal_window_start, s.reveal_at) AS reveal_window_start,
    COALESCE(s.reveal_window_end, s.reveal_at + INTERVAL '4 hours') AS reveal_window_end,
    s.selected_at IS NOT NULL AS revealed,
    (
      s.selected_at IS NULL
      AND s.forfeited_at IS NULL
      AND COALESCE(s.reveal_window_start, s.reveal_at) <= NOW()
      AND COALESCE(s.reveal_window_end, s.reveal_at + INTERVAL '4 hours') >= NOW()
    ) AS can_pick,
    s.selected_at,
    s.forfeited_at,
    mma.alias,
    s.card_kind,
    s.title,
    CASE WHEN s.selected_at IS NOT NULL THEN mcs.content_text ELSE NULL END AS content_text
  FROM match_daily_card_schedule s
  JOIN match_member_aliases mma
    ON mma.match_id = s.match_id
   AND mma.viewer_group_id = s.viewer_group_id
   AND mma.target_user_id = s.target_user_id
  LEFT JOIN match_card_submissions mcs
    ON mcs.match_id = s.match_id
   AND mcs.user_id = s.target_user_id
  WHERE s.match_id = p_match_id
    AND s.viewer_group_id = v_viewer_group_id
  ORDER BY s.day_offset ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_missed_match_daily_cards(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pick_match_daily_card(UUID, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_daily_cards(UUID) TO authenticated;

COMMENT ON FUNCTION public.expire_missed_match_daily_cards(UUID) IS
  'Marks unpicked daily cards as forfeited after the 16:00-20:00 draw window.';
COMMENT ON FUNCTION public.pick_match_daily_card(UUID, SMALLINT) IS
  'Selects today''s card for a viewer group during the 16:00-20:00 window, preventing duplicate picks.';
COMMENT ON FUNCTION public.get_match_daily_cards(UUID) IS
  'Returns viewer-group daily cards. Content is hidden until the viewer group picks the card, and missed windows are forfeited.';
