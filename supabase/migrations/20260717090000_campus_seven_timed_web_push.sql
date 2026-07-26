-- Campus Seven timed in-app notifications and privacy-minimized Web Push.
-- This migration creates disabled-by-default delivery infrastructure.
-- Production activation still requires VAPID/server secrets, Vault secrets,
-- and both application and database feature flags.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.campus_seven_program_settings
  ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN (
    'match_created', 'match_confirmed', 'match_completed',
    'phone_revealed', 'review_request',
    'friend_request_received', 'meeting_reminder',
    'continuation_choice_request', 'both_continue',
    'partner_paid_zero', 'refund_processed',
    'attendance_confirmed', 'no_show_confirmed',
    'daily_card_available', 'campus_seven_guide'
  ));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_campus_seven_guide_payload_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_campus_seven_guide_payload_check
  CHECK (
    kind <> 'campus_seven_guide'
    OR (
      NULLIF(payload ->> 'cohort_id', '') IS NOT NULL
      AND NULLIF(payload ->> 'day_number', '') IS NOT NULL
      AND NULLIF(payload ->> 'cue_key', '') IS NOT NULL
      AND NULLIF(payload ->> 'title', '') IS NOT NULL
      AND NULLIF(payload ->> 'body', '') IS NOT NULL
      AND NULLIF(payload ->> 'scheduled_at', '') IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.notifications
  VALIDATE CONSTRAINT notifications_campus_seven_guide_payload_check;

-- Notification access in this app is RPC-only. Removing direct table access
-- prevents clients from manufacturing Campus Seven push jobs for themselves.
REVOKE ALL ON public.notifications FROM anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_campus_seven_guide_unique_idx
  ON public.notifications (
    user_id,
    kind,
    (payload ->> 'cohort_id'),
    (payload ->> 'day_number'),
    (payload ->> 'cue_key')
  )
  WHERE kind = 'campus_seven_guide';

CREATE TABLE private.campus_seven_guide_cues (
  day_number INT NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  cue_key TEXT NOT NULL CHECK (cue_key ~ '^[a-z0-9-]+$'),
  offset_minutes INT NOT NULL CHECK (offset_minutes BETWEEN -480 AND 240),
  tone TEXT NOT NULL CHECK (tone IN ('notice', 'action', 'reveal', 'closing')),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 80),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 2 AND 240),
  PRIMARY KEY (day_number, cue_key),
  UNIQUE (day_number, offset_minutes)
);

REVOKE ALL ON private.campus_seven_guide_cues FROM PUBLIC, anon, authenticated;
GRANT SELECT ON private.campus_seven_guide_cues TO service_role;

