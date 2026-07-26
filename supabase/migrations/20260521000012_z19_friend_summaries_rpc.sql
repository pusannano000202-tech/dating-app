-- Migration: 본인의 친구 요약 정보 (display_name 포함) 안전 RPC
-- Owner:  충현
-- Decision: profiles RLS 는 본인만 SELECT 허용이므로 친구 display_name 조회 경로가 없음.
--           profiles_public view 도 RLS 그대로라 동일. SECURITY DEFINER RPC 로 안전 필드만 노출.
-- Date:   2026-05-21
--
-- 노출 범위:
--   - 호출자가 active 친구인 user_id 의 display_name 만 반환
--   - 외모 점수/벡터/big5 등은 절대 노출 안 함
--
-- 사용처:
--   - /api/groups loadFriends
--   - 향후 /friends 페이지

CREATE OR REPLACE FUNCTION public.get_friend_summaries()
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    CASE WHEN f.user_id = auth.uid() THEN f.friend_user_id ELSE f.user_id END AS user_id,
    p.display_name,
    f.status::TEXT
  FROM friendships f
  LEFT JOIN profiles p
    ON p.user_id = (CASE WHEN f.user_id = auth.uid() THEN f.friend_user_id ELSE f.user_id END)
  WHERE f.status = 'active'
    AND (f.user_id = auth.uid() OR f.friend_user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_summaries() TO authenticated;

COMMENT ON FUNCTION public.get_friend_summaries() IS
  '본인의 active 친구 요약 (user_id, display_name, status) 만 반환. raw profile 컬럼 미노출.';
