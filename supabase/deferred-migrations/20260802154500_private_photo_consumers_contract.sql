BEGIN;

-- Contract phase. Promote this file into supabase/migrations only after the
-- signed-URL application has been deployed and the expand phase is verified.
UPDATE storage.buckets
SET public = false
WHERE id = 'photos';

DROP POLICY IF EXISTS public_read ON storage.objects;
DROP POLICY IF EXISTS owner_upload ON storage.objects;
DROP POLICY IF EXISTS owner_delete ON storage.objects;

UPDATE public.photos
SET public_url = NULL
WHERE public_url IS NOT NULL;

ALTER TABLE public.photos
  ALTER COLUMN public_url SET DEFAULT NULL;

ALTER TABLE public.photos
  DROP CONSTRAINT IF EXISTS photos_public_url_retired;
ALTER TABLE public.photos
  ADD CONSTRAINT photos_public_url_retired CHECK (public_url IS NULL);

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
    COALESCE(score.appearance_type, profile.appearance_type::TEXT),
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
    ARRAY[]::TEXT[]
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
        'primary_photo_url', NULL::TEXT
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

-- Rewrite only the known photo predicate in the definition that is current at
-- apply time. Abort if another migration changed that contract unexpectedly.
DO $rewrite_apply_photo$
DECLARE
  v_definition TEXT;
  v_rewritten TEXT;
  v_needle CONSTANT TEXT := 'profile_photo.public_url';
  v_replacement CONSTANT TEXT := 'profile_photo.storage_path';
  v_match_count INT;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.apply_to_campus_seven(text,date,jsonb,jsonb,boolean,text)'::REGPROCEDURE
  ) INTO v_definition;
  v_match_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_needle, ''))
  ) / pg_catalog.length(v_needle);
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION 'campus_seven_apply_photo_rewrite_failed';
  END IF;
  v_rewritten := pg_catalog.replace(v_definition, v_needle, v_replacement);
  EXECUTE v_rewritten;
END;
$rewrite_apply_photo$;

DO $rewrite_cohort_photo$
DECLARE
  v_definition TEXT;
  v_rewritten TEXT;
  v_needle CONSTANT TEXT := 'profile_photo.public_url';
  v_replacement CONSTANT TEXT := 'profile_photo.storage_path';
  v_match_count INT;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.form_campus_seven_cohort(text,date,text,text)'::REGPROCEDURE
  ) INTO v_definition;
  v_match_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_needle, ''))
  ) / pg_catalog.length(v_needle);
  IF v_match_count <> 2 THEN
    RAISE EXCEPTION 'campus_seven_cohort_photo_rewrite_failed';
  END IF;
  v_rewritten := pg_catalog.replace(v_definition, v_needle, v_replacement);
  EXECUTE v_rewritten;
END;
$rewrite_cohort_photo$;

-- The authenticated dashboard RPC intentionally returns a null photo field.
-- The Next.js API derives allowed participant IDs from this result and signs
-- their private objects with a server credential.
DO $rewrite_dashboard_photo$
DECLARE
  v_definition TEXT;
  v_rewritten TEXT;
  v_needle CONSTANT TEXT := 'participant_photo.public_url';
  v_replacement CONSTANT TEXT := 'NULL::TEXT';
  v_match_count INT;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.get_my_campus_seven_dashboard()'::REGPROCEDURE
  ) INTO v_definition;
  v_match_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_needle, ''))
  ) / pg_catalog.length(v_needle);
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION 'campus_seven_dashboard_photo_rewrite_failed';
  END IF;
  v_rewritten := pg_catalog.replace(v_definition, v_needle, v_replacement);
  EXECUTE v_rewritten;
END;
$rewrite_dashboard_photo$;

REVOKE ALL ON FUNCTION public.admin_get_user_profile(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profile(UUID)
  TO authenticated;

REVOKE ALL ON FUNCTION public._admin_group_members_json(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON COLUMN public.photos.public_url IS
  'Retired public URL field. Private photo consumers use server-generated signed URLs.';
COMMENT ON FUNCTION public._admin_group_members_json(UUID) IS
  'Administrator-only group member payload. Photo URLs are attached by the authenticated server API.';

COMMIT;
