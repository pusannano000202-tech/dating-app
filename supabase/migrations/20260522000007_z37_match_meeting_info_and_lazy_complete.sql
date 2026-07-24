-- Migration: match_meetings 정보 노출 + 자동 완료 (status=completed) lazy 전이
-- Owner:  충현
-- Decision: 매칭 상세에서 약속 시간/장소를 보여줘야 함.
--           또한 confirmed 매칭이 약속 시간 + buffer 만큼 지나면 자동으로 completed 로 전이
--           (review/no-show 흐름의 트리거).
-- Date:   2026-05-22
--
-- 변경:
--   1. lazy_complete_match(p_match_id) 헬퍼:
--        - status='confirmed' AND scheduled_start + COMPLETION_BUFFER_HOURS <= NOW()
--        - → status='completed', completed_at = scheduled_start + buffer
--        - match_meetings 가 없는 환경에서는 NO-OP
--   2. get_my_matches / get_match_detail 재정의 (SHAPE 변경):
--        - 추가 컬럼: scheduled_start, scheduled_end, venue_name, venue_address, venue_map_url
--        - 호출 시 lazy_complete_match 자동 호출 (각 매칭별)
--   3. v1 완료 기준: 약속 시간 + 4시간. v1.1 에서 GPS 출석 기반 정확한 completion 으로 교체.
--
-- 의존: z36 (get_match_scheduled_reveal_at 가 유사 패턴), match_meetings (성준 cross-branch)

CREATE OR REPLACE FUNCTION public.lazy_complete_match(p_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_scheduled_start TIMESTAMPTZ;
  v_completion_at TIMESTAMPTZ;
  -- 약속 시간 + 4 시간 후엔 자동 completed (v1.1 에서 GPS 출석 기반으로 교체)
  v_buffer_hours INT := 4;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_match.status <> 'confirmed' THEN RETURN; END IF;

  IF to_regclass('public.match_meetings') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE
    'SELECT scheduled_start FROM public.match_meetings '
    || 'WHERE match_id = $1 AND status = ''scheduled'' '
    || 'ORDER BY scheduled_start ASC LIMIT 1'
    INTO v_scheduled_start
    USING p_match_id;

  IF v_scheduled_start IS NULL THEN RETURN; END IF;

  v_completion_at := v_scheduled_start + (v_buffer_hours || ' hours')::INTERVAL;
  IF v_completion_at > NOW() THEN RETURN; END IF;

  UPDATE matches
     SET status = 'completed',
         completed_at = v_completion_at
   WHERE id = p_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lazy_complete_match(UUID) TO authenticated;

-- match_meetings 정보 조회 헬퍼 (dynamic SQL 로 cross-branch 안전)
CREATE OR REPLACE FUNCTION public.get_match_meeting_info(p_match_id UUID)
RETURNS TABLE (
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  venue_name TEXT,
  venue_address TEXT,
  venue_map_url TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.match_meetings') IS NULL
     OR to_regclass('public.venues') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE
    'SELECT mm.scheduled_start, mm.scheduled_end, v.name, v.address, v.map_url '
    || 'FROM public.match_meetings mm '
    || 'JOIN public.venues v ON v.id = mm.venue_id '
    || 'WHERE mm.match_id = $1 '
    || '  AND mm.status IN (''scheduled'', ''completed'') '
    || 'ORDER BY mm.scheduled_start ASC LIMIT 1'
    USING p_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_meeting_info(UUID) TO authenticated;

-- get_my_matches / get_match_detail 재정의 (SHAPE 변경이라 DROP-then-CREATE)
DROP FUNCTION IF EXISTS public.get_my_matches();
DROP FUNCTION IF EXISTS public.get_match_detail(UUID);

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

  -- 본인 그룹이 포함된 confirmed 매칭들에 대해 lazy complete 시도
  FOR v_match_id IN
    SELECT m.id FROM matches m
     WHERE m.status = 'confirmed'
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
    CASE WHEN ga_member.user_id IS NOT NULL THEN gb.gender::TEXT ELSE ga.gender::TEXT END,
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
  WHERE ga_member.user_id IS NOT NULL
     OR gb_member.user_id IS NOT NULL
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
  venue_map_url TEXT
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
  v_ga groups%ROWTYPE;
  v_gb groups%ROWTYPE;
  v_mi RECORD;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- 조회 시점에 lazy complete 시도
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

  SELECT * INTO v_ga FROM groups WHERE id = v_match.group_a_id;
  SELECT * INTO v_gb FROM groups WHERE id = v_match.group_b_id;

  SELECT * INTO v_mi FROM public.get_match_meeting_info(p_match_id);

  RETURN QUERY
  SELECT
    v_match.id,
    CASE WHEN v_in_a THEN v_match.group_a_id ELSE v_match.group_b_id END,
    CASE WHEN v_in_a THEN v_match.group_b_id ELSE v_match.group_a_id END,
    CASE WHEN v_in_a THEN v_gb.size ELSE v_ga.size END,
    CASE WHEN v_in_a THEN v_gb.gender::TEXT ELSE v_ga.gender::TEXT END,
    v_match.status::TEXT,
    v_match.matched_at,
    v_match.confirmed_at,
    v_match.completed_at,
    CASE WHEN v_in_a THEN v_match.group_a_confirmed_at ELSE v_match.group_b_confirmed_at END,
    CASE WHEN v_in_a THEN v_match.group_b_confirmed_at ELSE v_match.group_a_confirmed_at END,
    v_mi.scheduled_start,
    v_mi.scheduled_end,
    v_mi.venue_name,
    v_mi.venue_address,
    v_mi.venue_map_url;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_detail(UUID) TO authenticated;

COMMENT ON FUNCTION public.lazy_complete_match(UUID) IS
  '약속 시간 + 4시간 지난 confirmed 매칭을 completed 로 자동 전이. match_meetings 없으면 NO-OP.';
COMMENT ON FUNCTION public.get_match_meeting_info(UUID) IS
  '매칭에 배정된 약속 시간/장소. match_meetings/venues 없으면 빈 결과.';
COMMENT ON FUNCTION public.get_my_matches() IS
  '본인 매칭 목록. 호출 시 confirmed→completed lazy 전이. scheduled_start/venue_name 포함.';
COMMENT ON FUNCTION public.get_match_detail(UUID) IS
  '본인 매칭 상세. 호출 시 lazy complete + venue 정보 노출.';
