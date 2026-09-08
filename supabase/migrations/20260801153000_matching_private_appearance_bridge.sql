BEGIN;

-- Ready scores must always carry the presentation type consumed by the
-- matching vector adapter. This remains service-owned and is never returned to
-- a browser role.
UPDATE public.private_appearance_scores
SET status = 'stale',
    analyzed_photo_revision = NULL,
    lease_expires_at = NULL,
    request_id = NULL,
    score_raw = NULL,
    score_normalized = NULL,
    confidence_0_1 = NULL,
    appearance_type = NULL,
    error_code = 'ready_contract_incomplete',
    analyzed_at = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'ready'
  AND (
    photo_revision IS NULL
    OR analyzed_photo_revision IS DISTINCT FROM photo_revision
    OR request_id IS NULL
    OR score_raw IS NULL
    OR score_normalized IS NULL
    OR confidence_0_1 IS NULL
    OR appearance_type IS NULL
    OR provider IS NULL
    OR pg_catalog.btrim(provider) = ''
    OR model_version IS NULL
    OR pg_catalog.btrim(model_version) = ''
    OR prompt_version IS NULL
    OR pg_catalog.btrim(prompt_version) = ''
    OR anchor_version IS NULL
    OR pg_catalog.btrim(anchor_version) = ''
    OR analyzed_at IS NULL
  );

ALTER TABLE public.private_appearance_scores
  DROP CONSTRAINT IF EXISTS private_appearance_scores_ready_type_required;
ALTER TABLE public.private_appearance_scores
  ADD CONSTRAINT private_appearance_scores_ready_type_required
  CHECK (
    status <> 'ready'
    OR (
      appearance_type IS NOT NULL
      AND confidence_0_1 IS NOT NULL
      AND analyzed_photo_revision = photo_revision
    )
  );

CREATE OR REPLACE FUNCTION public.get_private_matching_profiles(p_group_ids UUID[])
RETURNS TABLE (
  group_id UUID,
  group_gender TEXT,
  group_size INTEGER,
  department TEXT,
  excluded_group_ids UUID[],
  user_id UUID,
  gender TEXT,
  age INTEGER,
  preferred_age_min INTEGER,
  preferred_age_max INTEGER,
  preferred_axis_z_vector JSONB,
  preferred_personality_vector JSONB,
  big5 JSONB,
  available_timeslots JSONB,
  preference_weights JSONB,
  score_normalized DOUBLE PRECISION,
  appearance_type TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    member.group_id,
    matched_group.gender,
    matched_group.size,
    profile.department,
    COALESCE(
      (
        SELECT pg_catalog.array_agg(
          CASE
            WHEN excluded.group_a_id = member.group_id THEN excluded.group_b_id
            ELSE excluded.group_a_id
          END
          ORDER BY
            CASE
              WHEN excluded.group_a_id = member.group_id THEN excluded.group_b_id
              ELSE excluded.group_a_id
            END
        )
        FROM public.excluded_pairs AS excluded
        WHERE excluded.group_a_id = member.group_id
           OR excluded.group_b_id = member.group_id
      ),
      ARRAY[]::UUID[]
    ),
    profile.user_id,
    profile.gender,
    profile.age,
    profile.preferred_age_min,
    profile.preferred_age_max,
    profile.preferred_axis_z_vector,
    profile.preferred_personality_vector,
    pg_catalog.jsonb_build_object(
      'openness', profile.big5_openness,
      'conscientiousness', profile.big5_conscientiousness,
      'extraversion', profile.big5_extraversion,
      'agreeableness', profile.big5_agreeableness,
      'neuroticism', profile.big5_neuroticism
    ),
    profile.available_timeslots,
    profile.preference_weights,
    score.score_normalized,
    score.appearance_type
  FROM public.group_members AS member
  JOIN public.groups AS matched_group
    ON matched_group.id = member.group_id
  JOIN public.profiles AS profile
    ON profile.user_id = member.user_id
  JOIN public.private_appearance_scores AS score
    ON score.user_id = member.user_id
  WHERE member.group_id = ANY (p_group_ids)
    AND member.left_at IS NULL
    AND score.status = 'ready'
    AND score.photo_revision IS NOT NULL
    AND score.analyzed_photo_revision = score.photo_revision
    AND score.request_id IS NOT NULL
    AND score.score_raw IS NOT NULL
    AND score.score_normalized IS NOT NULL
    AND score.confidence_0_1 IS NOT NULL
    AND score.appearance_type IS NOT NULL
    AND score.provider IS NOT NULL
    AND pg_catalog.btrim(score.provider) <> ''
    AND score.model_version IS NOT NULL
    AND pg_catalog.btrim(score.model_version) <> ''
    AND score.prompt_version IS NOT NULL
    AND pg_catalog.btrim(score.prompt_version) <> ''
    AND score.anchor_version IS NOT NULL
    AND pg_catalog.btrim(score.anchor_version) <> ''
    AND score.analyzed_at IS NOT NULL
    AND score.error_code IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.group_members AS pending_member
      LEFT JOIN public.profiles AS pending_profile
        ON pending_profile.user_id = pending_member.user_id
      LEFT JOIN public.private_appearance_scores AS pending_score
        ON pending_score.user_id = pending_member.user_id
      WHERE pending_member.group_id = member.group_id
        AND pending_member.left_at IS NULL
        AND (
          pending_profile.user_id IS NULL
          OR pending_score.user_id IS NULL
          OR pending_score.status IS DISTINCT FROM 'ready'
          OR pending_score.photo_revision IS NULL
          OR pending_score.analyzed_photo_revision IS DISTINCT FROM pending_score.photo_revision
          OR pending_score.request_id IS NULL
          OR pending_score.score_raw IS NULL
          OR pending_score.score_normalized IS NULL
          OR pending_score.confidence_0_1 IS NULL
          OR pending_score.appearance_type IS NULL
          OR pending_score.provider IS NULL
          OR pg_catalog.btrim(pending_score.provider) = ''
          OR pending_score.model_version IS NULL
          OR pg_catalog.btrim(pending_score.model_version) = ''
          OR pending_score.prompt_version IS NULL
          OR pg_catalog.btrim(pending_score.prompt_version) = ''
          OR pending_score.anchor_version IS NULL
          OR pg_catalog.btrim(pending_score.anchor_version) = ''
          OR pending_score.analyzed_at IS NULL
          OR pending_score.error_code IS NOT NULL
        )
    )
  ORDER BY member.group_id, profile.user_id;
$$;

COMMENT ON FUNCTION public.get_private_matching_profiles(UUID[]) IS
  'Service-only matching input bridge. Returns ready private appearance values and required profile vectors.';

REVOKE ALL ON FUNCTION public.get_private_matching_profiles(UUID[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_private_matching_profiles(UUID[])
  TO service_role;

-- The application server computes the score and breakdown from private
-- vectors immediately before this write. Prevent browser-authenticated admins
-- from bypassing that computation by calling the legacy RPC directly.
REVOKE ALL ON FUNCTION public.admin_create_pending_match(UUID, UUID, DOUBLE PRECISION, JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_pending_match(UUID, UUID, DOUBLE PRECISION, JSONB, BOOLEAN)
  TO service_role;

COMMIT;
