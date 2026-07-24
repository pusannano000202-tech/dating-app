-- Migration: 구걸 UX 정책 반전 — both_continue 가 구걸 진입, any_end 는 자동 환불
-- Owner:  충현
-- Date:   2026-05-22
--
-- Decision (8-26): z42 의 결정 8-22 를 **반전**.
--   z42 까지: both_continue → 자동 전액 환불, any_end → 구걸 UX
--   z47 부터: both_continue → 구걸 UX 진입 (자동 환불 X, 수익 명분 시점)
--             any_end       → 자동 전액 환불 (구걸 X, 별로였는데 돈 떼면 신뢰 파괴)
--             no_show       → 그대로 forfeit + 분배 + 구걸 차단
--
-- 사업 논리:
--   - 양쪽이 서로 마음에 들었으니 "우리 덕분에 잘 됐잖아요" 명분이 성립 → 구걸
--   - 한쪽이라도 싫었으면 사용자가 "별로였는데 왜 돈을 떼?" 라고 느낌 → 자동 환불
--
-- 변경:
--   1. trg_continuation_both_continue_check 재정의
--      - both_continue 도달 시 자동 환불 X. both_continue 알림만.
--      - 첫 'end' INSERT 시 양쪽 그룹 모든 활성 멤버 deposits 자동 전액 환불
--        + review_request + refund_processed (auto, app_revenue=0) 알림
--        + deposit_refund_requests row 자동 생성 (status='processed')
--   2. submit_refund_request 진입 가드 추가
--      - continuation 상태가 both_continue 일 때만 허용
--      - any_end (자동 환불 완료) 일 때 'already_auto_refunded' 에러
--      - 노쇼 사용자는 기존대로 차단
--
-- 폐기:
--   - 결정 8-22 z42 의 "양쪽 continue 자동 환불" 부분 폐기. 본 마이그가 대체.
--   - z43 expire_continuation_choices 7일 무응답 → 'end' 자동 흐름은 유지.
--     'end' 시 자동 환불이 본 트리거에서 발동되므로 만료 → 자동 환불 흐름도 정상 동작.

-- ─────────────────────────────────────────────
-- 1) trg_continuation_both_continue_check 재정의
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
  v_just_refunded_count INT := 0;
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

  -- 양쪽 모든 활성 멤버가 'continue' → 구걸 진입 안내 (자동 환불 안 함)
  --   결정 8-26: 자동 환불 X. 사용자가 구걸 UX 에서 직접 환불 금액 선택.
  IF v_total > 0 AND v_continue = v_total THEN
    PERFORM public.notify_match_members(NEW.match_id, 'both_continue', '{}'::jsonb);
    -- ※ deposits 자동 환불 코드 제거 (구걸 진입 가능 상태 유지)
  END IF;

  -- 첫 'end' INSERT → 자동 전액 환불 + 리뷰 요청
  --   any_end 인 경우 = 한 명이라도 만남 별로 = 별로였던 사용자에게 돈 떼면 신뢰 파괴
  --   양쪽 그룹 모든 활성 멤버 deposits paid → refunded.
  --   forfeited (노쇼) deposit 은 그대로 둠.
  --   deposit_refund_requests row 도 같이 INSERT (status='processed', app_revenue=0)
  IF NEW.choice = 'end' AND v_end = 1 THEN
    PERFORM public.notify_match_members(NEW.match_id, 'review_request', '{}'::jsonb);

    PERFORM set_config('app.bypass_drr_guard', 'on', TRUE);
    INSERT INTO deposit_refund_requests (
      match_id, user_id, deposit_id,
      requested_refund_amount, status, processed_at
    )
    SELECT NEW.match_id, d.user_id, d.id, d.amount, 'processed', NOW()
      FROM deposits d
     WHERE d.group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND d.status IN ('paid', 'held')
    ON CONFLICT (match_id, user_id) DO NOTHING;
    PERFORM set_config('app.bypass_drr_guard', 'off', TRUE);

    UPDATE deposits
       SET status = 'refunded',
           refunded_at = COALESCE(refunded_at, NOW()),
           notes = COALESCE(notes || ' | ', '') ||
                   'auto_refund_any_end match=' || NEW.match_id::TEXT
     WHERE group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND status IN ('paid', 'held');
    GET DIAGNOSTICS v_just_refunded_count = ROW_COUNT;

    -- 환불 처리 알림: 양쪽 그룹 모든 활성 멤버
    PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
    INSERT INTO notifications (user_id, kind, payload)
    SELECT gm.user_id, 'refund_processed',
           jsonb_build_object(
             'match_id', NEW.match_id,
             'refund_amount', NULL,   -- 본인 금액은 client 가 deposit 에서 조회
             'full_refund', TRUE,
             'reason', 'any_end_auto_refund'
           )
      FROM group_members gm
     WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND gm.left_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM deposits d
          WHERE d.user_id = gm.user_id
            AND d.group_id = gm.group_id
            AND d.status = 'forfeited'
       );
    PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_continuation_both_continue_check() IS
  'z47 갱신 (결정 8-26 정책 반전): both_continue → 구걸 진입 안내만. any_end → 자동 전액 환불 + 리뷰 요청.';

