-- Migration: SECURITY DEFINER RPC 가 RLS 정책을 명시적 bypass guard 패턴으로 통과하도록 통일
-- Owner:  충현
-- Decision: MASTER_PLAN_V1_6 12.E
-- Date:   2026-05-21
--
-- 배경:
--   - z14 의 accept_group_invite_by_token 은 invite guard 만 bypass 패턴 사용
--   - z14 의 group_members INSERT / z16 의 match_pool INSERT/UPDATE 는 BYPASSRLS 가정
--     (Supabase 의 postgres owner 가 RLS 우회한다는 환경 가정)
--   - Supabase 환경 차이에 무관하게 동작하도록 명시적 bypass guard 추가
--
-- 패턴:
--   - 정책 WITH CHECK 안에 `current_setting('app.bypass_*_guard', TRUE) = 'on' OR (기존 조건)`
--   - RPC 본문 안에서 `PERFORM set_config('app.bypass_*_guard', 'on', TRUE)` 호출
--   - set_config 의 `is_local = TRUE` 라 트랜잭션 종료 시 자동 reset
--
-- 변경 대상 정책:
--   z12: group_members_strict_insert
--   z12: match_pool_member_insert
--   z12: match_pool_member_cancel_update
--
-- 변경 대상 RPC:
--   z14: accept_group_invite_by_token  → group_members insert 직전 bypass set
--   z16: enter_match_pool               → match_pool insert + groups update bypass set
--   z16: cancel_match_pool              → match_pool update + groups update bypass set

-- ─────────────────────────────────────────────
-- group_members_strict_insert: bypass 경로 추가
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "group_members_strict_insert" ON group_members;

CREATE POLICY "group_members_strict_insert" ON group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    current_setting('app.bypass_group_members_guard', TRUE) = 'on'
    OR (
      role = 'leader'
      AND user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM groups g
        WHERE g.id = group_members.group_id
          AND g.leader_user_id = auth.uid()
      )
    )
    OR (
      role = 'member'
      AND user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM group_invites gi
        WHERE gi.group_id = group_members.group_id
          AND gi.invited_user_id = auth.uid()
          AND gi.status = 'accepted'
      )
    )
    OR (
      role = 'member'
      AND EXISTS (
        SELECT 1 FROM groups g
        WHERE g.id = group_members.group_id
          AND g.leader_user_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM group_invites gi
        WHERE gi.group_id = group_members.group_id
          AND gi.invited_user_id = group_members.user_id
          AND gi.status = 'accepted'
      )
    )
  );

-- ─────────────────────────────────────────────
-- match_pool_member_insert / update: bypass 경로 추가
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "match_pool_member_insert" ON match_pool;

CREATE POLICY "match_pool_member_insert" ON match_pool
  FOR INSERT TO authenticated
  WITH CHECK (
    current_setting('app.bypass_match_pool_guard', TRUE) = 'on'
    OR (
      status = 'waiting'
      AND batch_id IS NULL
      AND rollover_count = 0
      AND EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = match_pool.group_id
          AND gm.user_id = auth.uid()
          AND gm.left_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "match_pool_member_cancel_update" ON match_pool;

CREATE POLICY "match_pool_member_cancel_update" ON match_pool
  FOR UPDATE TO authenticated
  USING (
    current_setting('app.bypass_match_pool_guard', TRUE) = 'on'
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = match_pool.group_id
        AND gm.user_id = auth.uid()
        AND gm.left_at IS NULL
    )
  )
  WITH CHECK (
    current_setting('app.bypass_match_pool_guard', TRUE) = 'on'
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = match_pool.group_id
        AND gm.user_id = auth.uid()
        AND gm.left_at IS NULL
    )
  );

-- match_pool guard trigger: bypass 인 경우 통과
CREATE OR REPLACE FUNCTION public.guard_match_pool_update()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.bypass_match_pool_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      OLD.status IN ('waiting', 'rolled_over')
      AND NEW.status = 'cancelled'
    ) THEN
      RAISE EXCEPTION 'match_pool: users may only transition waiting/rolled_over -> cancelled';
    END IF;
  END IF;
  IF NEW.group_id        IS DISTINCT FROM OLD.group_id
     OR NEW.entered_at     IS DISTINCT FROM OLD.entered_at
     OR NEW.left_at        IS DISTINCT FROM OLD.left_at
     OR NEW.rollover_count IS DISTINCT FROM OLD.rollover_count
     OR NEW.batch_id       IS DISTINCT FROM OLD.batch_id
     OR NEW.notes          IS DISTINCT FROM OLD.notes THEN
    RAISE EXCEPTION 'match_pool: protected columns may only be set by service_role';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- groups update guard: leader 가 아닌 RPC 경유 update 를 위한 bypass
-- (현재 RPC 가 leader 만 호출 가능하므로 leader_user_id = auth.uid() 통과하지만
--  안전 통일을 위해 bypass 도 허용)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "groups_leader_write" ON groups;

