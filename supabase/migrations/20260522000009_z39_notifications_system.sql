-- Migration: in-app 알림 시스템 (notifications)
-- Owner:  충현
-- Decision (8-21): 사용자가 매칭 결과를 능동 확인해야만 알 수 있는 흐름은 위험.
--                  최소한 in-app 알림으로 매칭 이벤트를 fan-out 한다.
--                  SMS/push 외부 통합은 v1.1 (외부 알림 서비스 통합 시 본 테이블 row 를 source 로).
-- Date:   2026-05-22
--
-- 알림 종류:
--   - match_created      : 본인 그룹이 포함된 매칭이 생성됨
--   - match_confirmed    : 양쪽 리더 모두 확정 완료
--   - match_completed    : 매칭 자동 완료 (약속 시간 + 4h)
--   - phone_revealed     : 약속 시간 도달, 상대 핸드폰 공개됨
--   - review_request     : 평가 작성 요청 (completed 직후)
--   - friend_request_received : 친구 요청 받음 (v1.1 알림 통합 시)
--   - meeting_reminder   : 약속 D-1 / 약속 N분 전 (v1.1 스케줄러)
--
-- payload (jsonb) 예시:
--   match_created:  { match_id, opp_group_size, opp_group_gender, scheduled_start? }
--   match_confirmed: { match_id, scheduled_start? }
--   match_completed: { match_id }
--   phone_revealed:  { match_id }
--   review_request:  { match_id }

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN (
                 'match_created', 'match_confirmed', 'match_completed',
                 'phone_revealed', 'review_request',
                 'friend_request_received', 'meeting_reminder'
               )),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user        ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at  ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_self_read"  ON notifications;
DROP POLICY IF EXISTS "notifications_self_write" ON notifications;
DROP POLICY IF EXISTS "notifications_self"       ON notifications;

CREATE POLICY "notifications_self" ON notifications
  FOR ALL TO authenticated
  USING (
    current_setting('app.bypass_notifications_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  )
  WITH CHECK (
    current_setting('app.bypass_notifications_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  );

-- ─────────────────────────────────────────────
-- 헬퍼: 양쪽 그룹의 active 멤버 모두에게 알림 fan-out
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_match_members(
  p_match_id UUID,
  p_kind     TEXT,
  p_payload  JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);

  INSERT INTO notifications (user_id, kind, payload)
  SELECT gm.user_id, p_kind, p_payload || jsonb_build_object('match_id', p_match_id)
    FROM group_members gm
   WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND gm.left_at IS NULL;

  PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_match_members(UUID, TEXT, JSONB) TO authenticated;

-- ─────────────────────────────────────────────
-- 트리거: matches AFTER INSERT → match_created 알림
-- ─────────────────────────────────────────────
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
  SELECT size, gender::TEXT INTO v_ga_size, v_ga_gender FROM groups WHERE id = NEW.group_a_id;
  SELECT size, gender::TEXT INTO v_gb_size, v_gb_gender FROM groups WHERE id = NEW.group_b_id;

  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);

  -- group_a 멤버들에게: 상대는 group_b
  INSERT INTO notifications (user_id, kind, payload)
  SELECT gm.user_id, 'match_created',
         jsonb_build_object(
           'match_id', NEW.id,
           'opp_group_size', v_gb_size,
           'opp_group_gender', v_gb_gender
         )
    FROM group_members gm
   WHERE gm.group_id = NEW.group_a_id AND gm.left_at IS NULL;

  -- group_b 멤버들에게: 상대는 group_a
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

-- ─────────────────────────────────────────────
-- 트리거: matches AFTER UPDATE → confirmed/completed 알림
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_match_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed' THEN
    PERFORM public.notify_match_members(NEW.id, 'match_confirmed', '{}'::jsonb);
  ELSIF NEW.status = 'completed' THEN
    PERFORM public.notify_match_members(NEW.id, 'match_completed', '{}'::jsonb);
    PERFORM public.notify_match_members(NEW.id, 'phone_revealed', '{}'::jsonb);
    PERFORM public.notify_match_members(NEW.id, 'review_request', '{}'::jsonb);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_notify_updated ON matches;
CREATE TRIGGER trg_matches_notify_updated
  AFTER UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_match_updated();

-- ─────────────────────────────────────────────
-- RPC: get_my_notifications, mark_notification_read, mark_all_read, count_unread
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_notifications(
  p_limit       INT DEFAULT 50,
  p_unread_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id          UUID,
  kind        TEXT,
  payload     JSONB,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
  SELECT n.id, n.kind, n.payload, n.read_at, n.created_at
    FROM notifications n
   WHERE n.user_id = v_caller
     AND (NOT p_unread_only OR n.read_at IS NULL)
   ORDER BY n.created_at DESC
   LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_notifications(INT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_updated INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
  UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
   WHERE id = p_notification_id
     AND user_id = v_caller;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN v_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_updated INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
  UPDATE notifications
     SET read_at = NOW()
   WHERE user_id = v_caller
     AND read_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.count_unread_notifications()
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_count INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT COUNT(*)::INT INTO v_count
    FROM notifications
   WHERE user_id = v_caller AND read_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_unread_notifications() TO authenticated;

COMMENT ON TABLE notifications IS
  '사용자별 in-app 알림. v1.1 외부 SMS/push 통합 시 본 테이블 row 가 source.';
COMMENT ON FUNCTION public.get_my_notifications(INT, BOOLEAN) IS
  '본인 알림 목록 (최신순). p_unread_only=true 면 미읽음만.';
COMMENT ON FUNCTION public.notify_match_members(UUID, TEXT, JSONB) IS
  '매칭 양쪽 그룹의 active 멤버 모두에게 알림 fan-out.';
