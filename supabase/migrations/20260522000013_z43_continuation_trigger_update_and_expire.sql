-- Migration: z39 트리거 갱신 + 미선택 만료 처리
-- Owner:  충현
-- Decision:
--   1. matches completed → review_request 알림을 continuation_choice_request 로 교체.
--      (review 는 누구라도 'end' 선택 시 별도 알림으로 발송)
--   2. continuation 미선택 7일 → 'end' 자동 간주 + 환불 선택 안내 알림
--   3. refund_request 미선택 14일 → 전액 자동 환불 (사용자 잊어버려도 손해 X)
-- Date:   2026-05-22
-- 의존: z39 (트리거 / 알림 시스템), z42 (continuation / refund 테이블)

-- ─────────────────────────────────────────────
-- 1) z39 trg_notify_match_updated 갱신
--    completed 직후엔 phone_revealed + continuation_choice_request 만 보냄.
--    review_request 는 누구라도 'end' 선택 시 별도 발송 (아래 z42 트리거 확장).
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_match_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'confirmed' THEN
    PERFORM public.notify_match_members(NEW.id, 'match_confirmed', '{}'::jsonb);
  ELSIF NEW.status = 'completed' THEN
    PERFORM public.notify_match_members(NEW.id, 'match_completed', '{}'::jsonb);
    PERFORM public.notify_match_members(NEW.id, 'phone_revealed', '{}'::jsonb);
    PERFORM public.notify_match_members(NEW.id, 'continuation_choice_request', '{}'::jsonb);
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────
-- 2) z42 trg_continuation_both_continue_check 확장:
--    누구라도 'end' 선택 시 → review_request 알림 (모든 활성 멤버에게)
--    이미 양쪽 continue 인 경우는 기존 로직 (자동 환불)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_continuation_both_continue_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_total INT;
  v_continue INT;
  v_end INT;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = NEW.match_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_total
    FROM group_members gm
   WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND gm.left_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM deposits d
        WHERE d.user_id = gm.user_id
          AND d.group_id = gm.group_id
          AND d.status = 'forfeited'
     );

  SELECT COUNT(*) FILTER (WHERE choice = 'continue'),
         COUNT(*) FILTER (WHERE choice = 'end')
    INTO v_continue, v_end
    FROM match_continuation_choices
   WHERE match_id = NEW.match_id;

  -- 양쪽 모두 continue → 자동 전액 환불 (z42 기존 로직 유지)
  IF v_total > 0 AND v_continue = v_total THEN
    UPDATE deposits
       SET status = 'refunded',
           refunded_at = COALESCE(refunded_at, NOW())
     WHERE group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND status IN ('paid', 'held');

    PERFORM public.notify_match_members(NEW.match_id, 'both_continue', '{}'::jsonb);
    PERFORM public.notify_match_members(NEW.match_id, 'refund_processed',
              jsonb_build_object('full_refund', TRUE, 'reason', 'both_parties_chose_continue'));
  END IF;

  -- 누구라도 'end' → review_request 알림 (해당 row 가 'end' 첫 INSERT 일 때만)
  IF NEW.choice = 'end' AND v_end = 1 THEN
    PERFORM public.notify_match_members(NEW.match_id, 'review_request', '{}'::jsonb);
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────
-- 3) expire_continuation_choices() — 7일 무응답 자동 'end' + 환불 선택 안내
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_continuation_choices()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
BEGIN
  PERFORM set_config('app.bypass_mcc_guard', 'on', TRUE);

  INSERT INTO match_continuation_choices (match_id, user_id, choice, created_at)
  SELECT m.id, gm.user_id, 'end', NOW()
    FROM matches m
    JOIN group_members gm
      ON gm.group_id IN (m.group_a_id, m.group_b_id)
     AND gm.left_at IS NULL
   WHERE m.status = 'completed'
     AND m.completed_at <= NOW() - INTERVAL '7 days'
     AND NOT EXISTS (
       SELECT 1 FROM match_continuation_choices mcc
        WHERE mcc.match_id = m.id AND mcc.user_id = gm.user_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM deposits d
        WHERE d.user_id = gm.user_id
          AND d.group_id = gm.group_id
          AND d.status = 'forfeited'
     )
  ON CONFLICT (match_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  PERFORM set_config('app.bypass_mcc_guard', 'off', TRUE);

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_continuation_choices() TO authenticated;

-- ─────────────────────────────────────────────
-- 4) expire_refund_requests() — 14일 무응답 자동 전액 환불
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_refund_requests()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INT := 0;
  v_row RECORD;
BEGIN
  PERFORM set_config('app.bypass_drr_guard', 'on', TRUE);
  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);

  FOR v_row IN
    SELECT d.id AS deposit_id, d.user_id, d.group_id, d.amount, m.id AS match_id
      FROM matches m
      JOIN deposits d ON d.group_id IN (m.group_a_id, m.group_b_id)
                      AND d.status IN ('paid', 'held')
     WHERE m.status = 'completed'
       AND m.completed_at <= NOW() - INTERVAL '14 days'
       AND EXISTS (
         SELECT 1 FROM match_continuation_choices mcc
          WHERE mcc.match_id = m.id AND mcc.user_id = d.user_id AND mcc.choice = 'end'
       )
       AND NOT EXISTS (
         SELECT 1 FROM deposit_refund_requests drr
          WHERE drr.match_id = m.id AND drr.user_id = d.user_id
       )
  LOOP
    INSERT INTO deposit_refund_requests (
      match_id, user_id, deposit_id,
      requested_refund_amount, status, processed_at
    ) VALUES (
      v_row.match_id, v_row.user_id, v_row.deposit_id,
      v_row.amount, 'processed', NOW()
    )
    ON CONFLICT (match_id, user_id) DO NOTHING;

    UPDATE deposits
       SET status = 'refunded',
           refunded_at = NOW(),
           notes = COALESCE(notes || ' | ', '') || 'auto_refund_14day_expire'
     WHERE id = v_row.deposit_id;

    INSERT INTO notifications (user_id, kind, payload)
    VALUES (v_row.user_id, 'refund_processed',
            jsonb_build_object(
              'match_id', v_row.match_id,
              'refund_amount', v_row.amount,
              'deposit_amount', v_row.amount,
              'app_revenue', 0,
              'reason', 'auto_expire_14day'
            ));

    v_processed := v_processed + 1;
  END LOOP;

  PERFORM set_config('app.bypass_drr_guard', 'off', TRUE);
  PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN v_processed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_refund_requests() TO authenticated;

COMMENT ON FUNCTION public.expire_continuation_choices() IS
  '7일 무응답 매칭 참여자에게 choice=end 자동 INSERT. cron 으로 일 1회 호출.';
COMMENT ON FUNCTION public.expire_refund_requests() IS
  '14일 무응답 deposit 자동 전액 환불 (사용자 손해 방지). cron 으로 일 1회 호출.';
