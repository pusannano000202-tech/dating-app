-- Migration: 매칭 확정 / 거부 RPC
-- Owner:  충현
-- Decision: 매칭 결과 페이지에서 리더가 확정/거부 가능해야 흐름 완결
-- Date:   2026-05-21
--
-- 동작:
--   confirm_match: 본인 그룹 리더만 호출. matches.status pending → confirmed.
--     양 쪽 모두 confirm 했다는 추적은 별도 컬럼이 없으므로 일단 단순 set.
--     (양방향 confirm 추적은 후속 컬럼 추가 후)
--   cancel_match: 본인 그룹 리더만 호출. status → cancelled.
--     양 그룹의 match_pool entry 를 다시 status='waiting' 으로 복귀 (의지가 있다면 next batch 에서 재매칭)
--     본 세션에서는 단순 cancelled 만 set. 큐 복귀는 별도 의사 결정 트랙.

CREATE OR REPLACE FUNCTION public.confirm_match(
  p_match_id UUID
)
RETURNS TABLE (
  match_id UUID,
  status TEXT,
  confirmed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_is_leader BOOLEAN;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM groups g
     WHERE (g.id = v_match.group_a_id OR g.id = v_match.group_b_id)
       AND g.leader_user_id = v_caller
  ) INTO v_is_leader;

  IF NOT v_is_leader THEN
    RAISE EXCEPTION 'not_match_leader';
  END IF;

  IF v_match.status <> 'pending' THEN
    RAISE EXCEPTION 'match_not_pending';
  END IF;

  UPDATE matches
     SET status = 'confirmed',
         confirmed_at = v_now
   WHERE id = p_match_id;

  RETURN QUERY SELECT p_match_id, 'confirmed'::TEXT, v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_match(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_match(
  p_match_id UUID
)
RETURNS TABLE (
  match_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_is_leader BOOLEAN;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM groups g
     WHERE (g.id = v_match.group_a_id OR g.id = v_match.group_b_id)
       AND g.leader_user_id = v_caller
  ) INTO v_is_leader;

  IF NOT v_is_leader THEN
    RAISE EXCEPTION 'not_match_leader';
  END IF;

  IF v_match.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'match_not_cancelable';
  END IF;

  UPDATE matches
     SET status = 'cancelled'
   WHERE id = p_match_id;

  RETURN QUERY SELECT p_match_id, 'cancelled'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_match(UUID) TO authenticated;

COMMENT ON FUNCTION public.confirm_match(UUID) IS
  '매칭된 그룹의 리더가 매칭 확정. matches.status pending -> confirmed.';
COMMENT ON FUNCTION public.cancel_match(UUID) IS
  '매칭된 그룹의 리더가 매칭 거부/취소. matches.status -> cancelled.';