INSERT INTO private.campus_seven_guide_cues (
  day_number, cue_key, offset_minutes, tone, title, body
)
VALUES
  (1, 'arrival', -20, 'notice', '첫 장면까지 20분', '앱에서 오늘의 장소와 이동 안내를 확인해 주세요.'),
  (1, 'opening', 0, 'reveal', '첫 장면이 시작됐어요', '휴대폰은 잠시 내려두고 닉네임으로 천천히 인사해 주세요.'),
  (1, 'move', 55, 'action', '자리를 바꿀 시간이에요', '안내된 순서대로 이동해 새로운 사람과 이야기해 주세요.'),
  (1, 'focus', 110, 'notice', '한 사람에게 더 집중해 보세요', '남은 시간에는 궁금했던 이야기를 하나 먼저 건네보세요.'),
  (1, 'heart', 155, 'closing', '오늘의 마음 기록이 열렸어요', '다른 사람에게는 보이지 않아요. 지금 마음을 솔직하게 남겨주세요.'),
  (2, 'arrival', -20, 'notice', '오늘의 장소가 열렸어요', '앱에서 목적지와 안전 안내를 확인해 주세요.'),
  (2, 'opening', 0, 'reveal', '새로운 장면이 시작됐어요', '오늘 함께할 팀을 확인하고 서로의 닉네임부터 불러주세요.'),
  (2, 'question', 50, 'action', '첫 번째 질문이 도착했어요', '최근 가장 기대되는 일을 한 사람씩 이야기해 보세요.'),
  (2, 'switch', 105, 'notice', '대화의 방향을 바꿔볼까요', '취향보다 서로 편해지는 방식에 대해 물어보세요.'),
  (2, 'closing', 155, 'closing', '오늘 장면을 마무리할게요', '안전하게 귀가한 뒤 다음 안내를 기다려 주세요.'),
  (3, 'arrival', -20, 'notice', '집결 안내가 도착했어요', '앱에서 오늘의 집결지와 이동 안내를 확인해 주세요.'),
  (3, 'opening', 0, 'reveal', '여덟 명의 저녁이 시작됐어요', '가장 가까운 사람부터 가볍게 오늘 하루를 나눠주세요.'),
  (3, 'move', 60, 'action', '다음 자리로 이동해 주세요', '앱에 표시된 방향으로 이동하고 새로운 대화를 시작해 주세요.'),
  (3, 'focus', 120, 'notice', '표정과 말투에 집중해 보세요', '결론을 내리기보다 상대가 편하게 말할 시간을 만들어 주세요.'),
  (3, 'heart', 155, 'closing', '오늘의 마음 기록이 열렸어요', '오늘 더 알아가고 싶었던 한 사람과 그 이유를 비공개로 남겨주세요.'),
  (4, 'arrival', -20, 'notice', '게임 장소가 열렸어요', '앱에서 오늘의 집결지와 이동 안내를 확인해 주세요.'),
  (4, 'opening', 0, 'reveal', '오늘의 팀이 공개됐어요', '팀원을 확인하고 첫 게임 준비를 시작해 주세요.'),
  (4, 'round-two', 45, 'action', '다음 게임을 시작해 주세요', '점수보다 팀원이 편하게 참여하는지 먼저 살펴주세요.'),
  (4, 'round-three', 100, 'action', '마지막 승부가 열렸어요', '서로 응원하면서 남은 게임을 마무리해 주세요.'),
  (4, 'rank', 155, 'closing', '결과를 기록할 시간이에요', '화면에 표시된 순위를 확인하고 팀 대표가 제출해 주세요.'),
  (5, 'arrival', -20, 'notice', '오늘의 목적지가 열렸어요', '앱에서 목적지와 안전 이탈 안내를 확인해 주세요.'),
  (5, 'opening', 0, 'reveal', '오늘은 조금 더 솔직해지는 날이에요', '공개된 이름을 천천히 불러보고 지금까지 궁금했던 점을 물어보세요.'),
  (5, 'mission', 55, 'action', '오늘의 대화 미션이 도착했어요', '서로의 평범한 하루에서 닮은 점 하나를 찾아보세요.'),
  (5, 'focus', 110, 'notice', '마지막 대화를 시작해 주세요', '부담 없는 속도로 상대의 생각을 끝까지 들어주세요.'),
  (5, 'heart', 155, 'closing', '오늘의 마음 기록이 열렸어요', '지금 더 알아가고 싶은 사람을 비공개로 남겨주세요.'),
  (6, 'date-choice-open', -420, 'action', '특별 데이트 선택이 열렸어요', '사진을 보고 함께할 한 사람에게 비공개 요청을 보내세요.'),
  (6, 'date-choice-close', -240, 'closing', '특별 데이트 요청이 마감됐어요', '도착한 요청은 오후 5시까지 수락하거나 거절할 수 있어요.'),
  (6, 'date-response-close', -120, 'notice', '응답 마감까지 2시간', '아직 답하지 않은 요청이 있다면 내 마음과 안전을 먼저 생각해 선택해 주세요.'),
  (6, 'arrival', -20, 'notice', '약속 장소가 열렸어요', '앱에서 오늘의 장소와 안전 안내를 확인해 주세요.'),
  (6, 'opening', 0, 'reveal', '둘만의 장면이 시작됐어요', '정답을 찾기보다 서로에게 편한 속도를 확인해 보세요.'),
  (6, 'question', 55, 'action', '한 가지 질문을 건네볼까요', '프로그램이 끝난 뒤 함께 해보고 싶은 평범한 일을 물어보세요.'),
  (6, 'check', 110, 'notice', '서로의 상태를 확인해 주세요', '불편하거나 피곤하면 언제든 먼저 마무리해도 괜찮아요.'),
  (6, 'closing', 155, 'closing', '오늘의 장면이 끝났어요', '안전하게 귀가한 뒤 마지막 안내를 기다려 주세요.'),
  (7, 'arrival', -20, 'notice', '마지막 집결지가 열렸어요', '앱에서 집결지와 안전 이탈 안내를 확인해 주세요.'),
  (7, 'opening', 0, 'reveal', '마지막 저녁이 시작됐어요', '지금까지의 시간을 떠올리며 한 사람씩 편하게 인사해 주세요.'),
  (7, 'move', 60, 'action', '다음 사람과 이야기해 주세요', '화면에 표시된 순서대로 자리를 바꿔주세요.'),
  (7, 'focus', 150, 'notice', '마지막 대화를 시작해 주세요', '결과를 예상하기보다 지금 전하고 싶은 말을 남겨주세요.'),
  (7, 'final', 240, 'closing', '최종 선택이 열렸어요', '거절과 선택은 모두 비공개이며 누구의 선택도 강요되지 않아요.');