-- ─────────────────────────────────────────────
-- 2) submit_refund_request 진입 가드 변경
--    both_continue 일 때만 호출 가능. any_end / no_show 차단.
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.submit_refund_request(UUID, INT, TEXT[], TEXT);
CREATE OR REPLACE FUNCTION public.submit_refund_request(
  p_match_id              UUID,
  p_refund_amount         INT,
  p_zero_refund_reasons   TEXT[] DEFAULT NULL,
  p_zero_refund_comment   TEXT DEFAULT NULL
)
RETURNS TABLE (
  refund_request_id UUID,
  requested_refund_amount INT,
  deposit_amount INT,
  app_revenue INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_deposit deposits%ROWTYPE;
  v_app_revenue INT;
  v_row deposit_refund_requests%ROWTYPE;
  v_total INT;
  v_continue INT;
  v_end INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_refund_amount IS NULL OR p_refund_amount < 0 THEN
    RAISE EXCEPTION 'invalid_refund_amount';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_match.status <> 'completed' THEN
    RAISE EXCEPTION 'match_not_completed';
  END IF;

  -- continuation 상태 검사: both_continue 시에만 구걸 진입 가능 (결정 8-26)
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
   WHERE match_id = p_match_id;

  IF v_end > 0 THEN
    RAISE EXCEPTION 'already_auto_refunded';  -- any_end → z47 자동 환불 완료
  END IF;
  IF v_total = 0 OR v_continue < v_total THEN
    RAISE EXCEPTION 'both_continue_required';  -- 아직 양쪽 continue 도달 전
  END IF;

  -- 본인 deposit 찾기 (paid/held)
  SELECT * INTO v_deposit
    FROM deposits
   WHERE user_id = v_caller
     AND group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND status IN ('paid', 'held')
   LIMIT 1;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM deposits
       WHERE user_id = v_caller
         AND group_id IN (v_match.group_a_id, v_match.group_b_id)
         AND status = 'forfeited'
    ) THEN
      RAISE EXCEPTION 'no_show_cannot_refund';
    END IF;
    RAISE EXCEPTION 'deposit_not_found_or_already_refunded';
  END IF;

  IF p_refund_amount > v_deposit.amount THEN
    RAISE EXCEPTION 'refund_exceeds_deposit';
  END IF;

  PERFORM set_config('app.bypass_drr_guard', 'on', TRUE);
  INSERT INTO deposit_refund_requests (
    match_id, user_id, deposit_id,
    requested_refund_amount, zero_refund_reasons, zero_refund_comment,
    status, processed_at
  ) VALUES (
    p_match_id, v_caller, v_deposit.id,
    p_refund_amount,
    COALESCE(p_zero_refund_reasons, '{}'::TEXT[]),
    p_zero_refund_comment,
    'processed', NOW()
  )
  ON CONFLICT (match_id, user_id) DO UPDATE
    SET requested_refund_amount = EXCLUDED.requested_refund_amount,
        zero_refund_reasons = EXCLUDED.zero_refund_reasons,
        zero_refund_comment = EXCLUDED.zero_refund_comment,
        status = 'processed',
        processed_at = NOW()
  RETURNING * INTO v_row;
  PERFORM set_config('app.bypass_drr_guard', 'off', TRUE);

  v_app_revenue := v_deposit.amount - p_refund_amount;

  UPDATE deposits
     SET status = 'refunded',
         refunded_at = NOW(),
         notes = COALESCE(notes || ' | ', '') ||
                 'voluntary_refund=' || p_refund_amount::TEXT ||
                 ' app_revenue=' || v_app_revenue::TEXT
   WHERE id = v_deposit.id;

  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
  INSERT INTO notifications (user_id, kind, payload)
  VALUES (v_caller, 'refund_processed',
          jsonb_build_object(
            'match_id', p_match_id,
            'refund_amount', p_refund_amount,
            'deposit_amount', v_deposit.amount,
            'app_revenue', v_app_revenue,
            'reason', 'voluntary_post_both_continue'
          ));

  -- 새 정책: 사용자가 앱 매칭비를 0원으로 확정한 경우만 상대방에게 알림.
  -- submit_refund_request 는 refund_amount 를 받으므로 app_revenue=0 이 "앱에 0원 지불" 상태다.
  IF v_app_revenue = 0 THEN
    INSERT INTO notifications (user_id, kind, payload)
    SELECT gm.user_id, 'partner_paid_zero',
           jsonb_build_object(
             'match_id', p_match_id,
             'from_user_id', v_caller,
             'app_fee_amount', 0
           )
      FROM group_members gm
     WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND gm.user_id <> v_caller
       AND gm.left_at IS NULL;
  END IF;

  PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN QUERY SELECT v_row.id, v_row.requested_refund_amount, v_deposit.amount, v_app_revenue;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_refund_request(UUID, INT, TEXT[], TEXT) TO authenticated;

COMMENT ON FUNCTION public.submit_refund_request(UUID, INT, TEXT[], TEXT) IS
  'z47 갱신 (결정 8-26): both_continue 일 때만 호출. any_end → already_auto_refunded. 노쇼 → no_show_cannot_refund.';
