-- Migration: group member removal + active gender composition.
-- Purpose:
--   - Let a group leader remove a non-leader member from a forming/ready group.
--   - Cancel queue state when group membership changes after ready state.
--   - Calculate male/female/mixed display from active member profiles instead of
--     trusting groups.gender, which cannot represent mixed groups.

CREATE OR REPLACE FUNCTION public.get_group_composition_gender(
  p_group_id UUID
)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH member_gender_counts AS (
    SELECT
      g.gender::TEXT AS fallback_gender,
      COUNT(gm.user_id) FILTER (
        WHERE gm.left_at IS NULL AND p.gender = 'male'
      )::INT AS male_members,
      COUNT(gm.user_id) FILTER (
        WHERE gm.left_at IS NULL AND p.gender = 'female'
      )::INT AS female_members
    FROM public.groups g
    LEFT JOIN public.group_members gm
      ON gm.group_id = g.id
     AND gm.left_at IS NULL
    LEFT JOIN public.profiles p
      ON p.user_id = gm.user_id
    WHERE g.id = p_group_id
    GROUP BY g.id, g.gender
  )
  SELECT
    CASE
      WHEN male_members > 0 AND female_members > 0 THEN 'mixed'
      WHEN male_members > 0 THEN 'male'
      WHEN female_members > 0 THEN 'female'
      ELSE fallback_gender
    END
  FROM member_gender_counts;
$$;

REVOKE ALL ON FUNCTION public.get_group_composition_gender(UUID) FROM PUBLIC;

COMMENT ON FUNCTION public.get_group_composition_gender(UUID) IS
  'Internal helper. Returns male/female/mixed from active group_members + profiles, falling back to groups.gender when profiles are missing.';

CREATE OR REPLACE FUNCTION public.remove_group_member(
  p_group_id UUID,
  p_member_user_id UUID
)
RETURNS TABLE (
  group_id UUID,
  member_user_id UUID,
  left_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group groups%ROWTYPE;
  v_member group_members%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_member_user_id IS NULL THEN
    RAISE EXCEPTION 'member_user_id_required';
  END IF;

  SELECT *
    INTO v_group
    FROM groups AS g
   WHERE g.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id <> v_caller THEN
    RAISE EXCEPTION 'not_group_leader';
  END IF;

  IF p_member_user_id = v_caller THEN
    RAISE EXCEPTION 'cannot_remove_self';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready') THEN
    RAISE EXCEPTION 'group_locked';
  END IF;

  SELECT *
    INTO v_member
    FROM group_members AS gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = p_member_user_id
     AND gm.left_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_active_member';
  END IF;

  PERFORM set_config('app.bypass_group_members_guard', 'on', TRUE);
  UPDATE group_members AS gm
     SET left_at = v_now
   WHERE gm.group_id = p_group_id
     AND gm.user_id = p_member_user_id
     AND gm.left_at IS NULL;
  PERFORM set_config('app.bypass_group_members_guard', 'off', TRUE);

  IF v_group.status = 'ready' THEN
    PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
    UPDATE match_pool AS mp
       SET status = 'cancelled'
     WHERE mp.group_id = p_group_id
       AND mp.status IN ('waiting', 'rolled_over');
    PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);

    PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
    UPDATE groups AS g
       SET status = 'forming'
     WHERE g.id = p_group_id;
    PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);
  END IF;

  RETURN QUERY SELECT p_group_id, p_member_user_id, v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.remove_group_member(UUID, UUID) IS
  'Leader removes a non-leader active member from a forming/ready group; ready group queue state is cancelled.';

