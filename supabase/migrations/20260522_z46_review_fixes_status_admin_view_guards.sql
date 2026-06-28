-- Migration: z45 + z44 + z41 결함 수정 (Codex 리뷰 반영)
-- Owner:  충현
-- Date:   2026-05-22
-- 결함 목록:
--   1. (Critical) finalize_no_show → distribute_no_show_penalty 호출 시 status 충돌:
--      - finalize_no_show 는 status IN (confirmed, completed) 허용
--      - distribute_no_show_penalty 는 status = 'completed' 만 허용
--      - 약속 +30분 시점은 z37 lazy_complete(+4h) 미발동이므로 status='confirmed'
--      - → 정상 노쇼 처리 실패 (match_not_completed)
--      해결: (a) distribute_no_show_penalty 를 status IN (confirmed, completed) 로 확장
--            (b) finalize_no_show 는 호출 시점에 status='confirmed' 면 즉시 completed 로 전이
--   2. (High) admin_revenue_summary view 가 일반 사용자에게 노출 가능
--      - view 기본은 SECURITY DEFINER (owner 권한) 라 RLS 우회
--      해결: security_invoker=on + WHERE public.is_admin() 명시
--   3. (High) finalize_no_show_admin / batch_finalize_no_shows 가 일반 사용자 호출 가능
--      해결: 함수 내부에 admin/service_role(auth.uid()=NULL) 가드
--   4. (Medium) 노쇼 발생 후 UI 분기 위해 get_match_attendance_state 에
--      no_show_finalized 컬럼 추가

-- ─────────────────────────────────────────────
-- 1) distribute_no_show_penalty 상태 검사 완화
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.distribute_no_show_penalty(UUID, UUID[]);
CREATE OR REPLACE FUNCTION public.distribute_no_show_penalty(
  p_match_id UUID,
  p_no_show_user_ids UUID[]
)
RETURNS TABLE (
  forfeited_count INT,
  attendee_count  INT,
  total_forfeited_amount INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_total_amount INT := 0;
  v_forfeited INT := 0;
  v_attendees UUID[];
  v_all_participants UUID[];
BEGIN
  v_caller := auth.uid();
  -- service_role / cron 호출 (auth.uid()=NULL) 도 허용. 그 외엔 admin 또는 매칭 참여자 필요.
  IF p_no_show_user_ids IS NULL OR array_length(p_no_show_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_show_list_empty';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- 결함 수정: confirmed/completed 모두 허용 (finalize_no_show 가 약속+30분 시점 호출)
  IF v_match.status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  -- caller 검증: NULL (service_role) 또는 admin 또는 매칭 참여자
  IF v_caller IS NOT NULL AND NOT public.is_admin(v_caller) THEN
    IF NOT EXISTS (
      SELECT 1 FROM group_members
       WHERE group_id IN (v_match.group_a_id, v_match.group_b_id)
         AND user_id = v_caller
         AND left_at IS NULL
    ) THEN
      RAISE EXCEPTION 'not_match_participant';
    END IF;
  END IF;

  SELECT array_agg(gm.user_id) INTO v_all_participants
    FROM group_members gm
   WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND gm.left_at IS NULL;

  IF NOT (p_no_show_user_ids <@ v_all_participants) THEN
    RAISE EXCEPTION 'no_show_user_not_participant';
  END IF;

  v_attendees := ARRAY(
    SELECT u FROM unnest(v_all_participants) u
     WHERE u <> ALL (p_no_show_user_ids)
  );

  IF array_length(v_attendees, 1) IS NULL THEN
    RAISE EXCEPTION 'no_attendees_to_distribute';
  END IF;

  UPDATE deposits
     SET status = 'forfeited',
         distribution_to = v_attendees,
         refunded_at = NOW(),
         notes = COALESCE(notes || ' | ', '') || 'forfeited via distribute_no_show_penalty match=' || p_match_id::TEXT
   WHERE user_id = ANY (p_no_show_user_ids)
     AND group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND status IN ('paid', 'held');

  GET DIAGNOSTICS v_forfeited = ROW_COUNT;

  SELECT COALESCE(SUM(amount), 0)::INT INTO v_total_amount
    FROM deposits
   WHERE user_id = ANY (p_no_show_user_ids)
     AND group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND status = 'forfeited';

  RETURN QUERY SELECT v_forfeited, array_length(v_attendees, 1), v_total_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.distribute_no_show_penalty(UUID, UUID[]) TO authenticated;

-- ─────────────────────────────────────────────
-- 2) finalize_no_show: 호출 시점에 status='confirmed' 면 즉시 completed 로 전이
--    (lazy_complete_match 의 +4h 기준 무시. 노쇼 확정 = 만남 끝)
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.finalize_no_show(UUID);
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
  v_caller_within BOOLEAN;
  v_z41 RECORD;
  v_no_show_count INT := 0;
  v_attendee_count INT := 0;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_match.status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  IF NOT public.is_admin(v_caller) THEN
    IF NOT EXISTS (
      SELECT 1 FROM group_members
       WHERE group_id IN (v_match.group_a_id, v_match.group_b_id)
         AND user_id = v_caller AND left_at IS NULL
    ) THEN
      RAISE EXCEPTION 'not_match_participant';
    END IF;

    SELECT within_radius INTO v_caller_within
      FROM attendances WHERE match_id = p_match_id AND user_id = v_caller;
    IF (v_caller_within IS NULL OR v_caller_within = FALSE) THEN
      RAISE EXCEPTION 'caller_not_attendee';
    END IF;
  END IF;

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

  -- 결함 수정: status='confirmed' 일 때 즉시 completed 로 전이
  --   (distribute_no_show_penalty 가 confirmed 도 허용하지만, 일관성을 위해 전이)
  --   completed_at 은 scheduled_start + 30min (실제 finalize 시점 근처)
  IF v_match.status = 'confirmed' THEN
    UPDATE matches
       SET status = 'completed',
           completed_at = COALESCE(v_scheduled + INTERVAL '30 minutes', NOW())
     WHERE id = p_match_id;
    -- v_match 갱신
    v_match.status := 'completed';
  END IF;

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
      FROM unnest(v_attendees) u
    ON CONFLICT DO NOTHING;
    PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);

    RETURN QUERY SELECT 0, v_attendee_count, 0, 0;
    RETURN;
  END IF;

  SELECT * INTO v_z41 FROM public.distribute_no_show_penalty(p_match_id, v_no_show_ids);

  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
  INSERT INTO notifications (user_id, kind, payload)
  SELECT u, 'no_show_confirmed',
         jsonb_build_object('match_id', p_match_id, 'deposit_forfeited', TRUE, 'finalized_by', v_caller)
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