CREATE TABLE public.campus_seven_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE CHECK (char_length(endpoint) BETWEEN 32 AND 2048),
  p256dh TEXT NOT NULL CHECK (char_length(p256dh) BETWEEN 32 AND 256),
  auth_secret TEXT NOT NULL CHECK (char_length(auth_secret) BETWEEN 16 AND 128),
  user_agent TEXT CHECK (user_agent IS NULL OR char_length(user_agent) <= 512),
  last_success_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX campus_seven_push_subscriptions_active_user_idx
  ON public.campus_seven_push_subscriptions(user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE public.campus_seven_push_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.campus_seven_push_subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (notification_id, subscription_id)
);

CREATE INDEX campus_seven_push_deliveries_pending_idx
  ON public.campus_seven_push_deliveries(available_at, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.campus_seven_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_seven_push_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.campus_seven_push_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.campus_seven_push_deliveries FROM anon, authenticated;
GRANT ALL ON public.campus_seven_push_subscriptions TO service_role;
GRANT ALL ON public.campus_seven_push_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.guard_campus_seven_guide_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind = 'campus_seven_guide'
    AND pg_catalog.current_setting('app.campus_seven_notification_dispatch', TRUE) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'campus_seven_notification_dispatch_required';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_campus_seven_guide_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_campus_seven_guide_notification ON public.notifications;
CREATE TRIGGER guard_campus_seven_guide_notification
  BEFORE INSERT OR UPDATE OF kind, payload ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_campus_seven_guide_notification();

CREATE OR REPLACE FUNCTION public.enqueue_campus_seven_push_deliveries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind <> 'campus_seven_guide' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.campus_seven_push_deliveries (
    notification_id, subscription_id, user_id
  )
  SELECT NEW.id, subscription.id, NEW.user_id
  FROM public.campus_seven_push_subscriptions AS subscription
  WHERE subscription.user_id = NEW.user_id
    AND subscription.revoked_at IS NULL
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_campus_seven_push_deliveries() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enqueue_campus_seven_push_deliveries ON public.notifications;
CREATE TRIGGER enqueue_campus_seven_push_deliveries
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NEW.kind = 'campus_seven_guide')
  EXECUTE FUNCTION public.enqueue_campus_seven_push_deliveries();

