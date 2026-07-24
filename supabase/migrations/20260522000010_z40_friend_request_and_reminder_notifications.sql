-- Migration: 친구 요청 알림 + 약속 리마인더 RPC
-- Owner:  충현
-- Decision: z39 의 알림 인프라 위에 추가 이벤트 두 종류 연결.
--   1. friend_requests INSERT → receiver_user_id 에게 friend_request_received
--   2. enqueue_meeting_reminders() RPC: confirmed 매칭의 약속 D-1, 30분 전 시점에
--      meeting_reminder 알림을 멱등 INSERT (운영자/cron 이 주기 호출)
-- Date:   2026-05-22

-- ─────────────────────────────────────────────
-- 트리거: friend_requests AFTER INSERT
--   receiver_user_id (가입자 매칭된 경우) 가 있으면 그에게 알림
--   미가입 (phone only) 인 경우 → z23 의 자동 매칭 트리거가 receiver_user_id 채워줄 때
--   본 트리거가 자동 fire 되지 않으므로, 그 자동 매칭 트리거 안에서도 알림을 보내야 함.
--   현재는 INSERT 시점 receiver_user_id 가 있는 경우만 처리. v1.1 에서 확장.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_friend_request_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_display TEXT;
BEGIN
  IF NEW.receiver_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_sender_display
    FROM profiles WHERE user_id = NEW.sender_user_id;

  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
  INSERT INTO notifications (user_id, kind, payload)
  VALUES (
    NEW.receiver_user_id,
    'friend_request_received',
    jsonb_build_object(
      'friend_request_id', NEW.id,
      'sender_user_id', NEW.sender_user_id,
      'sender_display_name', COALESCE(v_sender_display, '익명')
    )
  );
  PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friend_request_notify ON friend_requests;
CREATE TRIGGER trg_friend_request_notify
  AFTER INSERT ON friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_friend_request_received();

-- ─────────────────────────────────────────────
-- RPC: enqueue_meeting_reminders()
--   confirmed 매칭의 약속 D-1 (24시간 전) / 30분 전 시점에 meeting_reminder 알림 멱등 INSERT.
--   payload.reminder_type ∈ ('day_before', 'half_hour_before') 로 구분.
--   같은 (user_id, match_id, reminder_type) 조합은 한 번만 발생 (멱등).
--   운영자 또는 supabase cron (pg_cron) 이 5분 주기로 호출.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_meeting_reminders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF to_regclass('public.match_meetings') IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);

  -- day_before: scheduled_start - now() <= 24h AND > 30min
  EXECUTE
    'INSERT INTO notifications (user_id, kind, payload) '
    || 'SELECT gm.user_id, ''meeting_reminder'', '
    || '       jsonb_build_object(''match_id'', m.id, ''reminder_type'', ''day_before'', '
    || '                          ''scheduled_start'', mm.scheduled_start) '
    || '  FROM matches m '
    || '  JOIN public.match_meetings mm ON mm.match_id = m.id AND mm.status = ''scheduled'' '
    || '  JOIN group_members gm '
    || '    ON gm.group_id IN (m.group_a_id, m.group_b_id) '
    || '   AND gm.left_at IS NULL '
    || ' WHERE m.status = ''confirmed'' '
    || '   AND mm.scheduled_start > $1 + INTERVAL ''30 minutes'' '
    || '   AND mm.scheduled_start <= $1 + INTERVAL ''24 hours'' '
    || '   AND NOT EXISTS ( '
    || '     SELECT 1 FROM notifications n '
    || '      WHERE n.user_id = gm.user_id '
    || '        AND n.kind = ''meeting_reminder'' '
    || '        AND n.payload->>''match_id'' = m.id::TEXT '
    || '        AND n.payload->>''reminder_type'' = ''day_before'' '
    || '   )'
    USING v_now;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- half_hour_before: scheduled_start - now() <= 30min AND > 0
  DECLARE v_h INT;
  BEGIN
    EXECUTE
      'INSERT INTO notifications (user_id, kind, payload) '
      || 'SELECT gm.user_id, ''meeting_reminder'', '
      || '       jsonb_build_object(''match_id'', m.id, ''reminder_type'', ''half_hour_before'', '
      || '                          ''scheduled_start'', mm.scheduled_start) '
      || '  FROM matches m '
      || '  JOIN public.match_meetings mm ON mm.match_id = m.id AND mm.status = ''scheduled'' '
      || '  JOIN group_members gm '
      || '    ON gm.group_id IN (m.group_a_id, m.group_b_id) '
      || '   AND gm.left_at IS NULL '
      || ' WHERE m.status = ''confirmed'' '
      || '   AND mm.scheduled_start > $1 '
      || '   AND mm.scheduled_start <= $1 + INTERVAL ''30 minutes'' '
      || '   AND NOT EXISTS ( '
      || '     SELECT 1 FROM notifications n '
      || '      WHERE n.user_id = gm.user_id '
      || '        AND n.kind = ''meeting_reminder'' '
      || '        AND n.payload->>''match_id'' = m.id::TEXT '
      || '        AND n.payload->>''reminder_type'' = ''half_hour_before'' '
      || '   )'
      USING v_now;
    GET DIAGNOSTICS v_h = ROW_COUNT;
    v_inserted := v_inserted + v_h;
  END;

  PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);
  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_meeting_reminders() TO authenticated;

COMMENT ON FUNCTION public.trg_notify_friend_request_received() IS
  '친구 요청 INSERT 시 receiver(가입자) 에게 friend_request_received 알림 자동 생성.';
COMMENT ON FUNCTION public.enqueue_meeting_reminders() IS
  'cron 으로 5분 주기 호출. confirmed 매칭의 D-1, 30분 전 meeting_reminder 알림 멱등 INSERT.';
