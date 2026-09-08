-- Keep authorization, audit throttling, masked account lookup, and safe venue
-- lookup inside one caller-bound database transaction.

BEGIN;

CREATE INDEX IF NOT EXISTS tonight_directory_users_email_prefix_idx
  ON public.users ((pg_catalog.lower(email)) pg_catalog.text_pattern_ops)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS tonight_directory_users_school_email_prefix_idx
  ON public.users ((pg_catalog.lower(school_email)) pg_catalog.text_pattern_ops)
  WHERE school_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS tonight_directory_profiles_display_name_prefix_idx
  ON public.profiles ((pg_catalog.lower(display_name)) pg_catalog.text_pattern_ops)
  WHERE display_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS tonight_directory_venues_name_prefix_idx
  ON public.venues ((pg_catalog.lower(name)) pg_catalog.text_pattern_ops);

CREATE INDEX IF NOT EXISTS tonight_directory_venues_address_prefix_idx
  ON public.venues ((pg_catalog.lower(address)) pg_catalog.text_pattern_ops);

CREATE INDEX IF NOT EXISTS tonight_directory_venues_area_prefix_idx
  ON public.venues ((pg_catalog.lower(area)) pg_catalog.text_pattern_ops)
  WHERE area IS NOT NULL;

CREATE OR REPLACE FUNCTION public.super_admin_search_tonight_directory(
  p_query TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_query TEXT := pg_catalog.btrim(COALESCE(p_query, ''));
  v_prefix_pattern TEXT;
  v_exact_user_id UUID;
  v_users JSONB;
  v_venues JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF pg_catalog.char_length(v_query) NOT BETWEEN 2 AND 80
    OR v_query !~ '^[0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ@.+[:space:]-]{2,80}$'
  THEN
    RAISE EXCEPTION 'invalid_directory_query';
  END IF;

  -- Searches may share this lock, while the canonical grant/revoke RPCs take
  -- the same key exclusively. A committed revocation is observed below and a
  -- later mutation waits only for the bounded reads already in flight.
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('quantum:admin-role-mutation', 0)
  );
  PERFORM public.authorize_tonight_sensitive_read(
    'super_admin_directory',
    NULL
  );

  v_prefix_pattern := pg_catalog.lower(v_query) || '%';
  IF v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_exact_user_id := v_query::UUID;
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'user_id', account.user_id,
        'display_name', account.display_name,
        'school', account.school,
        'department', account.department,
        'email_hint', CASE
          WHEN account.email_local <> '' AND account.email_domain <> ''
          THEN pg_catalog.left(account.email_local, 2) || '***@' || account.email_domain
          ELSE NULL
        END
      )
      ORDER BY account.match_priority, account.user_id
    ),
    '[]'::JSONB
  )
  INTO v_users
  FROM (
    SELECT
      candidate.*,
      pg_catalog.split_part(candidate.preferred_email, '@', 1) AS email_local,
      pg_catalog.split_part(candidate.preferred_email, '@', 2) AS email_domain
    FROM (
      SELECT DISTINCT ON (matched.user_id)
        matched.user_id,
        matched.display_name,
        matched.school,
        matched.department,
        matched.preferred_email,
        matched.match_priority
      FROM (
        SELECT
          user_row.id AS user_id,
          profile.display_name,
          profile.school,
          profile.department,
          COALESCE(user_row.school_email, user_row.email) AS preferred_email,
          0 AS match_priority
        FROM public.users AS user_row
        LEFT JOIN public.profiles AS profile
          ON profile.user_id = user_row.id
        WHERE v_exact_user_id IS NOT NULL
          AND user_row.id = v_exact_user_id

        UNION ALL

        SELECT
          user_row.id,
          profile.display_name,
          profile.school,
          profile.department,
          COALESCE(user_row.school_email, user_row.email),
          0
        FROM public.users AS user_row
        LEFT JOIN public.profiles AS profile
          ON profile.user_id = user_row.id
        WHERE v_exact_user_id IS NULL
          AND user_row.email IS NOT NULL
          AND pg_catalog.lower(user_row.email) LIKE v_prefix_pattern

        UNION ALL

        SELECT
          user_row.id,
          profile.display_name,
          profile.school,
          profile.department,
          COALESCE(user_row.school_email, user_row.email),
          0
        FROM public.users AS user_row
        LEFT JOIN public.profiles AS profile
          ON profile.user_id = user_row.id
        WHERE v_exact_user_id IS NULL
          AND user_row.school_email IS NOT NULL
          AND pg_catalog.lower(user_row.school_email) LIKE v_prefix_pattern

        UNION ALL

        SELECT
          user_row.id,
          profile.display_name,
          profile.school,
          profile.department,
          COALESCE(user_row.school_email, user_row.email),
          1
        FROM public.profiles AS profile
        JOIN public.users AS user_row
          ON user_row.id = profile.user_id
        WHERE profile.display_name IS NOT NULL
          AND pg_catalog.lower(profile.display_name) LIKE v_prefix_pattern
      ) AS matched
      ORDER BY matched.user_id, matched.match_priority
    ) AS candidate
    ORDER BY candidate.match_priority, candidate.user_id
    LIMIT 20
  ) AS account;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', venue.id,
        'name', venue.name,
        'category', venue.category,
        'address', venue.address,
        'area', venue.area,
        'status', venue.status
      )
      ORDER BY venue.name, venue.id
    ),
    '[]'::JSONB
  )
  INTO v_venues
  FROM (
    SELECT venue_candidates.*
    FROM (
      SELECT DISTINCT ON (matched.id)
        matched.id,
        matched.name,
        matched.category,
        matched.address,
        matched.area,
        matched.status
      FROM (
        SELECT
          venue_row.id,
          venue_row.name,
          venue_row.category,
          venue_row.address,
          venue_row.area,
          venue_row.status
        FROM public.venues AS venue_row
        WHERE pg_catalog.lower(venue_row.name) LIKE v_prefix_pattern

        UNION ALL

        SELECT
          venue_row.id,
          venue_row.name,
          venue_row.category,
          venue_row.address,
          venue_row.area,
          venue_row.status
        FROM public.venues AS venue_row
        WHERE pg_catalog.lower(venue_row.address) LIKE v_prefix_pattern

        UNION ALL

        SELECT
          venue_row.id,
          venue_row.name,
          venue_row.category,
          venue_row.address,
          venue_row.area,
          venue_row.status
        FROM public.venues AS venue_row
        WHERE venue_row.area IS NOT NULL
          AND pg_catalog.lower(venue_row.area) LIKE v_prefix_pattern
      ) AS matched
      ORDER BY matched.id
    ) AS venue_candidates
    ORDER BY venue_candidates.name, venue_candidates.id
    LIMIT 20
  ) AS venue;

  RETURN pg_catalog.jsonb_build_object(
    'users', v_users,
    'venues', v_venues
  );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_search_tonight_directory(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_search_tonight_directory(TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.super_admin_search_tonight_directory(TEXT) IS
  'Recent-auth super-admin directory with atomic audit, masked account hints, safe venue facts, and 20-row bounds.';

COMMIT;
