-- Migration: GPS 체크인 + 노쇼 자동 확정 + 구걸 UX 차단
-- Owner:  충현
-- Decision (8-24):
--   - GPS 는 약속 시간 이후 활성. 사용자가 도착 시 navigator.geolocation 으로 체크인.
--   - 약속 시간 + 30분 후 출석자가 "노쇼 처리" 호출 → finalize_no_show RPC
--     → attendances 없거나 within_radius=FALSE 인 사용자 = 노쇼 확정
--     → distribute_no_show_penalty 자동 호출 → forfeit + 출석자 분배
--     → z42 구걸 UX 진입 차단 (이미 forfeited 체크 있음, 노쇼 발생 시 환불 자체 X)
--   - cron 으로 매일 호출하여 미처리 매칭 자동 finalize 가능.
-- Date:   2026-05-22
-- 의존: matches, attendances, venues, match_meetings (성준 cross-branch), z41 distribute_no_show_penalty

-- ─────────────────────────────────────────────
-- 1) attendances RLS 에 SECURITY DEFINER bypass + admin 추가
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "attendances_self_write" ON attendances;
CREATE POLICY "attendances_self_write" ON attendances
  FOR INSERT TO authenticated
  WITH CHECK (
    current_setting('app.bypass_attendances_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "attendances_self_update" ON attendances;
CREATE POLICY "attendances_self_update" ON attendances
  FOR UPDATE TO authenticated
  USING (
    current_setting('app.bypass_attendances_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  )
  WITH CHECK (
    current_setting('app.bypass_attendances_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  );

-- ─────────────────────────────────────────────
-- 2) Haversine 거리 헬퍼 (미터 단위)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.haversine_distance_m(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r CONSTANT DOUBLE PRECISION := 6371000;  -- 지구 반지름 m
  phi1 DOUBLE PRECISION := radians(lat1);
  phi2 DOUBLE PRECISION := radians(lat2);
  dphi DOUBLE PRECISION := radians(lat2 - lat1);
  dlmd DOUBLE PRECISION := radians(lng2 - lng1);
  a    DOUBLE PRECISION;
BEGIN
  a := sin(dphi/2)^2 + cos(phi1) * cos(phi2) * sin(dlmd/2)^2;
  RETURN 2 * r * atan2(sqrt(a), sqrt(1 - a));
END;
$$;

-- ─────────────────────────────────────────────
-- 3) checkin_attendance RPC
--    사용자가 약속 장소 도착 시 호출. navigator.geolocation 좌표 전송.
--    약속 시간 30분 전 ~ 약속 시간 + 2시간 사이만 허용.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.checkin_attendance(
  p_match_id UUID,
  p_lat      DOUBLE PRECISION,
  p_lng      DOUBLE PRECISION
)
RETURNS TABLE (
  attendance_id UUID,
  within_radius BOOLEAN,
  distance_m    DOUBLE PRECISION,
  radius_m      INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_meeting_row RECORD;
  v_dist DOUBLE PRECISION;
  v_within BOOLEAN;
  v_now TIMESTAMPTZ := NOW();
  v_attendance_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'gps_required';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_match.status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  -- 본인이 참여자인지
  IF NOT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND user_id = v_caller
       AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  -- venue 정보 조회 (cross-branch dynamic SQL)
  IF to_regclass('public.match_meetings') IS NULL
     OR to_regclass('public.venues') IS NULL THEN
    RAISE EXCEPTION 'meeting_or_venue_not_set';
  END IF;

  EXECUTE
    'SELECT mm.scheduled_start, mm.checkin_radius_m, v.latitude, v.longitude '
    || 'FROM public.match_meetings mm '
    || 'JOIN public.venues v ON v.id = mm.venue_id '
    || 'WHERE mm.match_id = $1 AND mm.status IN (''scheduled'', ''completed'') '
    || 'ORDER BY mm.scheduled_start ASC LIMIT 1'
    INTO v_meeting_row
    USING p_match_id;

  IF v_meeting_row IS NULL OR v_meeting_row.scheduled_start IS NULL THEN
    RAISE EXCEPTION 'meeting_not_scheduled';
  END IF;

  -- 약속 시간 30분 전 ~ + 2시간 안에만 체크인 가능
  IF v_now < v_meeting_row.scheduled_start - INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'too_early_to_checkin';
  END IF;
  IF v_now > v_meeting_row.scheduled_start + INTERVAL '2 hours' THEN
    RAISE EXCEPTION 'too_late_to_checkin';
  END IF;

  v_dist := public.haversine_distance_m(
    p_lat, p_lng,
    v_meeting_row.latitude, v_meeting_row.longitude
  );
  v_within := (v_dist <= v_meeting_row.checkin_radius_m);

  PERFORM set_config('app.bypass_attendances_guard', 'on', TRUE);
  INSERT INTO attendances (match_id, user_id, gps_lat, gps_lng, within_radius, checked_at)
  VALUES (p_match_id, v_caller, p_lat, p_lng, v_within, v_now)
  ON CONFLICT (match_id, user_id) DO UPDATE
    SET gps_lat = EXCLUDED.gps_lat,
        gps_lng = EXCLUDED.gps_lng,
        within_radius = EXCLUDED.within_radius,
        checked_at = v_now
  RETURNING id INTO v_attendance_id;
  PERFORM set_config('app.bypass_attendances_guard', 'off', TRUE);

  RETURN QUERY SELECT v_attendance_id, v_within, v_dist, v_meeting_row.checkin_radius_m;
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkin_attendance(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- ─────────────────────────────────────────────
-- 4) finalize_no_show RPC
--    약속 시간 + 30분 이후 호출 가능. 호출자는 출석자(within_radius=TRUE)여야 함.
--    매칭 참여 멤버 중 attendances 없거나 within_radius=FALSE 인 사람 = 노쇼 확정.
--    distribute_no_show_penalty 자동 호출.
--    구걸 UX (continuation/refund) 진입 차단은 z42 의 forfeited 체크가 처리.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_no_show(p_match_id UUID)
RETURNS TABLE (
  no_show_count INT,
  attendee_count INT,
  forfeited_count INT,
  total_forfeited_amount INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_scheduled TIMESTAMPTZ;
  v_no_show_ids UUID[];
  v_attendees UUID[];
  v_all_members UUID[];
  v_caller_in BOOLEAN;
  v_caller_within BOOLEAN;
  v_dist RECORD;
  v_z41 RECORD;
  v_no_show_count INT := 0;
  v_attendee_count INT := 0;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_match.status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  -- 호출자가 매칭 참여자 + 출석자(within_radius=TRUE) 여야 함
  --   (admin 은 무조건 통과)
  SELECT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND user_id = v_caller AND left_at IS NULL
  ) INTO v_caller_in;
  IF NOT v_caller_in AND NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  SELECT within_radius INTO v_caller_within
    FROM attendances WHERE match_id = p_match_id AND user_id = v_caller;
  IF (v_caller_within IS NULL OR v_caller_within = FALSE) AND NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'caller_not_attendee';
  END IF;

  -- 약속 시간 + 30분 경과 검증
  IF to_regclass('public.match_meetings') IS NOT NULL THEN
    EXECUTE
      'SELECT scheduled_start FROM public.match_meetings '
      || 'WHERE match_id = $1 AND status IN (''scheduled'', ''completed'') '
      || 'ORDER BY scheduled_start ASC LIMIT 1'
      INTO v_scheduled
      USING p_match_id;
    IF v_scheduled IS NULL THEN
      RAISE EXCEPTION 'meeting_not_scheduled';
    END IF;
    IF NOW() < v_scheduled + INTERVAL '30 minutes' AND NOT public.is_admin(v_caller) THEN
      RAISE EXCEPTION 'too_early_to_finalize';
    END IF;
  END IF;

  -- 전체 활성 멤버
  SELECT array_agg(gm.user_id) INTO v_all_members
    FROM group_members gm
   WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND gm.left_at IS NULL;

  -- 출석자 (attendances within_radius=TRUE)
  SELECT array_agg(a.user_id) INTO v_attendees
    FROM attendances a
   WHERE a.match_id = p_match_id AND a.within_radius = TRUE;
  IF v_attendees IS NULL THEN v_attendees := ARRAY[]::UUID[]; END IF;

  -- 노쇼 = 전체 - 출석자
  v_no_show_ids := ARRAY(
    SELECT u FROM unnest(v_all_members) u
     WHERE u <> ALL (v_attendees)
  );
  IF v_no_show_ids IS NULL THEN v_no_show_ids := ARRAY[]::UUID[]; END IF;

  v_no_show_count := COALESCE(array_length(v_no_show_ids, 1), 0);
  v_attendee_count := COALESCE(array_length(v_attendees, 1), 0);

  -- 멱등성: 이미 forfeited deposit 이 있으면 z41 재호출은 무의미. 통계만 반환.
  IF v_no_show_count = 0 THEN
    -- 모두 출석. 노쇼 없음 → forfeit 처리 안 함.
    -- 출석자에게 attendance_confirmed 알림 (양쪽 다 출석했음을 알림)
    PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
    INSERT INTO notifications (user_id, kind, payload)
    SELECT u, 'attendance_confirmed',
           jsonb_build_object('match_id', p_match_id, 'all_attended', TRUE)
      FROM unnest(v_attendees) u;
    PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);

    RETURN QUERY SELECT 0, v_attendee_count, 0, 0;
    RETURN;
  END IF;

  -- 노쇼 발생 → z41 호출
  SELECT * INTO v_z41 FROM public.distribute_no_show_penalty(p_match_id, v_no_show_ids);

  -- 알림 fan-out: 노쇼에게 no_show_confirmed, 출석자에게 attendance_confirmed
  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
  INSERT INTO notifications (user_id, kind, payload)
  SELECT u, 'no_show_confirmed',
         jsonb_build_object(
           'match_id', p_match_id,
           'deposit_forfeited', TRUE,
           'finalized_by', v_caller
         )
    FROM unnest(v_no_show_ids) u;

  INSERT INTO notifications (user_id, kind, payload)
  SELECT u, 'attendance_confirmed',
         jsonb_build_object(
           'match_id', p_match_id,
           'no_show_count', v_no_show_count,
           'forfeited_pool', v_z41.total_forfeited_amount
         )
    FROM unnest(v_attendees) u;
  PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN QUERY SELECT
    v_no_show_count,
    v_attendee_count,
    v_z41.forfeited_count,
    v_z41.total_forfeited_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_no_show(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- 5) 알림 kind 확장: attendance_confirmed, no_show_confirmed
-- ─────────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'match_created', 'match_confirmed', 'match_completed',
    'phone_revealed', 'review_request',
    'friend_request_received', 'meeting_reminder',
    'continuation_choice_request', 'both_continue',
    'partner_paid_zero', 'refund_processed',
    'attendance_confirmed', 'no_show_confirmed'
  ));

-- ─────────────────────────────────────────────
-- 6) 자동 finalize cron 호출용 RPC (모든 미처리 매칭)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.batch_finalize_no_shows()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id UUID;
  v_count INT := 0;
BEGIN
  IF to_regclass('public.match_meetings') IS NULL THEN
    RETURN 0;
  END IF;

  -- 약속 시간 + 30분 지났고 아직 forfeited 처리가 없는 매칭들
  FOR v_match_id IN
    EXECUTE
      'SELECT m.id FROM matches m '
      || 'JOIN public.match_meetings mm ON mm.match_id = m.id '
      || 'WHERE m.status IN (''confirmed'', ''completed'') '
      || '  AND mm.scheduled_start <= NOW() - INTERVAL ''30 minutes'' '
      || '  AND mm.scheduled_start >= NOW() - INTERVAL ''7 days'' '
      || '  AND NOT EXISTS ( '
      || '    SELECT 1 FROM deposits d '
      || '     WHERE d.group_id IN (m.group_a_id, m.group_b_id) '
      || '       AND d.status = ''forfeited'' '
      || '  ) '
      || '  AND NOT EXISTS ( '
      || '    SELECT 1 FROM notifications n '
      || '     WHERE n.kind IN (''attendance_confirmed'', ''no_show_confirmed'') '
      || '       AND (n.payload->>''match_id'')::UUID = m.id '
      || '  )'
  LOOP
    BEGIN
      -- finalize_no_show 는 caller 검증을 하므로, 직접 distribute 호출하지 않고
      -- 내부 로직만 재현 (admin 모드)
      PERFORM public.finalize_no_show_admin(v_match_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- 한 건 실패해도 나머지 진행
      CONTINUE;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_finalize_no_shows() TO authenticated;

-- admin 모드 finalize (caller 검증 없이 호출 가능, batch 용)
CREATE OR REPLACE FUNCTION public.finalize_no_show_admin(p_match_id UUID)
RETURNS TABLE (
  no_show_count INT,
  attendee_count INT,
  forfeited_count INT,
  total_forfeited_amount INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_no_show_ids UUID[];
  v_attendees UUID[];
  v_all_members UUID[];
  v_z41 RECORD;
  v_no_show_count INT := 0;
  v_attendee_count INT := 0;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT array_agg(gm.user_id) INTO v_all_members
    FROM group_members gm
   WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND gm.left_at IS NULL;

  SELECT array_agg(a.user_id) INTO v_attendees
    FROM attendances a
   WHERE a.match_id = p_match_id AND a.within_radius = TRUE;
  IF v_attendees IS NULL THEN v_attendees := ARRAY[]::UUID[]; END IF;

  v_no_show_ids := ARRAY(
    SELECT u FROM unnest(v_all_members) u
     WHERE u <> ALL (v_attendees)
  );
  IF v_no_show_ids IS NULL THEN v_no_show_ids := ARRAY[]::UUID[]; END IF;

  v_no_show_count := COALESCE(array_length(v_no_show_ids, 1), 0);
  v_attendee_count := COALESCE(array_length(v_attendees, 1), 0);

  IF v_no_show_count = 0 THEN
    PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
    INSERT INTO notifications (user_id, kind, payload)
    SELECT u, 'attendance_confirmed',
           jsonb_build_object('match_id', p_match_id, 'all_attended', TRUE)
      FROM unnest(v_attendees) u;
    PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);
    RETURN QUERY SELECT 0, v_attendee_count, 0, 0;
    RETURN;
  END IF;

  SELECT * INTO v_z41 FROM public.distribute_no_show_penalty(p_match_id, v_no_show_ids);

  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
  INSERT INTO notifications (user_id, kind, payload)
  SELECT u, 'no_show_confirmed',
         jsonb_build_object('match_id', p_match_id, 'deposit_forfeited', TRUE, 'finalized_by', NULL)
    FROM unnest(v_no_show_ids) u;
  INSERT INTO notifications (user_id, kind, payload)
  SELECT u, 'attendance_confirmed',
         jsonb_build_object('match_id', p_match_id, 'no_show_count', v_no_show_count,
                            'forfeited_pool', v_z41.total_forfeited_amount)
    FROM unnest(v_attendees) u;
  PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN QUERY SELECT
    v_no_show_count, v_attendee_count,
    v_z41.forfeited_count, v_z41.total_forfeited_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_no_show_admin(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- 7) get_match_attendance_state — 본인 매칭의 출석 상태 조회 (UI 용)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_match_attendance_state(p_match_id UUID)
RETURNS TABLE (
  my_checked_in BOOLEAN,
  my_within_radius BOOLEAN,
  my_distance_m DOUBLE PRECISION,
  total_participants INT,
  attendee_count INT,
  scheduled_start TIMESTAMPTZ,
  finalize_available BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_my_att attendances%ROWTYPE;
  v_total INT;
  v_attendees INT;
  v_scheduled TIMESTAMPTZ;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;

  SELECT * INTO v_my_att
    FROM attendances WHERE match_id = p_match_id AND user_id = v_caller;

  SELECT COUNT(*) INTO v_total
    FROM group_members
   WHERE group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND left_at IS NULL;

  SELECT COUNT(*) INTO v_attendees
    FROM attendances
   WHERE match_id = p_match_id AND within_radius = TRUE;

  IF to_regclass('public.match_meetings') IS NOT NULL THEN
    EXECUTE
      'SELECT scheduled_start FROM public.match_meetings '
      || 'WHERE match_id = $1 AND status IN (''scheduled'', ''completed'') '
      || 'ORDER BY scheduled_start ASC LIMIT 1'
      INTO v_scheduled
      USING p_match_id;
  END IF;

  RETURN QUERY SELECT
    (v_my_att.id IS NOT NULL),
    COALESCE(v_my_att.within_radius, FALSE),
    NULL::DOUBLE PRECISION,  -- 거리 재계산 비용 큼, UI 가 필요하면 별도 호출
    v_total,
    v_attendees,
    v_scheduled,
    (v_scheduled IS NOT NULL AND NOW() >= v_scheduled + INTERVAL '30 minutes'
     AND COALESCE(v_my_att.within_radius, FALSE) = TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_attendance_state(UUID) TO authenticated;

COMMENT ON FUNCTION public.checkin_attendance(UUID, DOUBLE PRECISION, DOUBLE PRECISION) IS
  'GPS 체크인. 약속 30분 전 ~ +2시간 안. venues 좌표 기준 within_radius 계산.';
COMMENT ON FUNCTION public.finalize_no_show(UUID) IS
  '약속+30분 후 출석자 호출. 노쇼 자동 확정 + z41 분배 + 알림 fan-out. 구걸 UX 진입 차단.';
COMMENT ON FUNCTION public.batch_finalize_no_shows() IS
  'cron 호출. 미처리 매칭들 자동 finalize (caller 검증 skip, admin 모드).';
COMMENT ON FUNCTION public.get_match_attendance_state(UUID) IS
  '본인 매칭의 출석 상태 + finalize 가능 여부. UI 버튼 활성화 판정용.';