CREATE POLICY "groups_leader_write" ON groups
  FOR ALL TO authenticated
  USING (
    current_setting('app.bypass_groups_guard', TRUE) = 'on'
    OR leader_user_id = auth.uid()
  )
  WITH CHECK (
    current_setting('app.bypass_groups_guard', TRUE) = 'on'
    OR leader_user_id = auth.uid()
  );

-- ─────────────────────────────────────────────
-- RPC 재정의: accept_group_invite_by_token
--   기존 z14 의 본문 + group_members INSERT 직전 bypass set 추가
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_group_invite_by_token(
  p_token TEXT
)
RETURNS TABLE (
  invite_id UUID,
  group_id UUID,
  member_user_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite group_invites%ROWTYPE;
  v_group groups%ROWTYPE;
  v_active_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_invite
    FROM group_invites
   WHERE token = p_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_not_pending';
  END IF;

  IF v_invite.expires_at <= NOW() THEN
    PERFORM set_config('app.bypass_group_invites_guard', 'on', TRUE);
    UPDATE group_invites SET status = 'expired' WHERE id = v_invite.id;
    PERFORM set_config('app.bypass_group_invites_guard', 'off', TRUE);
    RAISE EXCEPTION 'invite_expired';
  END IF;

  IF v_invite.invited_user_id IS NOT NULL
     AND v_invite.invited_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'invite_not_for_user';
  END IF;

  SELECT *
    INTO v_group
    FROM groups
   WHERE id = v_invite.group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.status NOT IN ('forming', 'ready') THEN
    RAISE EXCEPTION 'group_not_open';
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM group_members gm
   WHERE gm.group_id = v_invite.group_id
     AND gm.left_at IS NULL;

  IF v_active_count >= v_group.size THEN
    RAISE EXCEPTION 'group_full';
  END IF;

  PERFORM set_config('app.bypass_group_invites_guard', 'on', TRUE);
  UPDATE group_invites
     SET status = 'accepted',
         invited_user_id = COALESCE(invited_user_id, auth.uid())
   WHERE id = v_invite.id;
  PERFORM set_config('app.bypass_group_invites_guard', 'off', TRUE);

  PERFORM set_config('app.bypass_group_members_guard', 'on', TRUE);
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_invite.group_id, auth.uid(), 'member');
  PERFORM set_config('app.bypass_group_members_guard', 'off', TRUE);

  RETURN QUERY
  SELECT v_invite.id, v_invite.group_id, auth.uid(), 'accepted'::TEXT;
END;
$$;

-- ─────────────────────────────────────────────
-- RPC 재정의: enter_match_pool
-- ─────────────────────────────────────────────
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
   WHERE match_pool.group_id = p_group_id
     AND status IN ('waiting', 'rolled_over')
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'already_in_queue';
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM group_members
   WHERE group_members.group_id = p_group_id
     AND left_at IS NULL;

  IF v_active_count < 2 THEN
    RAISE EXCEPTION 'not_enough_members';
  END IF;

  IF v_active_count > v_group.size THEN
    RAISE EXCEPTION 'group_overflow';
  END IF;

  IF v_group.status = 'forming' THEN
    PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
    UPDATE groups SET status = 'ready' WHERE id = p_group_id;
    PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);
  END IF;

  PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
  INSERT INTO match_pool (group_id, status, rollover_count, batch_id)
  VALUES (p_group_id, 'waiting', 0, NULL)
  RETURNING id INTO v_pool_id;
  PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);

  RETURN QUERY
  SELECT v_pool_id, p_group_id, 'ready'::TEXT, 'waiting'::TEXT;
END;
$$;

-- ─────────────────────────────────────────────
-- RPC 재정의: cancel_match_pool
-- ─────────────────────────────────────────────
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

  PERFORM set_config('app.bypass_match_pool_guard', 'on', TRUE);
  UPDATE match_pool
     SET status = 'cancelled'
   WHERE match_pool.group_id = p_group_id
     AND status IN ('waiting', 'rolled_over');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('app.bypass_match_pool_guard', 'off', TRUE);

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'not_in_queue';
  END IF;

  IF v_group.status = 'ready' THEN
    PERFORM set_config('app.bypass_groups_guard', 'on', TRUE);
    UPDATE groups SET status = 'forming' WHERE id = p_group_id;
    PERFORM set_config('app.bypass_groups_guard', 'off', TRUE);
  END IF;

  RETURN QUERY
  SELECT p_group_id, 'forming'::TEXT, 'cancelled'::TEXT;
END;
$$;

COMMENT ON FUNCTION public.accept_group_invite_by_token(TEXT) IS
  'invite token 으로 본인 그룹 가입 RPC. group_invites/group_members 정책을 set_config bypass 로 통과.';
COMMENT ON FUNCTION public.enter_match_pool(UUID) IS
  '리더가 호출. groups/match_pool 정책을 set_config bypass 로 통과. 활성 멤버 >= 2 검증 후 큐 진입.';
COMMENT ON FUNCTION public.cancel_match_pool(UUID) IS
  '리더가 호출. groups/match_pool 정책을 set_config bypass 로 통과. waiting/rolled_over -> cancelled.';
