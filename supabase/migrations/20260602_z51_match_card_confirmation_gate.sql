-- Migration: require match cards and deposits before leader confirmation.
-- Date: 2026-06-02

CREATE TABLE IF NOT EXISTS public.match_card_submissions (
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_text TEXT NOT NULL CHECK (char_length(btrim(content_text)) BETWEEN 10 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, user_id),
  UNIQUE (match_id, group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_card_submissions_group
  ON public.match_card_submissions(match_id, group_id);

ALTER TABLE public.match_card_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_card_submissions_select_participants
  ON public.match_card_submissions;
DROP POLICY IF EXISTS match_card_submissions_insert_self
  ON public.match_card_submissions;
DROP POLICY IF EXISTS match_card_submissions_update_self
  ON public.match_card_submissions;

CREATE POLICY match_card_submissions_select_participants
  ON public.match_card_submissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.matches m
        JOIN public.group_members gm
          ON gm.group_id IN (m.group_a_id, m.group_b_id)
       WHERE m.id = match_card_submissions.match_id
         AND gm.user_id = auth.uid()
         AND gm.left_at IS NULL
    )
  );

CREATE POLICY match_card_submissions_insert_self
  ON public.match_card_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.matches m
        JOIN public.group_members gm
          ON gm.group_id = match_card_submissions.group_id
       WHERE m.id = match_card_submissions.match_id
         AND match_card_submissions.group_id IN (m.group_a_id, m.group_b_id)
         AND gm.user_id = auth.uid()
         AND gm.left_at IS NULL
    )
  );

CREATE POLICY match_card_submissions_update_self
  ON public.match_card_submissions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.matches m
        JOIN public.group_members gm
          ON gm.group_id = match_card_submissions.group_id
       WHERE m.id = match_card_submissions.match_id
         AND match_card_submissions.group_id IN (m.group_a_id, m.group_b_id)
         AND gm.user_id = auth.uid()
         AND gm.left_at IS NULL
    )
  );

CREATE OR REPLACE FUNCTION public.touch_match_card_submission_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_card_submissions_touch_updated_at
  ON public.match_card_submissions;

CREATE TRIGGER trg_match_card_submissions_touch_updated_at
  BEFORE UPDATE ON public.match_card_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_match_card_submission_updated_at();

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

DROP FUNCTION IF EXISTS public.get_match_detail(UUID);

