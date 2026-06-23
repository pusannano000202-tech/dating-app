-- Migration: 그룹 활성 멤버별 보증금 상태 요약 RPC
-- Owner:  충현
-- Decision: MASTER_PLAN_V1_6 12.C follow-up (다른 멤버 결제 상태 UI 노출)
-- Date:   2026-05-21
--
-- 배경:
--   - deposits RLS (deposits_self) 는 본인 row 만 SELECT 허용
--   - 그룹 리더가 "다른 멤버가 결제했는지" 알 방법이 없음
--   - 매칭 큐 진입 전제조건이라 노출 필요
--
-- 노출 범위:
--   - 호출자가 그룹 active 멤버일 때만, 같은 그룹의 active 멤버 + 각자의
--     보증금 status (paid/held/pending/null) 만 반환
--   - amount / toss_payment_key / paid_at 등 결제 메타는 미노출

CREATE OR REPLACE FUNCTION public.get_group_deposit_summary(
  p_group_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  role TEXT,
  deposit_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_members gm
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
    COALESCE(
      (
        SELECT d.status::TEXT
          FROM deposits d
         WHERE d.group_id = p_group_id
           AND d.user_id = gm.user_id
           AND d.status IN ('paid', 'held', 'pending')
         ORDER BY d.created_at DESC
         LIMIT 1
      ),
      'none'
    ) AS deposit_status
  FROM group_members gm
  LEFT JOIN profiles p ON p.user_id = gm.user_id
  WHERE gm.group_id = p_group_id
    AND gm.left_at IS NULL
  ORDER BY gm.joined_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_deposit_summary(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_group_deposit_summary(UUID) IS
  '호출자가 그룹 active 멤버일 때만 같은 그룹의 멤버 + 보증금 status 반환. amount/메타 미노출.';
