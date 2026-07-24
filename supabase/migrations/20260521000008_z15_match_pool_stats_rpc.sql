-- Migration: match_pool 집계 통계 RPC
-- Owner:  충현
-- Decision: Codex 코드리뷰 #8 / MASTER_PLAN_V1_6 Task E
-- Date:   2026-05-21
--
-- 목적:
--   - 홈 랜딩 페이지 MatchingPool 컴포넌트의 하드코딩 { female: 12, male: 9 } 제거
--   - match_pool RLS 는 본인 그룹만 SELECT 허용하므로 일반 user 가 전체 풀 통계 못 봄
--   - 집계값만 노출하는 SECURITY DEFINER RPC 로 anon/authenticated 모두에게 공개
--
-- 노출 범위:
--   - 집계값만 (gender × group_size 별 그룹 수)
--   - 개별 그룹/유저 식별 정보는 노출하지 않음
--
-- 호출:
--   SELECT * FROM public.get_match_pool_stats();
--   → rows: (gender TEXT, group_size INT, group_count INT)

CREATE OR REPLACE FUNCTION public.get_match_pool_stats()
RETURNS TABLE (
  gender TEXT,
  group_size INT,
  group_count INT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    g.gender::TEXT      AS gender,
    g.size::INT         AS group_size,
    COUNT(*)::INT       AS group_count
  FROM match_pool mp
  JOIN groups g ON g.id = mp.group_id
  WHERE mp.status IN ('waiting', 'rolled_over')
  GROUP BY g.gender, g.size;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_pool_stats() TO anon, authenticated;

COMMENT ON FUNCTION public.get_match_pool_stats() IS
  '주간 매칭 큐 집계. 개별 식별 정보 미노출. 랜딩 페이지 MatchingPool 시각화용.';
