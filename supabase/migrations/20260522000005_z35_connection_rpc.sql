-- Migration: 만남 후 1:1 연결 동의 RPC
-- Owner:  충현
-- Decision: completed 매칭에 한해 양쪽이 서로 동의하면 연락처 공개. 동의 RPC + 조회 RPC.
-- Date:   2026-05-22
--
-- RPC:
--   1. agree_connection(p_match_id, p_target_user_id)
--        - 본인 + 상대 모두 해당 매칭의 active 참여자여야 함
--        - 매칭은 'completed' 여야 함
--        - 정규화 (user_a < user_b) 후 connection row UPSERT
--        - 본인 측 agreed = TRUE 설정
--        - 양쪽 agreed = TRUE 가 되면 contact_revealed_at = NOW() 자동 set
--   2. cancel_connection(p_match_id, p_target_user_id)
--        - 본인 측 agreed = FALSE 로 되돌림
--        - contact_revealed_at 은 한번 set 되면 유지 (이미 공유된 연락처 부정)
--          - 정책: 양쪽 동의 후 cancel 은 status='revoked' 같은 별도 컬럼이 필요 → v1.1
--          - v1 에서는 contact_revealed_at IS NULL 일 때만 cancel 허용
--   3. get_match_connections(p_match_id)
--        - 본인 참여 매칭의 모든 connection rows + 상대 display_name + 본인/상대 동의 상태
--        - completed 가 아닌 매칭은 빈 배열 반환
--
-- 의존: z22 set_config 패턴, profiles.display_name (z18)

-- connections INSERT/UPDATE 정책에 bypass guard 통일
DROP POLICY IF EXISTS "connections_self" ON connections;

