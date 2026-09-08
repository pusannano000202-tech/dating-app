-- Appearance scores, profile photos, and member-level match evidence are a
-- super-admin boundary. Existing RPC signatures remain unchanged.

BEGIN;

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
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
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
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

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
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

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
    ARRAY[]::TEXT[]
  FROM public.profiles AS profile
  LEFT JOIN public.private_appearance_scores AS score
    ON score.user_id = profile.user_id
  WHERE profile.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._admin_group_members_json(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_members JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

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
        'primary_photo_url', NULL
      )
      ORDER BY member.joined_at
    ),
    '[]'::JSONB
  )
  INTO v_members
  FROM public.group_members AS member
  JOIN public.profiles AS profile
    ON profile.user_id = member.user_id
  LEFT JOIN public.private_appearance_scores AS score
    ON score.user_id = profile.user_id
  WHERE member.group_id = p_group_id
    AND member.left_at IS NULL;

  RETURN v_members;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_match_review(p_match_id UUID)
RETURNS TABLE (
  match_id UUID,
  group_a_id UUID,
  group_b_id UUID,
  status TEXT,
  approval_status TEXT,
  is_forced BOOLEAN,
  score FLOAT,
  score_breakdown JSONB,
  matched_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  group_a_members JSONB,
  group_b_members JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_match public.matches%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

  SELECT *
  INTO v_match
  FROM public.matches AS match_row
  WHERE match_row.id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  RETURN QUERY
  SELECT
    v_match.id,
    v_match.group_a_id,
    v_match.group_b_id,
    v_match.status::TEXT,
    v_match.approval_status,
    v_match.is_forced,
    v_match.score,
    v_match.score_breakdown,
    v_match.matched_at,
    v_match.reviewed_at,
    v_match.review_reason,
    public._admin_group_members_json(v_match.group_a_id),
    public._admin_group_members_json(v_match.group_b_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_appearance_override(UUID, FLOAT, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_clear_appearance_override(UUID, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_user_profile(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_match_review(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._admin_group_members_json(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_set_appearance_override(UUID, FLOAT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_appearance_override(UUID, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profile(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_match_review(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.admin_set_appearance_override(UUID, FLOAT, TEXT) IS
  'Super-admin-only appearance override; the optional existing reason contract is preserved.';
COMMENT ON FUNCTION public.admin_clear_appearance_override(UUID, TEXT) IS
  'Super-admin-only override clear; the optional existing reason contract is preserved.';
COMMENT ON FUNCTION public.admin_get_user_profile(UUID) IS
  'Super-admin-only profile, photos, and private appearance score lookup.';
COMMENT ON FUNCTION public.admin_get_match_review(UUID) IS
  'Super-admin-only member-level match evidence lookup.';

COMMIT;
