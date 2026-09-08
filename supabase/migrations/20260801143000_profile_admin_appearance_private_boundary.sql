BEGIN;

-- Keep administrator corrections beside the service-owned automatic score.
-- score_effective is the canonical 0-100 value for privileged consumers.
ALTER TABLE public.private_appearance_scores
  ADD COLUMN score_override DOUBLE PRECISION
    CHECK (score_override IS NULL OR score_override BETWEEN 0 AND 100),
  ADD COLUMN score_effective DOUBLE PRECISION
    GENERATED ALWAYS AS (COALESCE(score_override, score_raw)) STORED;

COMMENT ON COLUMN public.private_appearance_scores.score_override IS
  'Administrator correction in the 0-100 range. NULL means use the automatic score.';
COMMENT ON COLUMN public.private_appearance_scores.score_effective IS
  'Privileged effective score: administrator override first, otherwise automatic score_raw.';

CREATE OR REPLACE FUNCTION public.sync_private_appearance_score_effective()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.score_normalized := COALESCE(NEW.score_override, NEW.score_raw) / 100.0;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_private_appearance_score_effective
  BEFORE INSERT OR UPDATE OF score_raw, score_override
  ON public.private_appearance_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_private_appearance_score_effective();

-- Preserve an active legacy override when the latest audit action was a set.
-- During the expand phase, prefer the current automatic profile score and use
-- the first override audit value only as a recovery fallback.
WITH latest_audit AS (
  SELECT DISTINCT ON (audit.user_id)
    audit.user_id,
    audit.id,
    audit.source,
    audit.new_effective,
    audit.created_at
  FROM public.appearance_score_audits AS audit
  ORDER BY audit.user_id, audit.created_at DESC, audit.id DESC
), active_audit AS (
  SELECT
    latest.user_id,
    latest.id,
    latest.new_effective,
    latest.created_at,
    (
      SELECT MAX(cleared.id)
      FROM public.appearance_score_audits AS cleared
      WHERE cleared.user_id = latest.user_id
        AND cleared.source = 'cleared'
        AND cleared.id < latest.id
    ) AS last_clear_id
  FROM latest_audit AS latest
  WHERE latest.source = 'admin_override'
    AND latest.new_effective BETWEEN 0 AND 100
), active_override AS (
  SELECT
    active.user_id,
    COALESCE(profile.self_appearance_score_auto, first_override.prev_effective) AS score_auto,
    active.new_effective AS score_override,
    active.created_at
  FROM active_audit AS active
  LEFT JOIN public.profiles AS profile
    ON profile.user_id = active.user_id
  LEFT JOIN LATERAL (
    SELECT audit.prev_effective
    FROM public.appearance_score_audits AS audit
    WHERE audit.user_id = active.user_id
      AND audit.source = 'admin_override'
      AND audit.id > COALESCE(active.last_clear_id, 0)
      AND audit.id <= active.id
    ORDER BY audit.id
    LIMIT 1
  ) AS first_override ON TRUE
)
INSERT INTO public.private_appearance_scores AS private_score (
  user_id,
  status,
  score_raw,
  score_normalized,
  score_override,
  updated_at
)
SELECT
  active.user_id,
  'stale',
  CASE
    WHEN active.score_auto BETWEEN 0 AND 100 THEN active.score_auto
    ELSE NULL
  END,
  CASE
    WHEN active.score_auto BETWEEN 0 AND 100 THEN active.score_auto / 100.0
    ELSE NULL
  END,
  active.score_override,
  active.created_at
FROM active_override AS active
ON CONFLICT (user_id) DO UPDATE
SET score_raw = CASE
      WHEN private_score.provider LIKE 'legacy-%' THEN EXCLUDED.score_raw
      ELSE private_score.score_raw
    END,
    score_normalized = CASE
      WHEN private_score.provider LIKE 'legacy-%' THEN EXCLUDED.score_normalized
      ELSE private_score.score_normalized
    END,
    score_override = EXCLUDED.score_override,
    updated_at = GREATEST(
      private_score.updated_at,
      EXCLUDED.updated_at
    );

UPDATE public.private_appearance_scores
SET score_normalized = score_effective / 100.0
WHERE score_normalized IS DISTINCT FROM score_effective / 100.0;

COMMENT ON COLUMN public.private_appearance_scores.score_normalized IS
  'Effective normalized score used by matching: score_effective divided by 100.';

