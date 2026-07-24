-- Migration: 운영자(admin) 권한 인프라
-- Owner:  충현
-- Decision (8-23): v1 운영자 1명 (충현) 이 Supabase SQL Editor 로 직접 RPC 호출하는 모델.
--                  v1.1 에서 /admin/* 페이지 추가. 권한 모델은 z44 인프라 그대로 사용.
-- Date:   2026-05-22
-- Ref: docs/ADMIN_OPERATIONS_PLAN.md

-- ─────────────────────────────────────────────
-- 1) admins 테이블
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  user_id      UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'admin'
                 CHECK (role IN ('admin', 'super_admin')),
  granted_by   UUID REFERENCES public.users(id),
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes        TEXT
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_self_read" ON admins;
CREATE POLICY "admins_self_read" ON admins
  FOR SELECT TO authenticated
  USING (
    current_setting('app.bypass_admins_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  );

-- INSERT/UPDATE/DELETE 는 SECURITY DEFINER RPC 만 (수동 SQL 도 service_role 권장)
DROP POLICY IF EXISTS "admins_no_direct_write" ON admins;
CREATE POLICY "admins_no_direct_write" ON admins
  FOR ALL TO authenticated
  USING (current_setting('app.bypass_admins_guard', TRUE) = 'on')
  WITH CHECK (current_setting('app.bypass_admins_guard', TRUE) = 'on');

-- ─────────────────────────────────────────────
-- 2) is_admin(user_id) 헬퍼 — 모든 RLS USING 절에 사용
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins WHERE user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins WHERE user_id = p_user_id AND role = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- 3) 핵심 테이블 SELECT RLS 에 admin bypass 추가
--    기존 정책을 DROP 하고 OR is_admin() 포함하여 재생성
-- ─────────────────────────────────────────────

-- groups
DROP POLICY IF EXISTS "groups_member_read" ON groups;
CREATE POLICY "groups_member_read" ON groups
  FOR SELECT TO authenticated
  USING (
    leader_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())
    OR public.is_admin()
  );

-- group_members
DROP POLICY IF EXISTS "group_members_self_read" ON group_members;
CREATE POLICY "group_members_self_read" ON group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid())
    OR public.is_admin()
  );

-- matches
DROP POLICY IF EXISTS "matches_participant_read" ON matches;
CREATE POLICY "matches_participant_read" ON matches
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_id = matches.group_a_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM group_members WHERE group_id = matches.group_b_id AND user_id = auth.uid())
    OR public.is_admin()
  );

-- match_pool
DROP POLICY IF EXISTS "match_pool_member_read" ON match_pool;
CREATE POLICY "match_pool_member_read" ON match_pool
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_id = match_pool.group_id AND user_id = auth.uid())
    OR public.is_admin()
  );

-- deposits
DROP POLICY IF EXISTS "deposits_self" ON deposits;
CREATE POLICY "deposits_self" ON deposits
  FOR ALL TO authenticated
  USING (
    current_setting('app.bypass_deposits_guard', TRUE) = 'on'
    OR user_id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    current_setting('app.bypass_deposits_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  );

-- friend_requests
DROP POLICY IF EXISTS "friend_requests_participant_read" ON friend_requests;
CREATE POLICY "friend_requests_participant_read" ON friend_requests
  FOR SELECT TO authenticated
  USING (
    sender_user_id = auth.uid()
    OR receiver_user_id = auth.uid()
    OR public.is_admin()
  );

-- friendships
DROP POLICY IF EXISTS "friendships_participant_read" ON friendships;
CREATE POLICY "friendships_participant_read" ON friendships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR friend_user_id = auth.uid()
    OR public.is_admin()
  );

-- reviews
DROP POLICY IF EXISTS "reviews_match_participant_read" ON reviews;
CREATE POLICY "reviews_match_participant_read" ON reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = reviews.match_id
        AND (
          EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_a_id AND user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_b_id AND user_id = auth.uid())
        )
    )
    OR public.is_admin()
  );

-- attendances
DROP POLICY IF EXISTS "attendances_match_participant" ON attendances;
CREATE POLICY "attendances_match_participant" ON attendances
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = attendances.match_id
        AND (
          EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_a_id AND user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM group_members WHERE group_id = m.group_b_id AND user_id = auth.uid())
        )
    )
    OR public.is_admin()
  );

-- connections (z36 자동공개 정책)
DROP POLICY IF EXISTS "connections_self" ON connections;
CREATE POLICY "connections_self" ON connections
  FOR ALL TO authenticated
  USING (
    current_setting('app.bypass_connections_guard', TRUE) = 'on'
    OR user_a_id = auth.uid()
    OR user_b_id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    current_setting('app.bypass_connections_guard', TRUE) = 'on'
    OR user_a_id = auth.uid()
    OR user_b_id = auth.uid()
  );

-- notifications
DROP POLICY IF EXISTS "notifications_self" ON notifications;
CREATE POLICY "notifications_self" ON notifications
  FOR ALL TO authenticated
  USING (
    current_setting('app.bypass_notifications_guard', TRUE) = 'on'
    OR user_id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    current_setting('app.bypass_notifications_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  );

-- match_continuation_choices
DROP POLICY IF EXISTS "mcc_self" ON match_continuation_choices;
CREATE POLICY "mcc_self" ON match_continuation_choices
  FOR ALL TO authenticated
  USING (
    current_setting('app.bypass_mcc_guard', TRUE) = 'on'
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM matches m
       JOIN group_members gm ON gm.group_id IN (m.group_a_id, m.group_b_id) AND gm.user_id = auth.uid() AND gm.left_at IS NULL
       WHERE m.id = match_continuation_choices.match_id
    )
    OR public.is_admin()
  )
  WITH CHECK (
    current_setting('app.bypass_mcc_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  );

-- deposit_refund_requests
DROP POLICY IF EXISTS "drr_self" ON deposit_refund_requests;
CREATE POLICY "drr_self" ON deposit_refund_requests
  FOR ALL TO authenticated
  USING (
    current_setting('app.bypass_drr_guard', TRUE) = 'on'
    OR user_id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    current_setting('app.bypass_drr_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  );

-- ─────────────────────────────────────────────
-- 4) admin 관리 RPC: super_admin 만 호출 가능
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_admin(
  p_user_id UUID,
  p_role    TEXT DEFAULT 'admin',
  p_notes   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  IF p_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  PERFORM set_config('app.bypass_admins_guard', 'on', TRUE);
  INSERT INTO admins (user_id, role, granted_by, notes)
  VALUES (p_user_id, p_role, v_caller, p_notes)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role,
        notes = EXCLUDED.notes,
        granted_by = v_caller,
        granted_at = NOW();
  PERFORM set_config('app.bypass_admins_guard', 'off', TRUE);

  RETURN p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_admin(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_deleted INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'cannot_revoke_self';
  END IF;

  PERFORM set_config('app.bypass_admins_guard', 'on', TRUE);
  DELETE FROM admins WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  PERFORM set_config('app.bypass_admins_guard', 'off', TRUE);

  RETURN v_deleted > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_admin(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- 5) 운영 통계 view (admin 만 조회)
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_revenue_summary AS
SELECT
  date_trunc('day', drr.processed_at)::DATE AS day,
  COUNT(*)                                  AS refund_count,
  SUM(d.amount)                             AS total_deposit_pool,
  SUM(drr.requested_refund_amount)          AS total_refunded,
  SUM(d.amount - drr.requested_refund_amount) AS app_revenue,
  COUNT(*) FILTER (WHERE drr.requested_refund_amount = 0) AS zero_refund_count
FROM deposit_refund_requests drr
JOIN deposits d ON d.id = drr.deposit_id
WHERE drr.status = 'processed'
GROUP BY 1
ORDER BY 1 DESC;

-- view RLS 는 underlying 테이블 정책 + admin bypass
GRANT SELECT ON admin_revenue_summary TO authenticated;

COMMENT ON TABLE admins IS '운영자 목록. super_admin 만 다른 admin 추가/제거 가능.';
COMMENT ON FUNCTION public.is_admin(UUID) IS '핵심 테이블 RLS 에서 OR is_admin() 으로 사용. 운영자 모든 SELECT 가능.';
COMMENT ON FUNCTION public.grant_admin(UUID, TEXT, TEXT) IS 'super_admin 만 호출. role=admin/super_admin.';
COMMENT ON VIEW admin_revenue_summary IS '일자별 환불 처리 통계 + 앱 수익(deposit - refund 차액).';
