-- Migration: 본인 그룹이 포함된 매칭 결과 + 상대 그룹 요약 RPC
-- Owner:  충현
-- Decision: 매칭 결과 페이지 (/match) UI 자리 마련. Task F (Python 헝가리안)
--           가 matches row 채우면 본 RPC 가 client 노출 가능.
-- Date:   2026-05-21
--
-- 노출 범위:
--   - 호출자가 active 멤버인 그룹의 매칭만 반환
--   - 상대 그룹의 size / gender / 매칭 시각 / 매칭 상태 만 노출
--   - score / score_breakdown 같은 매칭 엔진 내부값은 노출 안 함
--   - matches.batch_id / is_forced 같은 운영 메타도 미노출

CREATE OR REPLACE FUNCTION public.get_my_matches()
RETURNS TABLE (
  match_id UUID,
  my_group_id UUID,
  opp_group_id UUID,
  opp_group_size INT,
  opp_group_gender TEXT,
  match_status TEXT,
  matched_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    CASE
      WHEN ga_member.user_id IS NOT NULL THEN m.group_a_id
      ELSE m.group_b_id
    END,
    CASE
      WHEN ga_member.user_id IS NOT NULL THEN m.group_b_id
      ELSE m.group_a_id
    END,
    CASE
      WHEN ga_member.user_id IS NOT NULL THEN gb.size
      ELSE ga.size
    END,
    CASE
      WHEN ga_member.user_id IS NOT NULL THEN gb.gender::TEXT
      ELSE ga.gender::TEXT
    END,
    m.status::TEXT,
    m.matched_at,
    m.confirmed_at
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
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_in_a BOOLEAN;
  v_in_b BOOLEAN;
  v_ga groups%ROWTYPE;
  v_gb groups%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

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
    v_match.completed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_detail(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_my_matches() IS
  '본인 그룹이 포함된 매칭 목록. score/breakdown/batch_id 미노출.';
COMMENT ON FUNCTION public.get_match_detail(UUID) IS
  '본인 매칭 상세. 참여자만 호출 가능. raw 매칭 엔진 메타 미노출.';
