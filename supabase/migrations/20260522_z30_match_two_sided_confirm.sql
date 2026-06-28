-- Migration: 양방향 match confirm 추적
-- Owner:  충현
-- Decision: 한 쪽 리더 confirm 만으로 status='confirmed' 가 되면 상대 그룹이 거절했을 때
--           이미 confirmed 상태로 잘못 노출됨. 양쪽 모두 confirm 해야 confirmed 전이.
-- Date:   2026-05-22
--
-- 변경:
--   1. matches 테이블에 group_a_confirmed_at, group_b_confirmed_at TIMESTAMPTZ NULL 추가
--   2. confirm_match RPC 재정의:
--        - 리더가 속한 측 (a/b) 의 _confirmed_at 만 set
--        - 양쪽 모두 set 되면 status='confirmed', confirmed_at=NOW()
--        - 한쪽만 set 된 상태는 status='pending' 유지
--   3. 기존 confirmed 데이터 backfill: confirmed_at 으로 양쪽 모두 채움
--      (양방향 confirm 추적 이전이라 양쪽 동의로 간주)

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS group_a_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS group_b_confirmed_at TIMESTAMPTZ;

-- Backfill: 기존 confirmed/completed 매칭은 양쪽 동의로 간주
UPDATE matches
   SET group_a_confirmed_at = COALESCE(group_a_confirmed_at, confirmed_at),
       group_b_confirmed_at = COALESCE(group_b_confirmed_at, confirmed_at)
 WHERE status IN ('confirmed', 'completed')
   AND confirmed_at IS NOT NULL;

COMMENT ON COLUMN matches.group_a_confirmed_at IS
  'group_a 리더가 매칭 확정 누른 시각. NULL = 아직 확정 안 함.';
COMMENT ON COLUMN matches.group_b_confirmed_at IS
  'group_b 리더가 매칭 확정 누른 시각. NULL = 아직 확정 안 함.';

-- confirm_match 재정의: 양방향 추적
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
  v_side TEXT;  -- 'a' or 'b'
  v_now TIMESTAMPTZ := NOW();
  v_a_at TIMESTAMPTZ;
  v_b_at TIMESTAMPTZ;
  v_new_status TEXT;
  v_new_confirmed_at TIMESTAMPTZ;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- 호출자가 어느 쪽 리더인지 판정
  IF EXISTS (SELECT 1 FROM groups g WHERE g.id = v_match.group_a_id AND g.leader_user_id = v_caller) THEN
    v_side := 'a';
  ELSIF EXISTS (SELECT 1 FROM groups g WHERE g.id = v_match.group_b_id AND g.leader_user_id = v_caller) THEN
    v_side := 'b';
  ELSE
    RAISE EXCEPTION 'not_match_leader';
  END IF;

  IF v_match.status <> 'pending' THEN
    RAISE EXCEPTION 'match_not_pending';
  END IF;

  -- 해당 측이 이미 확정한 상태면 멱등 처리 (재호출해도 변경 없음)
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

  -- 양쪽 모두 set 되면 confirmed 전이
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

GRANT EXECUTE ON FUNCTION public.confirm_match(UUID) TO authenticated;

COMMENT ON FUNCTION public.confirm_match(UUID) IS
  '매칭된 그룹의 리더가 매칭 확정. 양쪽 리더 모두 호출해야 status->confirmed.';

-- get_my_matches / get_match_detail 도 my/opp confirmed_at 컬럼 노출하도록 갱신
-- RETURN TABLE 시그니처 변경이라 DROP 후 CREATE
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
  opp_confirmed_at TIMESTAMPTZ
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
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_a_id ELSE m.group_b_id END,
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_b_id ELSE m.group_a_id END,
    CASE WHEN ga_member.user_id IS NOT NULL THEN gb.size ELSE ga.size END,
    CASE WHEN ga_member.user_id IS NOT NULL THEN gb.gender::TEXT ELSE ga.gender::TEXT END,
    m.status::TEXT,
    m.matched_at,
    m.confirmed_at,
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_a_confirmed_at ELSE m.group_b_confirmed_at END,
    CASE WHEN ga_member.user_id IS NOT NULL THEN m.group_b_confirmed_at ELSE m.group_a_confirmed_at END
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
  completed_at TIMESTAMPTZ,
  my_confirmed_at TIMESTAMPTZ,
  opp_confirmed_at TIMESTAMPTZ
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
    v_match.completed_at,
    CASE WHEN v_in_a THEN v_match.group_a_confirmed_at ELSE v_match.group_b_confirmed_at END,
    CASE WHEN v_in_a THEN v_match.group_b_confirmed_at ELSE v_match.group_a_confirmed_at END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_detail(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_my_matches() IS
  '본인 그룹이 포함된 매칭 목록. my/opp_confirmed_at 으로 양방향 확정 상태 추적.';
COMMENT ON FUNCTION public.get_match_detail(UUID) IS
  '본인 매칭 상세. my/opp_confirmed_at 으로 양방향 확정 상태 추적.';
