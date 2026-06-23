-- Migration: 그룹 멤버 요약 (display_name 포함) 안전 RPC
-- Owner:  충현
-- Decision: 그룹 UI 에서 멤버 이름을 "친구 abcd" placeholder 가 아닌 실제 display_name 으로 표시.
-- Date:   2026-05-21
--
-- 배경:
--   - profiles RLS 는 본인 row 만 SELECT 허용
--   - 같은 그룹 멤버라도 profile 의 display_name 을 client 에서 직접 SELECT 불가
--   - get_friend_summaries 는 친구 관계 기준 — 그룹 멤버는 친구가 아닐 수도 있음
--     (예: 초대 링크로 들어온 멤버)
--
-- 노출 범위:
--   - 호출자가 해당 그룹의 active 멤버일 때만, 같은 그룹의 active 멤버 정보 반환
--   - user_id, display_name, role 만 노출. 외모 점수 / 벡터 / big5 등은 노출 안 함

CREATE OR REPLACE FUNCTION public.get_group_member_summaries(
  p_group_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM group_members gm
     WHERE gm.group_id = p_group_id
       AND gm.user_id = auth.uid()
       AND gm.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_group_member';
  END IF;

  RETURN QUERY
  SELECT
    gm.user_id,
    p.display_name,
    gm.role::TEXT,
    gm.joined_at
  FROM group_members gm
  LEFT JOIN profiles p ON p.user_id = gm.user_id
  WHERE gm.group_id = p_group_id
    AND gm.left_at IS NULL
  ORDER BY gm.joined_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_member_summaries(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_group_member_summaries(UUID) IS
  '호출자가 그룹 active 멤버일 때만 같은 그룹의 active 멤버 summary 반환. raw profile 컬럼 미노출.';
