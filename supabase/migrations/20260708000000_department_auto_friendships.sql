-- Department auto-friend sync for group formation.
-- Creates active friendships between the authenticated user and users who share
-- the exact normalized school + department pair.

CREATE OR REPLACE FUNCTION public.sync_department_friendships(
  p_limit INT DEFAULT 24
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  school TEXT,
  department TEXT,
  created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_school TEXT;
  v_department TEXT;
  v_limit INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT
    NULLIF(regexp_replace(btrim(p.school), '[[:space:]]+', ' ', 'g'), ''),
    NULLIF(regexp_replace(btrim(p.department), '[[:space:]]+', ' ', 'g'), '')
    INTO v_school, v_department
  FROM public.profiles AS p
  WHERE p.user_id = v_caller;

  IF v_school IS NULL THEN
    RAISE EXCEPTION 'profile_school_required';
  END IF;

  IF v_department IS NULL THEN
    RAISE EXCEPTION 'profile_department_required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 50);

  PERFORM set_config('app.bypass_friendships_guard', 'on', TRUE);

  RETURN QUERY
  WITH candidates AS (
    SELECT
      p.user_id AS candidate_user_id,
      p.display_name,
      p.school,
      p.department
    FROM public.profiles AS p
    WHERE p.user_id <> v_caller
      AND NULLIF(regexp_replace(btrim(p.school), '[[:space:]]+', ' ', 'g'), '') IS NOT NULL
      AND NULLIF(regexp_replace(btrim(p.department), '[[:space:]]+', ' ', 'g'), '') IS NOT NULL
      AND lower(regexp_replace(btrim(p.school), '[[:space:]]+', ' ', 'g')) = lower(v_school)
      AND lower(regexp_replace(btrim(p.department), '[[:space:]]+', ' ', 'g')) = lower(v_department)
      AND NOT EXISTS (
        SELECT 1
        FROM public.friendships AS f
        WHERE f.status = 'blocked'
          AND f.user_id = LEAST(v_caller, p.user_id)
          AND f.friend_user_id = GREATEST(v_caller, p.user_id)
      )
    ORDER BY p.updated_at DESC NULLS LAST, p.user_id
    LIMIT v_limit
  ),
  inserted AS (
    INSERT INTO public.friendships AS f (
      user_id,
      friend_user_id,
      status,
      created_from_request_id
    )
    SELECT
      LEAST(v_caller, c.candidate_user_id),
      GREATEST(v_caller, c.candidate_user_id),
      'active',
      NULL
    FROM candidates AS c
    ON CONFLICT ON CONSTRAINT friendships_pkey DO NOTHING
    RETURNING
      CASE
        WHEN f.user_id = v_caller THEN f.friend_user_id
        ELSE f.user_id
      END AS candidate_user_id
  )
  SELECT
    c.candidate_user_id,
    c.display_name,
    c.school,
    c.department,
    EXISTS (
      SELECT 1
      FROM inserted AS i
      WHERE i.candidate_user_id = c.candidate_user_id
    ) AS created
  FROM candidates AS c
  ORDER BY
    EXISTS (
      SELECT 1
      FROM inserted AS i
      WHERE i.candidate_user_id = c.candidate_user_id
    ) DESC,
    c.display_name NULLS LAST,
    c.candidate_user_id;

  PERFORM set_config('app.bypass_friendships_guard', 'off', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_department_friendships(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_department_friendships(INT) TO authenticated;

COMMENT ON FUNCTION public.sync_department_friendships(INT) IS
  'Authenticated user can one-tap connect active friendships with same normalized school and department users. Returns safe profile fields only.';