GRANT EXECUTE ON FUNCTION public.finalize_no_show(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- 3) finalize_no_show_admin / batch_finalize_no_shows: 권한 가드 + 상태 전이
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.finalize_no_show_admin(UUID);
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
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_scheduled TIMESTAMPTZ;
  v_no_show_ids UUID[];
  v_attendees UUID[];
  v_all_members UUID[];
  v_z41 RECORD;
  v_no_show_count INT := 0;
  v_attendee_count INT := 0;
BEGIN
  -- 권한 가드: service_role (auth.uid()=NULL) 또는 admin 만 호출 가능
  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_or_service_role_required';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_match.status NOT IN ('confirmed', 'completed') THEN RETURN; END IF;

  IF to_regclass('public.match_meetings') IS NOT NULL THEN
    EXECUTE
      'SELECT scheduled_start FROM public.match_meetings '
      || 'WHERE match_id = $1 AND status IN (''scheduled'', ''completed'') '
      || 'ORDER BY scheduled_start ASC LIMIT 1'
      INTO v_scheduled
      USING p_match_id;
  END IF;

  IF v_match.status = 'confirmed' THEN
    UPDATE matches
       SET status = 'completed',
           completed_at = COALESCE(v_scheduled + INTERVAL '30 minutes', NOW())
     WHERE id = p_match_id;
    v_match.status := 'completed';
  END IF;

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
         jsonb_build_object('match_id', p_match_id, 'deposit_forfeited', TRUE)
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

