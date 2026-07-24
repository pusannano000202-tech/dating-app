-- Migration: 친구 요청 / 친구 관계 흐름 완성
-- Owner:  충현
-- Decision: MASTER_PLAN_V1_6 12.B (Friend search/request UI)
-- Date:   2026-05-21
--
-- 추가 항목:
--   1) friend_requests SELECT 정책 확장: 본인 phone 으로 온 receiver_user_id NULL 요청도 볼 수 있게
--   2) auto_set_friend_request_receiver 트리거:
--      INSERT 시 receiver_phone 이 가입자의 phone 과 일치하면 receiver_user_id 자동 매핑
--   3) match_pending_friend_requests_on_signup 트리거:
--      신규 가입 시 receiver_phone 으로 대기 중이던 요청의 receiver_user_id 갱신
--   4) friendships INSERT/UPDATE 정책 bypass guard 추가 (12.E 패턴 통일)
--   5) accept_friend_request(p_request_id) SECURITY DEFINER RPC:
--      receiver 가 호출. status='accepted' + friendships row insert (정규화 + bypass)
--   6) cancel_friend_request(p_request_id) SECURITY DEFINER RPC:
--      sender 가 호출. status='cancelled'

-- ─────────────────────────────────────────────
-- 1. friend_requests SELECT 정책 확장
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "friend_requests_participant_read" ON friend_requests;

