-- Migration: 받은/보낸 친구 요청에 sender/receiver display_name 안전 노출 RPC
-- Owner:  충현
-- Decision: /friends 페이지의 받은 요청 카드에 sender 이름 표시
-- Date:   2026-05-21
--
-- 배경:
--   - friend_requests SELECT 는 정책으로 가능
--   - 그러나 sender_user_id 가 본인 친구가 아니면 profiles 직접 SELECT 불가
--   - SECURITY DEFINER RPC 가 안전 컬럼만 join 해서 반환

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
STABLE
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

COMMENT ON FUNCTION public.get_friend_request_summaries() IS
  '본인 sender/receiver/대기 phone 인 friend_request 들 + sender/receiver display_name 안전 반환.';
