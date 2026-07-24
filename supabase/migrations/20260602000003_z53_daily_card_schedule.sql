-- Migration: daily anonymous card reveal schedule.
-- Date: 2026-06-02

CREATE TABLE IF NOT EXISTS public.match_daily_card_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  viewer_group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_offset SMALLINT NOT NULL CHECK (day_offset BETWEEN -6 AND -1),
  card_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  reveal_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, viewer_group_id, day_offset)
);

CREATE INDEX IF NOT EXISTS idx_match_daily_card_schedule_viewer
  ON public.match_daily_card_schedule(match_id, viewer_group_id, reveal_at);

ALTER TABLE public.match_daily_card_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_daily_card_schedule_select_viewer_group_members
  ON public.match_daily_card_schedule;

CREATE POLICY match_daily_card_schedule_select_viewer_group_members
  ON public.match_daily_card_schedule
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.group_members gm
       WHERE gm.group_id = match_daily_card_schedule.viewer_group_id
         AND gm.user_id = auth.uid()
         AND gm.left_at IS NULL
    )
  );

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
  v_card_kinds TEXT[] := ARRAY['taste', 'personality', 'weekend', 'food', 'music', 'ideal_type'];
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  v_scheduled_at := public.get_match_scheduled_reveal_at(p_match_id);
  IF v_scheduled_at IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM public.populate_match_member_aliases(p_match_id);

  WITH viewer_groups AS (
    SELECT v_match.group_a_id AS viewer_group_id
    UNION ALL
    SELECT v_match.group_b_id
  ),
  days AS (
    SELECT generate_series(-6, -1)::INT AS day_offset
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
      a.alias || ' 카드' AS title,
      date_trunc('day', v_scheduled_at)
        + (d.day_offset || ' days')::INTERVAL
        + INTERVAL '9 hours' AS reveal_at
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
      reveal_at
    )
    SELECT
      match_id,
      viewer_group_id,
      target_user_id,
      day_offset,
      card_kind,
      title,
      reveal_at
    FROM chosen
    ON CONFLICT (match_id, viewer_group_id, day_offset) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_match_daily_cards(
  p_match_id UUID
)
RETURNS TABLE (
  day_offset SMALLINT,
  reveal_at TIMESTAMPTZ,
  revealed BOOLEAN,
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

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
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

  RETURN QUERY
  SELECT
    s.day_offset,
    s.reveal_at,
    s.reveal_at <= NOW() AS revealed,
    mma.alias,
    s.card_kind,
    s.title,
    CASE WHEN s.reveal_at <= NOW() THEN mcs.content_text ELSE NULL END AS content_text
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

GRANT EXECUTE ON FUNCTION public.assign_match_daily_card_schedule(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_daily_cards(UUID) TO authenticated;

COMMENT ON TABLE public.match_daily_card_schedule IS
  'One daily anonymous card for each viewer group from D-6 to D-1 before the scheduled meeting.';
COMMENT ON FUNCTION public.assign_match_daily_card_schedule(UUID) IS
  'Creates D-6..D-1 daily card schedule after a match has a scheduled meeting time.';
COMMENT ON FUNCTION public.get_match_daily_cards(UUID) IS
  'Returns viewer-group daily cards, hiding content until reveal_at.';