CREATE POLICY "friend_requests_participant_read" ON friend_requests
  FOR SELECT TO authenticated
  USING (
    sender_user_id = auth.uid()
    OR receiver_user_id = auth.uid()
    OR (
      receiver_user_id IS NULL
      AND receiver_phone IS NOT NULL
      AND receiver_phone = (SELECT phone FROM public.users WHERE id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────
-- 2. auto_set_friend_request_receiver 트리거
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_set_friend_request_receiver()
RETURNS TRIGGER AS $$
DECLARE
  v_user UUID;
BEGIN
  IF NEW.receiver_user_id IS NULL AND NEW.receiver_phone IS NOT NULL THEN
    SELECT id INTO v_user FROM public.users WHERE phone = NEW.receiver_phone LIMIT 1;
    IF v_user IS NOT NULL THEN
      IF v_user = NEW.sender_user_id THEN
        RAISE EXCEPTION 'cannot_send_to_self';
      END IF;
      NEW.receiver_user_id := v_user;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_friend_requests_auto_match ON friend_requests;
CREATE TRIGGER trg_friend_requests_auto_match
  BEFORE INSERT ON friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_friend_request_receiver();

-- ─────────────────────────────────────────────
-- 3. 가입 시 대기 요청 매칭 트리거 (public.users)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_pending_friend_requests_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    UPDATE friend_requests
       SET receiver_user_id = NEW.id
     WHERE receiver_phone = NEW.phone
       AND receiver_user_id IS NULL
       AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_users_match_friend_requests ON public.users;
CREATE TRIGGER trg_users_match_friend_requests
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.match_pending_friend_requests_on_signup();

-- ─────────────────────────────────────────────
-- 4. friendships INSERT 정책 bypass guard 통일
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "friendships_via_accepted_request_insert" ON friendships;

CREATE POLICY "friendships_via_accepted_request_insert" ON friendships
  FOR INSERT TO authenticated
  WITH CHECK (
    current_setting('app.bypass_friendships_guard', TRUE) = 'on'
    OR (
      (user_id = auth.uid() OR friend_user_id = auth.uid())
      AND created_from_request_id IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM friend_requests fr
         WHERE fr.id = friendships.created_from_request_id
           AND fr.status = 'accepted'
           AND (
             (fr.sender_user_id = friendships.user_id        AND fr.receiver_user_id = friendships.friend_user_id)
             OR
             (fr.sender_user_id = friendships.friend_user_id AND fr.receiver_user_id = friendships.user_id)
           )
      )
    )
  );

-- friendships guard trigger 도 bypass 통과 분기 추가
CREATE OR REPLACE FUNCTION public.guard_friendships_update()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.bypass_friendships_guard', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id                  IS DISTINCT FROM OLD.user_id
     OR NEW.friend_user_id          IS DISTINCT FROM OLD.friend_user_id
     OR NEW.created_from_request_id IS DISTINCT FROM OLD.created_from_request_id
     OR NEW.created_at              IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'friendships: users may only change status';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- 5. accept_friend_request RPC
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_friend_request(
  p_request_id UUID
)
RETURNS TABLE (
  request_id UUID,
  user_id UUID,
  friend_user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_request friend_requests%ROWTYPE;
  v_user UUID;
  v_friend UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_request
    FROM friend_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending';
  END IF;

  IF v_request.expires_at <= NOW() THEN
    UPDATE friend_requests SET status = 'expired' WHERE id = p_request_id;
    RAISE EXCEPTION 'request_expired';
  END IF;

  -- 호출자 검증: receiver_user_id 가 본인이거나, NULL 인데 본인 phone 이 일치
  IF v_request.receiver_user_id IS NOT NULL THEN
    IF v_request.receiver_user_id <> v_caller THEN
      RAISE EXCEPTION 'not_receiver';
    END IF;
  ELSIF v_request.receiver_phone IS NOT NULL THEN
    IF v_request.receiver_phone <> (SELECT phone FROM public.users WHERE id = v_caller) THEN
      RAISE EXCEPTION 'not_receiver';
    END IF;
  ELSE
    RAISE EXCEPTION 'request_no_receiver';
  END IF;

  -- receiver_user_id 가 NULL 이면 v_caller 로 채움
  IF v_request.receiver_user_id IS NULL THEN
    UPDATE friend_requests
       SET receiver_user_id = v_caller,
           status = 'accepted',
           responded_at = NOW()
     WHERE id = p_request_id;
  ELSE
    UPDATE friend_requests
       SET status = 'accepted',
           responded_at = NOW()
     WHERE id = p_request_id;
  END IF;

  -- friendships insert (정규화: user_id < friend_user_id)
  IF v_request.sender_user_id < v_caller THEN
    v_user := v_request.sender_user_id;
    v_friend := v_caller;
  ELSE
    v_user := v_caller;
    v_friend := v_request.sender_user_id;
  END IF;

  PERFORM set_config('app.bypass_friendships_guard', 'on', TRUE);
  INSERT INTO friendships (user_id, friend_user_id, status, created_from_request_id)
  VALUES (v_user, v_friend, 'active', p_request_id)
  ON CONFLICT (user_id, friend_user_id) DO NOTHING;
  PERFORM set_config('app.bypass_friendships_guard', 'off', TRUE);

  RETURN QUERY
  SELECT p_request_id, v_user, v_friend;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- 6. cancel_friend_request RPC (sender)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_friend_request(
  p_request_id UUID
)
RETURNS TABLE (
  request_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_request friend_requests%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
    INTO v_request
    FROM friend_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_request.sender_user_id <> v_caller THEN
    RAISE EXCEPTION 'not_sender';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending';
  END IF;

  UPDATE friend_requests
     SET status = 'cancelled',
         responded_at = NOW()
   WHERE id = p_request_id;

  RETURN QUERY
  SELECT p_request_id, 'cancelled'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_friend_request(UUID) TO authenticated;

COMMENT ON FUNCTION public.accept_friend_request(UUID) IS
  '수신자가 호출. friend_request status pending -> accepted + friendships row insert (정규화).';
COMMENT ON FUNCTION public.cancel_friend_request(UUID) IS
  '발신자가 호출. friend_request status pending -> cancelled.';
COMMENT ON TRIGGER trg_friend_requests_auto_match ON friend_requests IS
  'INSERT 시 receiver_phone 으로 가입자 매칭되면 receiver_user_id 자동 set.';
COMMENT ON TRIGGER trg_users_match_friend_requests ON public.users IS
  '신규 가입 시 receiver_phone 으로 대기 중이던 friend_request 의 receiver_user_id 갱신.';
