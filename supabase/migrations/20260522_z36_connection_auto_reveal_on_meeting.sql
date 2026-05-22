-- Migration: 약속 시간 도달 시 핸드폰 자동 공개 (z35 양방향 동의 모델 폐기)
-- Owner:  충현
-- Decision (8-18): 우리가 시간/장소를 자동 배정해도 늦거나 못 만날 수 있다.
--                  비상연락을 위해 약속 시간이 되면 양쪽 그룹 멤버의 phone 을 자동 공개한다.
--                  더 이상 사용자 양방향 동의를 요구하지 않는다.
-- Date:   2026-05-22
--
-- 변경:
--   1. agree_connection / cancel_connection RPC 제거 (정책 폐기)
--   2. get_match_connections(match_id) 재정의:
--        - 매칭 status IN ('confirmed', 'completed') AND match_meetings.scheduled_start <= NOW()
--          → connections row 를 lazy upsert + contact_revealed_at 자동 set
--        - 그 외엔 phone NULL, reveal_at = match_meetings.scheduled_start (있다면)
--   3. 양방향 동의 컬럼(connections.a_agreed, b_agreed)은 유지하지만 정책상 무시
--      (legacy 데이터 보존, v1.1 에서 컬럼 자체 drop 가능)
--   4. RPC 결과 시그니처 변경:
--        BEFORE  (target_user_id, target_display_name, caller_agreed, opp_agreed, contact_revealed_at, target_phone)
--        AFTER   (target_user_id, target_display_name, contact_revealed_at, scheduled_reveal_at, target_phone)
--
-- 의존: z22 set_config 패턴, z35 (connections 테이블 + bypass guard policy)
-- 호환: match_meetings 는 성준 브랜치 (matching/group-engine) 에서 추가됨.
--       이 마이그가 fresh DB 에 단독 적용되어도 동작하도록 dynamic SQL 로 우회.
--       성준 마이그 머지 후엔 자동으로 활성화.

