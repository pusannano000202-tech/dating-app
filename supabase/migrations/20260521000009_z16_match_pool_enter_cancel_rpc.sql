-- Migration: 매칭 큐 진입 / 취소 RPC
-- Owner:  충현
-- Decision: MASTER_PLAN_V1_6 Task E follow-up (queue entry route)
-- Date:   2026-05-21
--
-- 배경:
--   - 기존 /group/create 버튼이 setError 메시지만 출력 → 실제 match_pool 미진입
--   - match_pool INSERT RLS 정책(z12)은 활성 멤버 + status='waiting' + batch_id=NULL 검증
--   - groups.status 'forming' -> 'ready' 전환은 leader 정책으로 제한
--
-- 설계:
--   1) enter_match_pool(p_group_id): leader 만 호출. 활성 멤버 >= 2 확인,
--      groups.status='ready' 로 전환, match_pool waiting insert
--   2) cancel_match_pool(p_group_id): leader 만 호출. waiting/rolled_over -> cancelled
--      + groups.status='ready' -> 'forming' 복귀
--
-- 보증금:
--   - 현재 토스페이먼츠 통합 미완. 본 RPC 는 큐 진입만 담당.
--   - 보증금 paid 검증은 추후 RPC 안에 EXISTS deposits paid 검사 추가 예정.
--   - master plan v1.6 에 task 로 명시.

CREATE OR REPLACE FUNCTION public.enter_match_pool(
  p_group_id UUID
)
RETURNS TABLE (
  pool_id UUID,
  group_id UUID,
  group_status TEXT,
  pool_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group groups%ROWTYPE;
  v_active_count INT;
  v_existing UUID;
  v_pool_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_group
    FROM groups
   WHERE id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id <> v_caller THEN
    RAISE EXCEPTION 'not_group_leader';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready') THEN
    RAISE EXCEPTION 'group_not_open';
  END IF;

  SELECT id
    INTO v_existing
    FROM match_pool
   WHERE group_id = p_group_id
     AND status IN ('waiting', 'rolled_over')
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'already_in_queue';
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM group_members
   WHERE group_id = p_group_id
     AND left_at IS NULL;

  IF v_active_count < 2 THEN
    RAISE EXCEPTION 'not_enough_members';
  END IF;

  IF v_active_count > v_group.size THEN
    RAISE EXCEPTION 'group_overflow';
  END IF;

  IF v_group.status = 'forming' THEN
    UPDATE groups
       SET status = 'ready'
     WHERE id = p_group_id;
  END IF;

  INSERT INTO match_pool (group_id, status, rollover_count, batch_id)
  VALUES (p_group_id, 'waiting', 0, NULL)
  RETURNING id INTO v_pool_id;

  RETURN QUERY
  SELECT v_pool_id, p_group_id, 'ready'::TEXT, 'waiting'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enter_match_pool(UUID) TO authenticated;

COMMENT ON FUNCTION public.enter_match_pool(UUID) IS
  '리더가 호출. 활성 멤버 >= 2 확인 후 groups.status=ready + match_pool waiting insert.';

CREATE OR REPLACE FUNCTION public.cancel_match_pool(
  p_group_id UUID
)
RETURNS TABLE (
  group_id UUID,
  group_status TEXT,
  pool_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_group groups%ROWTYPE;
  v_updated INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_group
    FROM groups
   WHERE id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.leader_user_id <> v_caller THEN
    RAISE EXCEPTION 'not_group_leader';
  END IF;

  UPDATE match_pool
     SET status = 'cancelled'
   WHERE match_pool.group_id = p_group_id
     AND status IN ('waiting', 'rolled_over');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'not_in_queue';
  END IF;

  IF v_group.status = 'ready' THEN
    UPDATE groups
       SET status = 'forming'
     WHERE id = p_group_id;
  END IF;

  RETURN QUERY
  SELECT p_group_id, 'forming'::TEXT, 'cancelled'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_match_pool(UUID) TO authenticated;

COMMENT ON FUNCTION public.cancel_match_pool(UUID) IS
  '리더가 호출. match_pool waiting/rolled_over -> cancelled + groups.status ready -> forming.';