CREATE OR REPLACE FUNCTION public.get_match_detail(
  p_match_id UUID
)
RETURNS TABLE (
  match_id UUID,
  my_group_id UUID,
  opp_group_id UUID,
  opp_group_size INT,
  opp_group_gender TEXT,
  match_status TEXT,
  matched_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  my_confirmed_at TIMESTAMPTZ,
  opp_confirmed_at TIMESTAMPTZ,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  venue_name TEXT,
  venue_address TEXT,
  venue_map_url TEXT,
  my_card_submitted_at TIMESTAMPTZ,
  my_card_content_text TEXT,
  my_group_active_count INT,
  my_group_card_submitted_count INT,
  my_group_deposit_paid_count INT,
  my_group_ready BOOLEAN,
  opp_group_active_count INT,
  opp_group_card_submitted_count INT,
  opp_group_deposit_paid_count INT,
  opp_group_ready BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_in_a BOOLEAN;
  v_in_b BOOLEAN;
  v_my_group_id UUID;
  v_opp_group_id UUID;
  v_ga groups%ROWTYPE;
  v_gb groups%ROWTYPE;
  v_scheduled_start TIMESTAMPTZ;
  v_scheduled_end TIMESTAMPTZ;
  v_venue_name TEXT;
  v_venue_address TEXT;
  v_venue_map_url TEXT;
  v_my_active_count INT;
  v_my_card_count INT;
  v_my_deposit_count INT;
  v_opp_active_count INT;
  v_opp_card_count INT;
  v_opp_deposit_count INT;
  v_my_card_submitted_at TIMESTAMPTZ;
  v_my_card_content_text TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM public.lazy_complete_match(p_match_id);

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id = v_match.group_a_id
       AND user_id = v_caller
       AND left_at IS NULL
  ) INTO v_in_a;

  SELECT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id = v_match.group_b_id
       AND user_id = v_caller
       AND left_at IS NULL
  ) INTO v_in_b;

  IF NOT v_in_a AND NOT v_in_b THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  v_my_group_id := CASE WHEN v_in_a THEN v_match.group_a_id ELSE v_match.group_b_id END;
  v_opp_group_id := CASE WHEN v_in_a THEN v_match.group_b_id ELSE v_match.group_a_id END;

  SELECT * INTO v_ga FROM groups WHERE id = v_match.group_a_id;
  SELECT * INTO v_gb FROM groups WHERE id = v_match.group_b_id;
  SELECT
    mi.scheduled_start,
    mi.scheduled_end,
    mi.venue_name,
    mi.venue_address,
    mi.venue_map_url
    INTO
    v_scheduled_start,
    v_scheduled_end,
    v_venue_name,
    v_venue_address,
    v_venue_map_url
    FROM public.get_match_meeting_info(p_match_id) mi;

  SELECT COUNT(*) INTO v_my_active_count
    FROM group_members
   WHERE group_id = v_my_group_id
     AND left_at IS NULL;

  SELECT COUNT(*) INTO v_opp_active_count
    FROM group_members
   WHERE group_id = v_opp_group_id
     AND left_at IS NULL;

  SELECT COUNT(DISTINCT mcs.user_id) INTO v_my_card_count
    FROM match_card_submissions mcs
    JOIN group_members gm
      ON gm.group_id = v_my_group_id
     AND gm.user_id = mcs.user_id
     AND gm.left_at IS NULL
   WHERE mcs.match_id = p_match_id
     AND mcs.group_id = v_my_group_id;

  SELECT COUNT(DISTINCT mcs.user_id) INTO v_opp_card_count
    FROM match_card_submissions mcs
    JOIN group_members gm
      ON gm.group_id = v_opp_group_id
     AND gm.user_id = mcs.user_id
     AND gm.left_at IS NULL
   WHERE mcs.match_id = p_match_id
     AND mcs.group_id = v_opp_group_id;

  SELECT COUNT(DISTINCT d.user_id) INTO v_my_deposit_count
    FROM deposits d
    JOIN group_members gm
      ON gm.group_id = v_my_group_id
     AND gm.user_id = d.user_id
     AND gm.left_at IS NULL
   WHERE d.group_id = v_my_group_id
     AND d.status IN ('paid', 'held');

  SELECT COUNT(DISTINCT d.user_id) INTO v_opp_deposit_count
    FROM deposits d
    JOIN group_members gm
      ON gm.group_id = v_opp_group_id
     AND gm.user_id = d.user_id
     AND gm.left_at IS NULL
   WHERE d.group_id = v_opp_group_id
     AND d.status IN ('paid', 'held');

  SELECT mcs.updated_at, mcs.content_text
    INTO v_my_card_submitted_at, v_my_card_content_text
    FROM match_card_submissions mcs
   WHERE mcs.match_id = p_match_id
     AND mcs.user_id = v_caller;

  RETURN QUERY
  SELECT
    v_match.id,
    v_my_group_id,
    v_opp_group_id,
    CASE WHEN v_in_a THEN v_gb.size ELSE v_ga.size END,
    CASE WHEN v_in_a THEN v_gb.gender::TEXT ELSE v_ga.gender::TEXT END,
    v_match.status::TEXT,
    v_match.matched_at,
    v_match.confirmed_at,
    v_match.completed_at,
    CASE WHEN v_in_a THEN v_match.group_a_confirmed_at ELSE v_match.group_b_confirmed_at END,
    CASE WHEN v_in_a THEN v_match.group_b_confirmed_at ELSE v_match.group_a_confirmed_at END,
    v_scheduled_start,
    v_scheduled_end,
    v_venue_name,
    v_venue_address,
    v_venue_map_url,
    v_my_card_submitted_at,
    v_my_card_content_text,
    v_my_active_count,
    v_my_card_count,
    v_my_deposit_count,
    v_my_active_count > 0
      AND v_my_card_count >= v_my_active_count
      AND v_my_deposit_count >= v_my_active_count,
    v_opp_active_count,
    v_opp_card_count,
    v_opp_deposit_count,
    v_opp_active_count > 0
      AND v_opp_card_count >= v_opp_active_count
      AND v_opp_deposit_count >= v_opp_active_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_detail(UUID) TO authenticated;

COMMENT ON TABLE public.match_card_submissions IS
  'User-written card content created after a provisional match and before deposit-backed confirmation.';
COMMENT ON FUNCTION public.confirm_match(UUID) IS
  'Leader confirmation. Caller group must have all active members submit match cards and paid/held deposits.';
COMMENT ON FUNCTION public.get_match_detail(UUID) IS
  'Match detail with post-provisional card/deposit readiness for confirmation gating.';