CREATE POLICY "connections_self" ON connections
  FOR ALL TO authenticated
  USING (
    current_setting('app.bypass_connections_guard', TRUE) = 'on'
    OR user_a_id = auth.uid()
    OR user_b_id = auth.uid()
  )
  WITH CHECK (
    current_setting('app.bypass_connections_guard', TRUE) = 'on'
    OR user_a_id = auth.uid()
    OR user_b_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.agree_connection(
  p_match_id UUID,
  p_target_user_id UUID
)
RETURNS TABLE (
  connection_id UUID,
  match_id UUID,
  user_a_id UUID,
  user_b_id UUID,
  a_agreed BOOLEAN,
  b_agreed BOOLEAN,
  contact_revealed_at TIMESTAMPTZ
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
  v_target_in_a BOOLEAN;
  v_target_in_b BOOLEAN;
  v_a UUID;
  v_b UUID;
  v_caller_is_a BOOLEAN;
  v_row connections%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_caller THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.status <> 'completed' THEN
    RAISE EXCEPTION 'match_not_completed';
  END IF;

  -- 본인이 어느 그룹에 속하는지
  SELECT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id = v_match.group_a_id AND user_id = v_caller AND left_at IS NULL
  ) INTO v_caller_in_a;
  SELECT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id = v_match.group_b_id AND user_id = v_caller AND left_at IS NULL
  ) INTO v_caller_in_b;
  IF NOT v_caller_in_a AND NOT v_caller_in_b THEN
    RAISE EXCEPTION 'caller_not_match_participant';
  END IF;

  -- 상대는 반드시 본인 반대 그룹의 active 멤버
  IF v_caller_in_a THEN
    SELECT EXISTS (
      SELECT 1 FROM group_members
       WHERE group_id = v_match.group_b_id AND user_id = p_target_user_id AND left_at IS NULL
    ) INTO v_target_in_b;
    IF NOT v_target_in_b THEN RAISE EXCEPTION 'target_not_opp_member'; END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM group_members
       WHERE group_id = v_match.group_a_id AND user_id = p_target_user_id AND left_at IS NULL
    ) INTO v_target_in_a;
    IF NOT v_target_in_a THEN RAISE EXCEPTION 'target_not_opp_member'; END IF;
  END IF;

  -- 정규화 (user_a_id < user_b_id)
  IF v_caller < p_target_user_id THEN
    v_a := v_caller; v_b := p_target_user_id; v_caller_is_a := TRUE;
  ELSE
    v_a := p_target_user_id; v_b := v_caller; v_caller_is_a := FALSE;
  END IF;

  PERFORM set_config('app.bypass_connections_guard', 'on', TRUE);

  INSERT INTO connections (match_id, user_a_id, user_b_id, a_agreed, b_agreed)
  VALUES (
    p_match_id, v_a, v_b,
    CASE WHEN v_caller_is_a THEN TRUE ELSE FALSE END,
    CASE WHEN v_caller_is_a THEN FALSE ELSE TRUE END
  )
  ON CONFLICT (match_id, user_a_id, user_b_id) DO UPDATE
    SET a_agreed = connections.a_agreed OR (v_caller_is_a),
        b_agreed = connections.b_agreed OR (NOT v_caller_is_a)
  RETURNING * INTO v_row;

  -- 양쪽 동의 + revealed_at NULL → 지금 set
  IF v_row.a_agreed AND v_row.b_agreed AND v_row.contact_revealed_at IS NULL THEN
    UPDATE connections
       SET contact_revealed_at = NOW()
     WHERE id = v_row.id
     RETURNING * INTO v_row;
  END IF;

  PERFORM set_config('app.bypass_connections_guard', 'off', TRUE);

  RETURN QUERY SELECT
    v_row.id, v_row.match_id, v_row.user_a_id, v_row.user_b_id,
    v_row.a_agreed, v_row.b_agreed, v_row.contact_revealed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agree_connection(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_connection(
  p_match_id UUID,
  p_target_user_id UUID
)
RETURNS TABLE (
  connection_id UUID,
  a_agreed BOOLEAN,
  b_agreed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_a UUID;
  v_b UUID;
  v_caller_is_a BOOLEAN;
  v_row connections%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_caller THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  IF v_caller < p_target_user_id THEN
    v_a := v_caller; v_b := p_target_user_id; v_caller_is_a := TRUE;
  ELSE
    v_a := p_target_user_id; v_b := v_caller; v_caller_is_a := FALSE;
  END IF;

  SELECT * INTO v_row FROM connections
   WHERE match_id = p_match_id AND user_a_id = v_a AND user_b_id = v_b
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection_not_found';
  END IF;

  IF v_row.contact_revealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_revealed';
  END IF;

  PERFORM set_config('app.bypass_connections_guard', 'on', TRUE);
  UPDATE connections
     SET a_agreed = CASE WHEN v_caller_is_a THEN FALSE ELSE a_agreed END,
         b_agreed = CASE WHEN v_caller_is_a THEN b_agreed ELSE FALSE END
   WHERE id = v_row.id
   RETURNING * INTO v_row;
  PERFORM set_config('app.bypass_connections_guard', 'off', TRUE);

  RETURN QUERY SELECT v_row.id, v_row.a_agreed, v_row.b_agreed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_connection(UUID, UUID) TO authenticated;

-- 매칭 상세에서 1:1 연결 후보 + 본인/상대 동의 상태 + 본인 동의 여부 노출
CREATE OR REPLACE FUNCTION public.get_match_connections(
  p_match_id UUID
)
RETURNS TABLE (
  target_user_id UUID,
  target_display_name TEXT,
  caller_agreed BOOLEAN,
  opp_agreed BOOLEAN,
  contact_revealed_at TIMESTAMPTZ,
  target_phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_caller_in_a BOOLEAN;
  v_caller_in_b BOOLEAN;
  v_opp_group_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.status <> 'completed' THEN
    RETURN;  -- completed 가 아니면 빈 결과
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

  v_opp_group_id := CASE WHEN v_caller_in_a THEN v_match.group_b_id ELSE v_match.group_a_id END;

  RETURN QUERY
  SELECT
    gm.user_id AS target_user_id,
    p.display_name AS target_display_name,
    COALESCE(
      CASE
        WHEN c.user_a_id = v_caller THEN c.a_agreed
        WHEN c.user_b_id = v_caller THEN c.b_agreed
        ELSE FALSE
      END,
      FALSE
    ) AS caller_agreed,
    COALESCE(
      CASE
        WHEN c.user_a_id = v_caller THEN c.b_agreed
        WHEN c.user_b_id = v_caller THEN c.a_agreed
        ELSE FALSE
      END,
      FALSE
    ) AS opp_agreed,
    c.contact_revealed_at,
    CASE WHEN c.contact_revealed_at IS NOT NULL
         THEN u.phone
         ELSE NULL
    END AS target_phone
  FROM group_members gm
  JOIN public.users u ON u.id = gm.user_id
  LEFT JOIN profiles p ON p.user_id = gm.user_id
  LEFT JOIN connections c ON c.match_id = p_match_id
                          AND (
                            (c.user_a_id = LEAST(v_caller, gm.user_id) AND c.user_b_id = GREATEST(v_caller, gm.user_id))
                          )
  WHERE gm.group_id = v_opp_group_id
    AND gm.left_at IS NULL
  ORDER BY p.display_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_connections(UUID) TO authenticated;

COMMENT ON FUNCTION public.agree_connection(UUID, UUID) IS
  '본인 + 상대가 모두 동의하면 contact_revealed_at set. 양방향 동의 시점에 전화번호 노출.';
COMMENT ON FUNCTION public.cancel_connection(UUID, UUID) IS
  '본인 측 agreed 철회. contact_revealed_at 이미 set 된 경우 거부.';
COMMENT ON FUNCTION public.get_match_connections(UUID) IS
  'completed 매칭의 상대 그룹 멤버 + 본인 동의 상태 + 양쪽 동의 후 phone 공개.';
