-- Migration: 만남 지속 의사 + 자발적 보증금 환불 선택 (구걸 UX)
-- Owner:  충현
-- Decision (8-22): 자동 전액 환불 폐기. 사용자 능동 선택으로 변경.
--   1. 매칭 completed → "만남 이어갈래요?" 양쪽 그룹 모든 활성 멤버에게 질문
--      - 양쪽 그룹 모든 멤버가 'continue' → 자동 전액 환불 + 리뷰 skip + 핸드폰 공개 강조
--      - 누구라도 'end' → 리뷰 작성 + 환불 선택 UX 진입
--   2. 환불 선택: 사용자가 0 ~ 전액 사이로 직접 결정
--      - 0원 선택 시 사유 + 상대방에게 자동 알림 ('partner_paid_zero')
--      - 앱 수익 = (deposit.amount - 사용자가 선택한 refund_amount)
--   3. 노쇼는 z41 그대로 (전액 forfeit, refund_request 진입 불가)
--   4. 미선택 만료: continuation 7일 → 'end' 자동 간주. refund 14일 → 전액 자동 환불.
-- Date:   2026-05-22

-- ─────────────────────────────────────────────
-- match_continuation_choices: 본 만남 이후 지속 의사
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_continuation_choices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  choice       TEXT NOT NULL CHECK (choice IN ('continue', 'end')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_mcc_match ON match_continuation_choices(match_id);
CREATE INDEX IF NOT EXISTS idx_mcc_user  ON match_continuation_choices(user_id);

ALTER TABLE match_continuation_choices ENABLE ROW LEVEL SECURITY;
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
  )
  WITH CHECK (
    current_setting('app.bypass_mcc_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  );

-- ─────────────────────────────────────────────
-- deposit_refund_requests: 자발적 환불 신청 (구걸 UX 의 최종 결과)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deposit_refund_requests (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                  UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id                   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  deposit_id                UUID NOT NULL REFERENCES deposits(id) ON DELETE CASCADE,
  -- 사용자가 돌려받기로 선택한 최종 금액 (0 ~ deposit.amount)
  requested_refund_amount   INT NOT NULL CHECK (requested_refund_amount >= 0),
  -- 0원 선택 시 사유 (whitelist + 자유 코멘트)
  zero_refund_reasons       TEXT[] NOT NULL DEFAULT '{}',
  zero_refund_comment       TEXT,
  -- 처리 상태
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'processed', 'cancelled')),
  processed_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_drr_match  ON deposit_refund_requests(match_id);
CREATE INDEX IF NOT EXISTS idx_drr_user   ON deposit_refund_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_drr_status ON deposit_refund_requests(status);

ALTER TABLE deposit_refund_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drr_self" ON deposit_refund_requests;
CREATE POLICY "drr_self" ON deposit_refund_requests
  FOR ALL TO authenticated
  USING (
    current_setting('app.bypass_drr_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  )
  WITH CHECK (
    current_setting('app.bypass_drr_guard', TRUE) = 'on'
    OR user_id = auth.uid()
  );

-- ─────────────────────────────────────────────
-- 알림 kind 확장: continuation_choice_request, both_continue, partner_paid_zero, refund_processed
-- ─────────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'match_created', 'match_confirmed', 'match_completed',
    'phone_revealed', 'review_request',
    'friend_request_received', 'meeting_reminder',
    'continuation_choice_request', 'both_continue',
    'partner_paid_zero', 'refund_processed'
  ));

-- ─────────────────────────────────────────────
-- RPC: submit_continuation_choice
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_continuation_choice(
  p_match_id UUID,
  p_choice   TEXT
)
RETURNS TABLE (
  my_choice         TEXT,
  total_participants INT,
  continue_count    INT,
  end_count         INT,
  both_continue     BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_total INT;
  v_continue INT;
  v_end INT;
  v_both_continue BOOLEAN;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_choice NOT IN ('continue', 'end') THEN
    RAISE EXCEPTION 'invalid_choice';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;

  IF v_match.status <> 'completed' THEN
    RAISE EXCEPTION 'match_not_completed';
  END IF;

  -- 본인이 참여자인지 확인
  IF NOT EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND user_id = v_caller
       AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_match_participant';
  END IF;

  -- 노쇼 사용자는 진입 차단 (forfeited deposit 있으면)
  IF EXISTS (
    SELECT 1 FROM deposits
     WHERE user_id = v_caller
       AND group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND status = 'forfeited'
  ) THEN
    RAISE EXCEPTION 'no_show_cannot_choose';
  END IF;

  PERFORM set_config('app.bypass_mcc_guard', 'on', TRUE);
  INSERT INTO match_continuation_choices (match_id, user_id, choice)
  VALUES (p_match_id, v_caller, p_choice)
  ON CONFLICT (match_id, user_id) DO UPDATE
    SET choice = EXCLUDED.choice,
        created_at = NOW();
  PERFORM set_config('app.bypass_mcc_guard', 'off', TRUE);

  -- 양쪽 그룹 모든 활성 멤버 수 (노쇼 제외)
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

  v_both_continue := (v_continue = v_total AND v_end = 0 AND v_total > 0);

  RETURN QUERY SELECT p_choice, v_total, v_continue, v_end, v_both_continue;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_continuation_choice(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- 트리거: continuation 양쪽 다 'continue' 도달 시 자동 refund + both_continue 알림
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

  SELECT COUNT(*) INTO v_continue
    FROM match_continuation_choices
   WHERE match_id = NEW.match_id AND choice = 'continue';

  IF v_total > 0 AND v_continue = v_total THEN
    -- 양쪽 모든 활성 멤버 'continue' → 자동 전액 환불 + both_continue 알림
    UPDATE deposits
       SET status = 'refunded',
           refunded_at = COALESCE(refunded_at, NOW())
     WHERE group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND status IN ('paid', 'held');

    PERFORM public.notify_match_members(NEW.match_id, 'both_continue', '{}'::jsonb);
    PERFORM public.notify_match_members(NEW.match_id, 'refund_processed',
              jsonb_build_object('full_refund', TRUE, 'reason', 'both_parties_chose_continue'));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mcc_both_continue ON match_continuation_choices;
CREATE TRIGGER trg_mcc_both_continue
  AFTER INSERT OR UPDATE ON match_continuation_choices
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_continuation_both_continue_check();

-- ─────────────────────────────────────────────
-- RPC: submit_refund_request — 구걸 UX 의 최종 결과 기록
-- ─────────────────────────────────────────────
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

  -- 본인 deposit 찾기
  SELECT * INTO v_deposit
    FROM deposits
   WHERE user_id = v_caller
     AND group_id IN (v_match.group_a_id, v_match.group_b_id)
     AND status IN ('paid', 'held')
   LIMIT 1;

  IF NOT FOUND THEN
    -- forfeited 면 명확한 에러
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

  -- deposit 상태 갱신: refunded (전액이든 부분이든)
  v_app_revenue := v_deposit.amount - p_refund_amount;

  UPDATE deposits
     SET status = 'refunded',
         refunded_at = NOW(),
         notes = COALESCE(notes || ' | ', '') ||
                 'voluntary_refund=' || p_refund_amount::TEXT ||
                 ' app_revenue=' || v_app_revenue::TEXT
   WHERE id = v_deposit.id;

  -- 0원 선택 시 상대편 멤버 모두에게 알림 (정책: 기본 발송, 비활성 옵션 없음)
  IF p_refund_amount = 0 THEN
    PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
    INSERT INTO notifications (user_id, kind, payload)
    SELECT gm.user_id, 'partner_paid_zero',
           jsonb_build_object(
             'match_id', p_match_id,
             'from_user_id', v_caller,
             'reasons', v_row.zero_refund_reasons
           )
      FROM group_members gm
     WHERE gm.group_id IN (v_match.group_a_id, v_match.group_b_id)
       AND gm.user_id <> v_caller
       AND gm.left_at IS NULL;
    PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);
  END IF;

  -- 본인에게 refund_processed 알림
  PERFORM set_config('app.bypass_notifications_guard', 'on', TRUE);
  INSERT INTO notifications (user_id, kind, payload)
  VALUES (v_caller, 'refund_processed',
          jsonb_build_object(
            'match_id', p_match_id,
            'refund_amount', p_refund_amount,
            'deposit_amount', v_deposit.amount,
            'app_revenue', v_app_revenue
          ));
  PERFORM set_config('app.bypass_notifications_guard', 'off', TRUE);

  RETURN QUERY SELECT v_row.id, v_row.requested_refund_amount, v_deposit.amount, v_app_revenue;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_refund_request(UUID, INT, TEXT[], TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: get_match_continuation_state — 본인/상대 선택 상태 조회
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_match_continuation_state(p_match_id UUID)
RETURNS TABLE (
  my_choice TEXT,
  total_participants INT,
  continue_count INT,
  end_count INT,
  both_continue BOOLEAN,
  any_end BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_match matches%ROWTYPE;
  v_my_choice TEXT;
  v_total INT;
  v_continue INT;
  v_end INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;

  SELECT choice INTO v_my_choice
    FROM match_continuation_choices
   WHERE match_id = p_match_id AND user_id = v_caller;

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

  RETURN QUERY SELECT
    v_my_choice,
    v_total,
    v_continue,
    v_end,
    (v_continue = v_total AND v_end = 0 AND v_total > 0),
    (v_end > 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_continuation_state(UUID) TO authenticated;

COMMENT ON TABLE match_continuation_choices IS
  '만남 이후 지속 의사. 양쪽 모두 continue → 자동 전액 환불, 누구라도 end → 리뷰/환불 선택 진입.';
COMMENT ON TABLE deposit_refund_requests IS
  '자발적 환불 신청 (구걸 UX 결과). app_revenue = deposit.amount - requested_refund_amount.';
COMMENT ON FUNCTION public.submit_continuation_choice(UUID, TEXT) IS
  '만남 지속 의사 선택. 노쇼는 진입 차단. INSERT 트리거가 양쪽 continue 시 자동 환불.';
COMMENT ON FUNCTION public.submit_refund_request(UUID, INT, TEXT[], TEXT) IS
  '자발적 환불 금액 선택. 0원 시 상대편 자동 알림. 노쇼는 진입 차단.';