CREATE OR REPLACE FUNCTION public.admin_set_appearance_override(
  p_user_id UUID,
  p_score FLOAT,
  p_reason TEXT DEFAULT NULL
)
RETURNS FLOAT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_prev FLOAT;
  v_effective FLOAT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'invalid_score';
  END IF;

  PERFORM 1
  FROM public.profiles AS profile
  WHERE profile.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT score.score_effective
  INTO v_prev
  FROM public.private_appearance_scores AS score
  WHERE score.user_id = p_user_id
  FOR UPDATE;

  INSERT INTO public.private_appearance_scores (
    user_id,
    status,
    score_override,
    updated_at
  )
  VALUES (
    p_user_id,
    'stale',
    p_score,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (user_id) DO UPDATE
  SET score_override = EXCLUDED.score_override,
      updated_at = EXCLUDED.updated_at
  RETURNING score_effective INTO v_effective;

  PERFORM pg_catalog.set_config('app.bypass_asa_guard', 'on', TRUE);
  INSERT INTO public.appearance_score_audits (
    user_id,
    prev_effective,
    new_effective,
    source,
    admin_user_id,
    reason
  )
  VALUES (
    p_user_id,
    v_prev,
    v_effective,
    'admin_override',
    v_caller,
    p_reason
  );
  PERFORM pg_catalog.set_config('app.bypass_asa_guard', 'off', TRUE);

  RETURN v_effective;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_appearance_override(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS FLOAT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_prev FLOAT;
  v_effective FLOAT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  PERFORM 1
  FROM public.profiles AS profile
  WHERE profile.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT score.score_effective
  INTO v_prev
  FROM public.private_appearance_scores AS score
  WHERE score.user_id = p_user_id
  FOR UPDATE;

  UPDATE public.private_appearance_scores
  SET score_override = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id
  RETURNING score_effective INTO v_effective;

  PERFORM pg_catalog.set_config('app.bypass_asa_guard', 'on', TRUE);
  INSERT INTO public.appearance_score_audits (
    user_id,
    prev_effective,
    new_effective,
    source,
    admin_user_id,
    reason
  )
  VALUES (
    p_user_id,
    v_prev,
    v_effective,
    'cleared',
    v_caller,
    p_reason
  );
  PERFORM pg_catalog.set_config('app.bypass_asa_guard', 'off', TRUE);

  RETURN v_effective;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_profile(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  gender TEXT,
  age INT,
  school TEXT,
  department TEXT,
  appearance_type TEXT,
  is_profile_complete BOOLEAN,
  effective_score FLOAT,
  score_auto FLOAT,
  score_override FLOAT,
  score_source TEXT,
  score_updated_at TIMESTAMPTZ,
  appearance_score_normalized FLOAT,
  photo_urls TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  RETURN QUERY
  SELECT
    profile.user_id,
    profile.display_name,
    profile.gender::TEXT,
    profile.age,
    profile.school,
    profile.department,
    profile.appearance_type::TEXT,
    profile.is_profile_complete,
    score.score_effective,
    score.score_raw,
    score.score_override,
    CASE
      WHEN score.score_override IS NOT NULL THEN 'override'::TEXT
      WHEN score.provider LIKE 'legacy-%' THEN 'legacy'::TEXT
      WHEN score.score_raw IS NOT NULL THEN 'auto'::TEXT
      ELSE NULL::TEXT
    END,
    score.updated_at,
    score.score_effective / 100.0,
    COALESCE(
      (
        SELECT pg_catalog.array_agg(photo.public_url ORDER BY photo.sort_order)
        FROM public.photos AS photo
        WHERE photo.user_id = profile.user_id
      ),
      ARRAY[]::TEXT[]
    )
  FROM public.profiles AS profile
  LEFT JOIN public.private_appearance_scores AS score
    ON score.user_id = profile.user_id
  WHERE profile.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._admin_group_members_json(p_group_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'user_id', profile.user_id,
        'display_name', profile.display_name,
        'age', profile.age,
        'gender', profile.gender,
        'school', profile.school,
        'department', profile.department,
        'appearance_type', COALESCE(score.appearance_type, profile.appearance_type::TEXT),
        'effective_score', score.score_effective,
        'score_source', CASE
          WHEN score.score_override IS NOT NULL THEN 'override'
          WHEN score.provider LIKE 'legacy-%' THEN 'legacy'
          WHEN score.score_raw IS NOT NULL THEN 'auto'
          ELSE NULL
        END,
        'primary_photo_url', (
          SELECT photo.public_url
          FROM public.photos AS photo
          WHERE photo.user_id = profile.user_id
          ORDER BY photo.sort_order
          LIMIT 1
        )
      )
      ORDER BY member.joined_at
    ),
    '[]'::JSONB
  )
  FROM public.group_members AS member
  JOIN public.profiles AS profile
    ON profile.user_id = member.user_id
  LEFT JOIN public.private_appearance_scores AS score
    ON score.user_id = profile.user_id
  WHERE member.group_id = p_group_id
    AND member.left_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.admin_set_appearance_override(UUID, FLOAT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_clear_appearance_override(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_user_profile(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_private_appearance_score_effective()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_set_appearance_override(UUID, FLOAT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_appearance_override(UUID, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profile(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.admin_set_appearance_override(UUID, FLOAT, TEXT) IS
  'Administrator-only appearance override stored in private_appearance_scores with an audit record.';
COMMENT ON FUNCTION public.admin_clear_appearance_override(UUID, TEXT) IS
  'Administrator-only override clear returning the private automatic score and recording an audit.';
COMMENT ON FUNCTION public.admin_get_user_profile(UUID) IS
  'Administrator-only profile lookup with private automatic, override, and effective appearance scores.';

COMMIT;