CREATE OR REPLACE FUNCTION public.get_match_pool_stats()
RETURNS TABLE (
  gender TEXT,
  group_size INT,
  group_count INT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.get_group_composition_gender(mp.group_id) AS gender,
    g.size::INT AS group_size,
    COUNT(*)::INT AS group_count
  FROM public.match_pool mp
  JOIN public.groups g
    ON g.id = mp.group_id
  WHERE mp.status IN ('waiting', 'rolled_over')
    AND g.size IN (2, 3)
  GROUP BY public.get_group_composition_gender(mp.group_id), g.size
  HAVING public.get_group_composition_gender(mp.group_id) IN ('male', 'female', 'mixed');
$$;

GRANT EXECUTE ON FUNCTION public.get_match_pool_stats() TO anon, authenticated;

COMMENT ON FUNCTION public.get_match_pool_stats() IS
  'Weekly matching pool aggregate stats by group size and active member composition.';

CREATE OR REPLACE FUNCTION public.get_my_matches()
RETURNS TABLE (
  match_id UUID,
  my_group_id UUID,
  opp_group_id UUID,
  opp_group_size INT,
  opp_group_gender TEXT,
  match_status TEXT,
  matched_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  my_confirmed_at TIMESTAMPTZ,
  opp_confirmed_at TIMESTAMPTZ,
  scheduled_start TIMESTAMPTZ,
  venue_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  FOR v_match_id IN
    SELECT m.id FROM matches m
     WHERE m.status = 'confirmed'
       AND m.approval_status = 'approved'
       AND (EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_a_id AND user_id = v_caller AND left_at IS NULL)
         OR EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_b_id AND user_id = v_caller AND left_at IS NULL))
  LOOP
    PERFORM public.lazy_complete_match(v_match_id);
  END LOOP;

  RETURN QUERY
  SELECT
    m.id,
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_a_id ELSE m.group_b_id END,
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_b_id ELSE m.group_a_id END,
    CASE WHEN ga_member.user_id IS NOT NULL THEN gb.size ELSE ga.size END,
    public.get_group_composition_gender(CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_b_id ELSE m.group_a_id END),
    m.status::TEXT,
    m.matched_at,
    m.confirmed_at,
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_a_confirmed_at ELSE m.group_b_confirmed_at END,
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_b_confirmed_at ELSE m.group_a_confirmed_at END,
    mi.scheduled_start,
    mi.venue_name
  FROM matches m
  JOIN groups ga ON ga.id = m.group_a_id
  JOIN groups gb ON gb.id = m.group_b_id
  LEFT JOIN group_members ga_member
    ON ga_member.group_id = m.group_a_id
   AND ga_member.user_id = v_caller
   AND ga_member.left_at IS NULL
  LEFT JOIN group_members gb_member
    ON gb_member.group_id = m.group_b_id
   AND gb_member.user_id = v_caller
   AND gb_member.left_at IS NULL
  LEFT JOIN LATERAL public.get_match_meeting_info(m.id) mi ON TRUE
  WHERE m.approval_status = 'approved'
    AND (ga_member.user_id IS NOT NULL OR gb_member.user_id IS NOT NULL)
  ORDER BY m.matched_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_matches() TO authenticated;

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

  IF v_match.approval_status <> 'approved' AND NOT public.is_admin() THEN
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
    public.get_group_composition_gender(CASE WHEN v_in_a THEN v_match.group_b_id ELSE v_match.group_a_id END),
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

GRANT EXECUTE ON FUNCTION public.get_match_detail(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_notify_match_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ga_size INT;
  v_gb_size INT;
  v_ga_gender TEXT;
  v_gb_gender TEXT;
BEGIN
  SELECT size, public.get_group_composition_gender(NEW.group_a_id)
    INTO v_ga_size, v_ga_gender
    FROM groups
   WHERE id = NEW.group_a_id;

  SELECT size, public.get_group_composition_gender(NEW.group_b_id)
    INTO v_gb_size, v_gb_gender
    FROM groups
   WHERE id = NEW.group_b_id;

  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);

  INSERT INTO notifications (user_id, kind, payload)
  SELECT gm.user_id, 'match_created',
         jsonb_build_object(
           'match_id', NEW.id,
           'opp_group_size', v_gb_size,
           'opp_group_gender', v_gb_gender
         )
    FROM group_members gm
   WHERE gm.group_id = NEW.group_a_id AND gm.left_at IS NULL;

  INSERT INTO notifications (user_id, kind, payload)
  SELECT gm.user_id, 'match_created',
         jsonb_build_object(
           'match_id', NEW.id,
           'opp_group_size', v_ga_size,
           'opp_group_gender', v_ga_gender
         )
    FROM group_members gm
   WHERE gm.group_id = NEW.group_b_id AND gm.left_at IS NULL;

  PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_notify_created ON matches;
CREATE TRIGGER trg_matches_notify_created
  AFTER INSERT ON matches
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_match_created();

CREATE OR REPLACE FUNCTION public.admin_list_pending_matches()
RETURNS TABLE (
  match_id UUID,
  group_a_id UUID,
  group_b_id UUID,
  group_a_gender TEXT,
  group_b_gender TEXT,
  group_a_size INT,
  group_b_size INT,
  score FLOAT,
  score_breakdown JSONB,
  is_forced BOOLEAN,
  matched_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.group_a_id,
    m.group_b_id,
    public.get_group_composition_gender(m.group_a_id),
    public.get_group_composition_gender(m.group_b_id),
    ga.size,
    gb.size,
    m.score,
    m.score_breakdown,
    m.is_forced,
    m.matched_at
  FROM matches m
  JOIN groups ga ON ga.id = m.group_a_id
  JOIN groups gb ON gb.id = m.group_b_id
  WHERE m.approval_status = 'pending_review'
  ORDER BY m.matched_at DESC NULLS LAST, m.score DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_pending_matches() TO authenticated;
