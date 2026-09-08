BEGIN;

-- Contract phase. Promote this file only after every score writer and reader
-- uses private_appearance_scores in the deployed application.
-- Capture legacy writes that happened during the expand/deploy window without
-- overwriting a score already produced by the new private service.
INSERT INTO public.private_appearance_scores AS private_score (
  user_id,
  status,
  provider,
  model_version,
  score_raw,
  score_normalized,
  appearance_type,
  error_code,
  analyzed_at,
  updated_at
)
SELECT
  app_user.id,
  'stale',
  CASE
    WHEN profile.user_id IS NOT NULL THEN 'legacy-profile-cutover'
    ELSE 'legacy-appearance-scores-cutover'
  END,
  CASE
    WHEN profile.self_appearance_score_auto IS NULL
      AND profile.self_appearance_score IS NULL
      AND profile.appearance_score_normalized IS NULL
    THEN legacy_score.model_version
    ELSE NULL
  END,
  COALESCE(
    profile.self_appearance_score_auto,
    profile.self_appearance_score,
    profile.appearance_score_normalized * 100.0,
    legacy_score.score_raw
  ),
  COALESCE(
    profile.self_appearance_score_auto / 100.0,
    profile.self_appearance_score / 100.0,
    profile.appearance_score_normalized,
    legacy_score.score_raw / 100.0
  ),
  profile.appearance_type,
  'legacy_photo_revision_unknown',
  COALESCE(profile.self_appearance_score_updated_at, legacy_score.scored_at),
  COALESCE(profile.self_appearance_score_updated_at, legacy_score.scored_at, CURRENT_TIMESTAMP)
FROM public.users AS app_user
LEFT JOIN public.profiles AS profile
  ON profile.user_id = app_user.id
LEFT JOIN public.appearance_scores AS legacy_score
  ON legacy_score.user_id = app_user.id
WHERE profile.appearance_score_normalized IS NOT NULL
   OR profile.self_appearance_score IS NOT NULL
   OR profile.self_appearance_score_auto IS NOT NULL
   OR legacy_score.score_raw IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET provider = EXCLUDED.provider,
    model_version = EXCLUDED.model_version,
    score_raw = EXCLUDED.score_raw,
    appearance_type = EXCLUDED.appearance_type,
    error_code = EXCLUDED.error_code,
    analyzed_at = EXCLUDED.analyzed_at,
    updated_at = EXCLUDED.updated_at
WHERE private_score.provider LIKE 'legacy-%'
  AND private_score.updated_at <= EXCLUDED.updated_at;

UPDATE public.profiles
SET appearance_score_normalized = NULL,
    self_appearance_score = NULL,
    self_appearance_score_auto = NULL,
    self_appearance_score_override = NULL,
    self_appearance_score_source = NULL,
    self_appearance_score_updated_at = NULL
WHERE appearance_score_normalized IS NOT NULL
   OR self_appearance_score IS NOT NULL
   OR self_appearance_score_auto IS NOT NULL
   OR self_appearance_score_override IS NOT NULL
   OR self_appearance_score_source IS NOT NULL
   OR self_appearance_score_updated_at IS NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_legacy_appearance_scores_unused;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_legacy_appearance_scores_unused
  CHECK (
    appearance_score_normalized IS NULL
    AND self_appearance_score IS NULL
    AND self_appearance_score_auto IS NULL
    AND self_appearance_score_override IS NULL
    AND self_appearance_score_source IS NULL
    AND self_appearance_score_updated_at IS NULL
  );

COMMENT ON COLUMN public.profiles.appearance_score_normalized IS
  'Deprecated compatibility column. Always NULL; use private_appearance_scores through service boundaries.';
COMMENT ON COLUMN public.profiles.self_appearance_score IS
  'Deprecated compatibility column. Always NULL; raw scores are service-only.';
COMMENT ON COLUMN public.profiles.self_appearance_score_auto IS
  'Deprecated compatibility column. Always NULL; raw scores are service-only.';
COMMENT ON COLUMN public.profiles.self_appearance_score_override IS
  'Deprecated compatibility column. Always NULL; raw scores are service-only.';
COMMENT ON COLUMN public.profiles.self_appearance_score_source IS
  'Deprecated compatibility column. Always NULL.';
COMMENT ON COLUMN public.profiles.self_appearance_score_updated_at IS
  'Deprecated compatibility column. Always NULL.';

DELETE FROM public.appearance_scores;
REVOKE ALL ON TABLE public.appearance_scores
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE public.appearance_scores IS
  'Deprecated compatibility table. Always empty; use private_appearance_scores.';

COMMIT;