-- 권한 회수: authenticated 에게서 제거 (admin/service_role 만)
REVOKE EXECUTE ON FUNCTION public.finalize_no_show_admin(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_no_show_admin(UUID) FROM anon, PUBLIC;
-- 함수 내부 가드가 있으므로 authenticated 에게 권한은 줘도 됨 (가드가 차단)
GRANT EXECUTE ON FUNCTION public.finalize_no_show_admin(UUID) TO authenticated;

-- batch_finalize_no_shows 도 admin/service_role 가드
DROP FUNCTION IF EXISTS public.batch_finalize_no_shows();
CREATE OR REPLACE FUNCTION public.batch_finalize_no_shows()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match_id UUID;
  v_count INT := 0;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_or_service_role_required';
  END IF;

  IF to_regclass('public.match_meetings') IS NULL THEN
    RETURN 0;
  END IF;

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
      PERFORM public.finalize_no_show_admin(v_match_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_finalize_no_shows() TO authenticated;

-- ─────────────────────────────────────────────
-- 4) admin_revenue_summary view 보안 강화
--    security_invoker=on (PG 15+) + WHERE public.is_admin()
-- ─────────────────────────────────────────────
DROP VIEW IF EXISTS public.admin_revenue_summary;

CREATE VIEW public.admin_revenue_summary
WITH (security_invoker = on) AS
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
  AND public.is_admin()  -- 일반 사용자 호출 시 빈 결과
GROUP BY 1
ORDER BY 1 DESC;

GRANT SELECT ON public.admin_revenue_summary TO authenticated;

COMMENT ON VIEW public.admin_revenue_summary IS
  '일자별 환불 처리 통계 + 앱 수익. security_invoker=on + WHERE is_admin() 이중 방어.';

-- ─────────────────────────────────────────────
-- 5) get_match_attendance_state 에 no_show_finalized 컬럼 추가
--    UI 가 노쇼 발생 시 continuation/refund/review CTA 를 숨길 수 있게.
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_match_attendance_state(UUID);
CREATE OR REPLACE FUNCTION public.get_match_attendance_state(p_match_id UUID)
RETURNS TABLE (
  my_checked_in BOOLEAN,
  my_within_radius BOOLEAN,
  my_distance_m DOUBLE PRECISION,
  total_participants INT,
  attendee_count INT,
  scheduled_start TIMESTAMPTZ,
  finalize_available BOOLEAN,
  no_show_finalized BOOLEAN,
  caller_is_no_show BOOLEAN
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
  v_no_show_finalized BOOLEAN;
  v_caller_is_no_show BOOLEAN;
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

  -- 노쇼 finalize 발생 여부: 본 매칭에 forfeited deposit 존재 OR no_show_confirmed 알림 존재
  SELECT EXISTS (
    SELECT 1 FROM deposits
     WHERE group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND status = 'forfeited'
  ) INTO v_no_show_finalized;

  -- 본인이 노쇼로 처리됐는지
  SELECT EXISTS (
    SELECT 1 FROM deposits
     WHERE user_id = v_caller
       AND group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND status = 'forfeited'
  ) INTO v_caller_is_no_show;

  RETURN QUERY SELECT
    (v_my_att.id IS NOT NULL),
    COALESCE(v_my_att.within_radius, FALSE),
    NULL::DOUBLE PRECISION,
    v_total,
    v_attendees,
    v_scheduled,
    (v_scheduled IS NOT NULL AND NOW() >= v_scheduled + INTERVAL '30 minutes'
     AND COALESCE(v_my_att.within_radius, FALSE) = TRUE
     AND NOT v_no_show_finalized),
    v_no_show_finalized,
    v_caller_is_no_show;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_attendance_state(UUID) TO authenticated;

COMMENT ON FUNCTION public.distribute_no_show_penalty(UUID, UUID[]) IS
  'z46 갱신: confirmed/completed 둘 다 허용 + service_role/admin/참여자 호출 가능.';
COMMENT ON FUNCTION public.finalize_no_show(UUID) IS
  'z46 갱신: 호출 시점에 status=confirmed 면 즉시 completed 전이 (lazy +4h 무시). 노쇼 = 만남 끝.';
COMMENT ON FUNCTION public.finalize_no_show_admin(UUID) IS
  'z46 갱신: admin/service_role 가드 추가. batch/cron 전용.';
COMMENT ON FUNCTION public.batch_finalize_no_shows() IS
  'z46 갱신: admin/service_role 가드 추가.';
COMMENT ON FUNCTION public.get_match_attendance_state(UUID) IS
  'z46 갱신: no_show_finalized, caller_is_no_show 컬럼 추가. UI 분기용.';
