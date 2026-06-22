-- Migration: expose mixed-group match-pool stats.
-- Purpose:
--   The product supports 2:2 and 3:3 groups, including mixed-gender groups.
--   The previous stats RPC only returned groups.gender, which is a leader/profile
--   fallback and cannot represent male+female members in the same group.
--
-- Notes:
--   - Output signature stays compatible: (gender, group_size, group_count).
--   - gender can now be 'mixed' in addition to 'male' and 'female'.
--   - Individual group/member details remain hidden; only aggregate counts return.

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
  WITH active_pool AS (
    SELECT
      mp.group_id,
      g.size::INT AS group_size,
      g.gender::TEXT AS fallback_gender
    FROM public.match_pool mp
    JOIN public.groups g
      ON g.id = mp.group_id
    WHERE mp.status IN ('waiting', 'rolled_over')
  ),
  member_gender_counts AS (
    SELECT
      ap.group_id,
      ap.group_size,
      ap.fallback_gender,
      COUNT(gm.user_id) FILTER (
        WHERE gm.left_at IS NULL AND p.gender = 'male'
      )::INT AS male_members,
      COUNT(gm.user_id) FILTER (
        WHERE gm.left_at IS NULL AND p.gender = 'female'
      )::INT AS female_members
    FROM active_pool ap
    LEFT JOIN public.group_members gm
      ON gm.group_id = ap.group_id
     AND gm.left_at IS NULL
    LEFT JOIN public.profiles p
      ON p.user_id = gm.user_id
    GROUP BY ap.group_id, ap.group_size, ap.fallback_gender
  ),
  classified AS (
    SELECT
      CASE
        WHEN male_members > 0 AND female_members > 0 THEN 'mixed'
        WHEN male_members > 0 THEN 'male'
        WHEN female_members > 0 THEN 'female'
        ELSE fallback_gender
      END AS gender,
      group_size
    FROM member_gender_counts
  )
  SELECT
    classified.gender,
    classified.group_size,
    COUNT(*)::INT AS group_count
  FROM classified
  WHERE classified.group_size IN (2, 3)
    AND classified.gender IN ('male', 'female', 'mixed')
  GROUP BY classified.gender, classified.group_size;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_pool_stats() TO anon, authenticated;

COMMENT ON FUNCTION public.get_match_pool_stats() IS
  'Weekly matching pool aggregate stats by group size and member composition. Returns gender=male/female/mixed without exposing individual groups.';
