BEGIN;

-- These two read paths are public product experiences, but browser roles do
-- not need direct access to their SECURITY DEFINER functions. Next.js API
-- routes call them with the server-only service key and return a small schema.
CREATE OR REPLACE FUNCTION public.get_group_invite_by_token(
  p_token TEXT
)
RETURNS TABLE (
  invite_id UUID,
  group_id UUID,
  group_name TEXT,
  group_size INT,
  group_status TEXT,
  invite_status TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    invite.id,
    invite.group_id,
    event_group.name,
    event_group.size,
    event_group.status,
    invite.status,
    invite.expires_at
  FROM public.group_invites AS invite
  JOIN public.groups AS event_group
    ON event_group.id = invite.group_id
  WHERE invite.token = p_token
    AND invite.status = 'pending'
    AND invite.expires_at > CURRENT_TIMESTAMP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_match_pool_stats()
RETURNS TABLE (
  gender TEXT,
  group_size INT,
  group_count INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH active_pool AS (
    SELECT
      pool.group_id,
      event_group.size::INT AS group_size,
      event_group.gender::TEXT AS fallback_gender
    FROM public.match_pool AS pool
    JOIN public.groups AS event_group
      ON event_group.id = pool.group_id
    WHERE pool.status IN ('waiting', 'rolled_over')
  ),
  member_gender_counts AS (
    SELECT
      active.group_id,
      active.group_size,
      active.fallback_gender,
      COUNT(member.user_id) FILTER (
        WHERE member.left_at IS NULL AND profile.gender = 'male'
      )::INT AS male_members,
      COUNT(member.user_id) FILTER (
        WHERE member.left_at IS NULL AND profile.gender = 'female'
      )::INT AS female_members
    FROM active_pool AS active
    LEFT JOIN public.group_members AS member
      ON member.group_id = active.group_id
     AND member.left_at IS NULL
    LEFT JOIN public.profiles AS profile
      ON profile.user_id = member.user_id
    GROUP BY active.group_id, active.group_size, active.fallback_gender
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

REVOKE EXECUTE ON FUNCTION public.get_group_invite_by_token(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_match_pool_stats()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_group_invite_by_token(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_match_pool_stats()
  TO service_role;

COMMENT ON FUNCTION public.get_group_invite_by_token(TEXT) IS
  'Server-only lookup returning safe pending invite fields for an opaque token.';
COMMENT ON FUNCTION public.get_match_pool_stats() IS
  'Server-only aggregate match-pool counts without group or user identifiers.';

COMMIT;