CREATE OR REPLACE FUNCTION public.upsert_my_campus_seven_push_subscription(
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth_secret TEXT,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_existing public.campus_seven_push_subscriptions%ROWTYPE;
  v_subscription_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF COALESCE((
    SELECT settings.notifications_enabled
    FROM public.campus_seven_program_settings AS settings
    WHERE settings.singleton = TRUE
  ), FALSE) = FALSE THEN
    RAISE EXCEPTION 'notifications_disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.campus_seven_enrollments AS enrollment
    WHERE enrollment.user_id = v_caller
      AND enrollment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_enrollment_required';
  END IF;
  IF p_endpoint !~ '^https://'
    OR char_length(p_endpoint) NOT BETWEEN 32 AND 2048
    OR char_length(p_p256dh) NOT BETWEEN 32 AND 256
    OR char_length(p_auth_secret) NOT BETWEEN 16 AND 128
    OR char_length(COALESCE(p_user_agent, '')) > 512 THEN
    RAISE EXCEPTION 'invalid_push_subscription';
  END IF;

  SELECT subscription.* INTO v_existing
  FROM public.campus_seven_push_subscriptions AS subscription
  WHERE subscription.endpoint = p_endpoint
  FOR UPDATE;

  IF FOUND AND v_existing.user_id <> v_caller AND v_existing.revoked_at IS NULL THEN
    RAISE EXCEPTION 'subscription_owned_by_another_user';
  END IF;

  INSERT INTO public.campus_seven_push_subscriptions (
    user_id, endpoint, p256dh, auth_secret, user_agent
  ) VALUES (
    v_caller, p_endpoint, p_p256dh, p_auth_secret, NULLIF(btrim(p_user_agent), '')
  )
  ON CONFLICT (endpoint) DO UPDATE
  SET user_id = v_caller,
      p256dh = EXCLUDED.p256dh,
      auth_secret = EXCLUDED.auth_secret,
      user_agent = EXCLUDED.user_agent,
      revoked_at = NULL,
      revoked_reason = NULL,
      updated_at = NOW()
  RETURNING id INTO v_subscription_id;

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_campus_seven_push_subscription(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_campus_seven_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_my_campus_seven_push_subscription(
  p_endpoint TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_updated INT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.campus_seven_push_subscriptions AS subscription
  SET revoked_at = NOW(),
      revoked_reason = 'user_unsubscribed',
      updated_at = NOW()
  WHERE subscription.user_id = v_caller
    AND subscription.endpoint = p_endpoint
    AND subscription.revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.campus_seven_push_deliveries AS delivery
  SET status = 'cancelled', updated_at = NOW()
  WHERE delivery.subscription_id IN (
    SELECT subscription.id
    FROM public.campus_seven_push_subscriptions AS subscription
    WHERE subscription.user_id = v_caller
      AND subscription.endpoint = p_endpoint
  )
    AND delivery.status IN ('pending', 'processing');

  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_campus_seven_push_subscription(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_campus_seven_push_subscription(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_campus_seven_push_readiness()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND COALESCE((
      SELECT settings.notifications_enabled
      FROM public.campus_seven_program_settings AS settings
      WHERE settings.singleton = TRUE
    ), FALSE)
    AND EXISTS (
      SELECT 1
      FROM public.campus_seven_enrollments AS enrollment
      WHERE enrollment.user_id = auth.uid()
        AND enrollment.status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.get_my_campus_seven_push_readiness() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_campus_seven_push_readiness() TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_campus_seven_push_after_exit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'active' AND (
    NEW.status = 'safety_withdrawn'
    OR NEW.status IN ('withdrawn', 'removed')
  ) THEN
    UPDATE public.campus_seven_push_subscriptions AS subscription
    SET revoked_at = NOW(),
        revoked_reason = NEW.status,
        updated_at = NOW()
    WHERE subscription.user_id = NEW.user_id
      AND subscription.revoked_at IS NULL;

    UPDATE public.campus_seven_push_deliveries AS delivery
    SET status = 'cancelled', updated_at = NOW()
    WHERE delivery.user_id = NEW.user_id
      AND delivery.status IN ('pending', 'processing');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_campus_seven_push_after_exit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS revoke_campus_seven_push_after_exit ON public.campus_seven_enrollments;
CREATE TRIGGER revoke_campus_seven_push_after_exit
  AFTER UPDATE OF status ON public.campus_seven_enrollments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.revoke_campus_seven_push_after_exit();

CREATE OR REPLACE FUNCTION public.dispatch_due_campus_seven_notifications(
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted INT := 0;
BEGIN
  IF COALESCE((
    SELECT settings.notifications_enabled
    FROM public.campus_seven_program_settings AS settings
    WHERE settings.singleton = TRUE
  ), FALSE) = FALSE THEN
    RETURN 0;
  END IF;

  PERFORM pg_catalog.set_config('app.campus_seven_notification_dispatch', 'on', TRUE);
  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'on', TRUE);

  WITH cue AS (
    SELECT
      schedule.cohort_id,
      schedule.day_number,
      guide.cue_key,
      guide.title,
      guide.body,
      schedule.starts_at + guide.offset_minutes * INTERVAL '1 minute' AS scheduled_at
    FROM public.campus_seven_daily_schedules AS schedule
    JOIN public.campus_seven_cohorts AS cohort
      ON cohort.id = schedule.cohort_id
     AND cohort.status IN ('ready', 'running')
    JOIN private.campus_seven_guide_cues AS guide
      ON guide.day_number = schedule.day_number
    JOIN public.campus_seven_program_settings AS settings
      ON settings.singleton = TRUE
     AND settings.notifications_enabled = TRUE
  ), inserted AS (
    INSERT INTO public.notifications (user_id, kind, payload)
    SELECT
      enrollment.user_id,
      'campus_seven_guide',
      jsonb_build_object(
        'cohort_id', cue.cohort_id,
        'day_number', cue.day_number,
        'cue_key', cue.cue_key,
        'title', cue.title,
        'body', cue.body,
        'scheduled_at', cue.scheduled_at,
        'route', '/match/campus-seven'
      )
    FROM cue
    JOIN public.campus_seven_enrollments AS enrollment
      ON enrollment.cohort_id = cue.cohort_id
     AND enrollment.status = 'active'
     AND enrollment.joined_day <= cue.day_number
    WHERE cue.scheduled_at <= p_now
      AND cue.scheduled_at > p_now - INTERVAL '10 minutes'
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'off', TRUE);
  PERFORM pg_catalog.set_config('app.campus_seven_notification_dispatch', 'off', TRUE);
  RETURN v_inserted;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_catalog.set_config('app.bypass_notifications_guard', 'off', TRUE);
    PERFORM pg_catalog.set_config('app.campus_seven_notification_dispatch', 'off', TRUE);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_due_campus_seven_notifications(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_due_campus_seven_notifications(TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.dispatch_due_campus_seven_notifications(TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_campus_seven_notifications(TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_campus_seven_web_push_deliveries(
  p_limit INT DEFAULT 50,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  delivery_id UUID,
  subscription_id UUID,
  endpoint TEXT,
  p256dh TEXT,
  auth_secret TEXT,
  notification_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_delivery_limit';
  END IF;
  IF COALESCE((
    SELECT settings.notifications_enabled
    FROM public.campus_seven_program_settings AS settings
    WHERE settings.singleton = TRUE
  ), FALSE) = FALSE THEN
    RETURN;
  END IF;

  UPDATE public.campus_seven_push_deliveries AS delivery
  SET status = CASE WHEN delivery.attempt_count < 3 THEN 'pending' ELSE 'failed' END,
      locked_at = NULL,
      available_at = CASE
        WHEN delivery.attempt_count < 3 THEN LEAST(delivery.available_at, p_now)
        ELSE delivery.available_at
      END,
      updated_at = p_now
  WHERE delivery.status = 'processing'
    AND delivery.locked_at <= p_now - INTERVAL '5 minutes';

  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id
    FROM public.campus_seven_push_deliveries AS delivery
    JOIN public.campus_seven_push_subscriptions AS subscription
      ON subscription.id = delivery.subscription_id
     AND subscription.revoked_at IS NULL
    WHERE delivery.status = 'pending'
      AND delivery.attempt_count < 3
      AND delivery.available_at <= p_now
    ORDER BY delivery.available_at, delivery.created_at
    FOR UPDATE OF delivery SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.campus_seven_push_deliveries AS delivery
    SET status = 'processing',
        attempt_count = delivery.attempt_count + 1,
        locked_at = p_now,
        updated_at = p_now
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.id, delivery.subscription_id, delivery.notification_id
  )
  SELECT
    claimed.id,
    subscription.id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth_secret,
    claimed.notification_id
  FROM claimed
  JOIN public.campus_seven_push_subscriptions AS subscription
    ON subscription.id = claimed.subscription_id
   AND subscription.revoked_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_campus_seven_web_push_deliveries(INT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campus_seven_web_push_deliveries(INT, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_campus_seven_web_push_delivery(
  p_delivery_id UUID,
  p_succeeded BOOLEAN,
  p_error_code TEXT DEFAULT NULL,
  p_revoke_subscription BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery public.campus_seven_push_deliveries%ROWTYPE;
BEGIN
  SELECT delivery.* INTO v_delivery
  FROM public.campus_seven_push_deliveries AS delivery
  WHERE delivery.id = p_delivery_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_delivery.status = 'sent' THEN RETURN TRUE; END IF;

  IF COALESCE(p_succeeded, FALSE) THEN
    UPDATE public.campus_seven_push_deliveries
    SET status = 'sent', sent_at = NOW(), locked_at = NULL,
        last_error_code = NULL, updated_at = NOW()
    WHERE id = p_delivery_id;

    UPDATE public.campus_seven_push_subscriptions
    SET last_success_at = NOW(), updated_at = NOW()
    WHERE id = v_delivery.subscription_id;
  ELSE
    UPDATE public.campus_seven_push_deliveries
    SET status = CASE
          WHEN COALESCE(p_revoke_subscription, FALSE) OR v_delivery.attempt_count >= 3 THEN 'failed'
          ELSE 'pending'
        END,
        available_at = CASE
          WHEN COALESCE(p_revoke_subscription, FALSE) OR v_delivery.attempt_count >= 3 THEN available_at
          ELSE NOW() + INTERVAL '5 minutes' * GREATEST(v_delivery.attempt_count, 1)
        END,
        locked_at = NULL,
        last_error_code = left(COALESCE(p_error_code, 'push_failed'), 120),
        updated_at = NOW()
    WHERE id = p_delivery_id;
  END IF;

  IF COALESCE(p_revoke_subscription, FALSE) THEN
    UPDATE public.campus_seven_push_subscriptions
    SET revoked_at = NOW(),
        revoked_reason = left(COALESCE(p_error_code, 'push_endpoint_gone'), 120),
        updated_at = NOW()
    WHERE id = v_delivery.subscription_id
      AND revoked_at IS NULL;

    UPDATE public.campus_seven_push_deliveries
    SET status = 'cancelled', updated_at = NOW()
    WHERE subscription_id = v_delivery.subscription_id
      AND status = 'pending';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_campus_seven_web_push_delivery(UUID, BOOLEAN, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_campus_seven_web_push_delivery(UUID, BOOLEAN, TEXT, BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION private.invoke_campus_seven_web_push_worker()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_request_id BIGINT;
BEGIN
  IF COALESCE((
    SELECT settings.notifications_enabled
    FROM public.campus_seven_program_settings AS settings
    WHERE settings.singleton = TRUE
  ), FALSE) = FALSE THEN
    RETURN NULL;
  END IF;

  SELECT secret.decrypted_secret INTO v_url
  FROM vault.decrypted_secrets AS secret
  WHERE secret.name = 'campus_seven_web_push_url'
  ORDER BY secret.created_at DESC
  LIMIT 1;

  SELECT secret.decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets AS secret
  WHERE secret.name = 'campus_seven_web_push_secret'
  ORDER BY secret.created_at DESC
  LIMIT 1;

  IF NULLIF(v_url, '') IS NULL OR v_url !~ '^https://'
    OR NULLIF(v_secret, '') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('requested_at', NOW()),
    timeout_milliseconds := 10000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_campus_seven_web_push_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.invoke_campus_seven_web_push_worker() TO service_role;

SELECT cron.schedule(
  'campus-seven-guide-notifications',
  '* * * * *',
  'SELECT public.dispatch_due_campus_seven_notifications();'
);

SELECT cron.schedule(
  'campus-seven-web-push-deliveries',
  '* * * * *',
  'SELECT private.invoke_campus_seven_web_push_worker();'
);

COMMIT;