-- 1) 폐기되는 RPC 제거 (시그니처 변경이라 DROP 먼저)
DROP FUNCTION IF EXISTS public.agree_connection(UUID, UUID);
DROP FUNCTION IF EXISTS public.cancel_connection(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_match_connections(UUID);

-- 2) 자동 reveal 헬퍼: 약속 시간이 지났는지 판정
--    match_meetings 가 없는 환경(현재 본 브랜치 fresh DB)에서는 NULL 반환.
--    성준의 venues/match_meetings 마이그가 머지되면 자동으로 활성화.
CREATE OR REPLACE FUNCTION public.get_match_scheduled_reveal_at(p_match_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result TIMESTAMPTZ;
BEGIN
  IF to_regclass('public.match_meetings') IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE
    'SELECT scheduled_start FROM public.match_meetings '
    || 'WHERE match_id = $1 AND status IN (''scheduled'', ''completed'') '
    || 'ORDER BY scheduled_start ASC LIMIT 1'
    INTO v_result
    USING p_match_id;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_scheduled_reveal_at(UUID) TO authenticated;

-- 3) get_match_connections: 약속 시간 도달 시 자동 공개
--    매칭 status='confirmed' 부터 (대기 단계에서도 비상연락 가능하게)
--    + 약속 시간 도달 후엔 phone 노출
CREATE OR REPLACE FUNCTION public.get_match_connections(
  p_match_id UUID
)
RETURNS TABLE (
  target_user_id UUID,
  target_display_name TEXT,
  contact_revealed_at TIMESTAMPTZ,
  scheduled_reveal_at TIMESTAMPTZ,
  target_phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_caller_in_a BOOLEAN;
  v_caller_in_b BOOLEAN;
  v_caller_group_id UUID;
  v_opp_group_id UUID;
  v_scheduled_at TIMESTAMPTZ;
  v_should_reveal BOOLEAN;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.status NOT IN ('confirmed', 'completed') THEN
    RETURN;  -- pending / cancelled 매칭은 빈 결과
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id = v_match.group_a_id AND user_id = v_caller AND left_at IS NULL
  ) INTO v_caller_in_a;
  SELECT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id = v_match.group_b_id AND user_id = v_caller AND left_at IS NULL
  ) INTO v_caller_in_b;
  IF NOT v_caller_in_a AND NOT v_caller_in_b THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  v_caller_group_id := CASE WHEN v_caller_in_a THEN v_match.group_a_id ELSE v_match.group_b_id END;
  v_opp_group_id    := CASE WHEN v_caller_in_a THEN v_match.group_b_id ELSE v_match.group_a_id END;

  v_scheduled_at := public.get_match_scheduled_reveal_at(p_match_id);
  v_should_reveal := (v_scheduled_at IS NOT NULL AND v_scheduled_at <= v_now);

  -- 4) 자동 reveal: 약속 시간이 지났으면 양쪽 그룹의 모든 페어에 대해
  --    connections row 를 upsert 하면서 contact_revealed_at 을 set
  IF v_should_reveal THEN
    PERFORM set_config('app.bypass_connections_guard', 'on', TRUE);

    INSERT INTO connections (match_id, user_a_id, user_b_id, a_agreed, b_agreed, contact_revealed_at)
    SELECT
      p_match_id,
      LEAST(ma.user_id, mb.user_id),
      GREATEST(ma.user_id, mb.user_id),
      TRUE,
      TRUE,
      v_scheduled_at
    FROM group_members ma
    JOIN group_members mb
      ON mb.group_id = v_opp_group_id
     AND mb.left_at IS NULL
     AND mb.user_id <> ma.user_id
    WHERE ma.group_id = v_caller_group_id
      AND ma.left_at IS NULL
    ON CONFLICT (match_id, user_a_id, user_b_id) DO UPDATE
      SET contact_revealed_at = COALESCE(connections.contact_revealed_at, EXCLUDED.contact_revealed_at),
          a_agreed = TRUE,
          b_agreed = TRUE;

    PERFORM set_config('app.bypass_connections_guard', 'off', TRUE);
  END IF;

  RETURN QUERY
  SELECT
    gm.user_id AS target_user_id,
    p.display_name AS target_display_name,
    c.contact_revealed_at,
    v_scheduled_at AS scheduled_reveal_at,
    CASE WHEN c.contact_revealed_at IS NOT NULL AND c.contact_revealed_at <= v_now
         THEN u.phone
         ELSE NULL
    END AS target_phone
  FROM group_members gm
  JOIN public.users u ON u.id = gm.user_id
  LEFT JOIN profiles p ON p.user_id = gm.user_id
  LEFT JOIN connections c ON c.match_id = p_match_id
                          AND c.user_a_id = LEAST(v_caller, gm.user_id)
                          AND c.user_b_id = GREATEST(v_caller, gm.user_id)
  WHERE gm.group_id = v_opp_group_id
    AND gm.left_at IS NULL
    AND gm.user_id <> v_caller
  ORDER BY p.display_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_connections(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_match_connections(UUID) IS
  '매칭된 상대 그룹 멤버 목록 + 약속 시간 도달 시 phone 자동 공개. status=confirmed/completed 한정.';
COMMENT ON FUNCTION public.get_match_scheduled_reveal_at(UUID) IS
  '매칭에 배정된 약속 시간(match_meetings.scheduled_start) 반환. match_meetings 없으면 NULL.';
COMMENT ON COLUMN connections.a_agreed IS
  '[deprecated z36] 자동공개 정책으로 의미 사라짐. 자동공개 시점에 TRUE set. v1.1 drop 가능.';
COMMENT ON COLUMN connections.b_agreed IS
  '[deprecated z36] 자동공개 정책으로 의미 사라짐. 자동공개 시점에 TRUE set. v1.1 drop 가능.';
