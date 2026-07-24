-- Migration: friend_request 만료 lazy expire 처리
-- Owner:  충현
-- Decision: 14일 expires_at 지난 pending 요청이 status 'pending' 그대로 유지되는 한계 (STATUS_2026-05-22 알려진 한계 #5)
-- Date:   2026-05-22
--
-- 변경:
--   1. expire_overdue_friend_requests() 명시 RPC 추가 (admin/cron 용도)
--      - status='pending' AND expires_at < NOW() 인 행 status='expired' 로 일괄 갱신
--      - 영향 row 수 반환
--   2. get_friend_request_summaries() 갱신
--      - 본인 sender/receiver/phone 매칭 요청 중 expired 대상 lazy 갱신 후 select
--   3. accept_friend_request 는 이미 expires_at 체크 + expire 처리 있음 (z23) — 변경 없음
--
-- 의존:
--   - z23 friend_requests 정책 + accept_friend_request RPC
--   - z26 get_friend_request_summaries
--   - z22 set_config(app.bypass_*) 패턴 (필요 시)
--
-- 비고:
--   - friend_requests UPDATE 정책은 별도 없음 — z23 까지의 흐름에서는 status 갱신을
--     RPC 본문(security definer) 에서만 수행하므로 RLS 미적용 (bypass guard 불필요)

CREATE OR REPLACE FUNCTION public.expire_overdue_friend_requests()
RETURNS TABLE (
  expired_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE friend_requests
     SET status = 'expired'
   WHERE status = 'pending'
     AND expires_at IS NOT NULL
     AND expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_overdue_friend_requests() TO authenticated;

-- get_friend_request_summaries: caller 본인 관련 요청만 lazy expire 후 반환
CREATE OR REPLACE FUNCTION public.get_friend_request_summaries()
RETURNS TABLE (
  request_id UUID,
  sender_user_id UUID,
  receiver_user_id UUID,
  receiver_phone TEXT,
  sender_display_name TEXT,
  receiver_display_name TEXT,
  status TEXT,
  message TEXT,
  expires_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  is_sender BOOLEAN,
  is_receiver BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_phone TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT u.phone INTO v_phone FROM public.users u WHERE u.id = v_caller;

  -- caller 관련 요청 중 만료된 pending 만 expire 갱신 (전역 batch 는 별도 RPC 로)
  UPDATE friend_requests
     SET status = 'expired'
   WHERE status = 'pending'
     AND expires_at IS NOT NULL
     AND expires_at < NOW()
     AND (
       sender_user_id = v_caller
       OR receiver_user_id = v_caller
       OR (
         receiver_user_id IS NULL
         AND v_phone IS NOT NULL
         AND receiver_phone = v_phone
       )
     );

  RETURN QUERY
  SELECT
    fr.id,
    fr.sender_user_id,
    fr.receiver_user_id,
    fr.receiver_phone,
    ps.display_name AS sender_display_name,
    pr.display_name AS receiver_display_name,
    fr.status::TEXT,
    fr.message,
    fr.expires_at,
    fr.responded_at,
    fr.created_at,
    (fr.sender_user_id = v_caller) AS is_sender,
    (
      fr.receiver_user_id = v_caller
      OR (fr.receiver_user_id IS NULL AND v_phone IS NOT NULL AND fr.receiver_phone = v_phone)
    ) AS is_receiver
  FROM friend_requests fr
  LEFT JOIN profiles ps ON ps.user_id = fr.sender_user_id
  LEFT JOIN profiles pr ON pr.user_id = fr.receiver_user_id
  WHERE
    fr.sender_user_id = v_caller
    OR fr.receiver_user_id = v_caller
    OR (
      fr.receiver_user_id IS NULL
      AND v_phone IS NOT NULL
      AND fr.receiver_phone = v_phone
    )
  ORDER BY fr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_request_summaries() TO authenticated;

COMMENT ON FUNCTION public.expire_overdue_friend_requests() IS
  '모든 만료된 pending friend_request 를 expired 로 일괄 갱신. cron / admin 용.';
COMMENT ON FUNCTION public.get_friend_request_summaries() IS
  '본인 관련 friend_request 들 + sender/receiver display_name 안전 반환. 호출 시 lazy expire 처리.';
