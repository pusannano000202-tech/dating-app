-- Keep legacy match review and global matching configuration behind the same
-- recent-auth super-admin boundary as their UI. Mutation history is retained
-- through reviewed_by/reviewed_at and updated_by/updated_at; no reason text is
-- collected or persisted.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_app_config(p_key TEXT, p_value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
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
  IF p_key <> 'match_requires_approval'
    OR p_value IS NULL
    OR pg_catalog.jsonb_typeof(p_value) <> 'boolean' THEN
    RAISE EXCEPTION 'invalid_app_config';
  END IF;

  PERFORM pg_catalog.set_config('app.bypass_app_config_guard', 'on', TRUE);
  INSERT INTO public.app_config (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, v_caller, CURRENT_TIMESTAMP)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = v_caller,
        updated_at = CURRENT_TIMESTAMP;
  PERFORM pg_catalog.set_config('app.bypass_app_config_guard', 'off', TRUE);

  RETURN p_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_match(
  p_match_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL,
  p_add_excluded BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  match_id UUID,
  approval_status TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_match public.matches%ROWTYPE;
  v_a UUID;
  v_b UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_match_id IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;
  IF p_decision = 'approve' AND COALESCE(p_add_excluded, FALSE) THEN
    RAISE EXCEPTION 'invalid_add_excluded';
  END IF;

  SELECT match_row.*
  INTO v_match
  FROM public.matches AS match_row
  WHERE match_row.id = p_match_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_match.approval_status <> 'pending_review' THEN
    RAISE EXCEPTION 'not_pending_review';
  END IF;

  IF p_decision = 'approve' THEN
    UPDATE public.matches
    SET approval_status = 'approved',
        reviewed_by = v_caller,
        reviewed_at = CURRENT_TIMESTAMP,
        review_reason = NULL
    WHERE id = p_match_id;
  ELSE
    UPDATE public.matches
    SET approval_status = 'rejected',
        status = 'cancelled',
        reviewed_by = v_caller,
        reviewed_at = CURRENT_TIMESTAMP,
        review_reason = NULL
    WHERE id = p_match_id;

    IF COALESCE(p_add_excluded, FALSE) THEN
      IF v_match.group_a_id < v_match.group_b_id THEN
        v_a := v_match.group_a_id;
        v_b := v_match.group_b_id;
      ELSE
        v_a := v_match.group_b_id;
        v_b := v_match.group_a_id;
      END IF;
      INSERT INTO public.excluded_pairs (group_a_id, group_b_id, reason)
      VALUES (v_a, v_b, 'manual_block')
      ON CONFLICT (group_a_id, group_b_id) DO NOTHING;
    END IF;
  END IF;

  SELECT match_row.*
  INTO v_match
  FROM public.matches AS match_row
  WHERE match_row.id = p_match_id;
  RETURN QUERY
  SELECT v_match.id, v_match.approval_status, v_match.status::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_pending_matches()
RETURNS TABLE (
  match_id UUID,
  group_a_id UUID,
  group_b_id UUID,
  group_a_gender TEXT,
  group_b_gender TEXT,
  group_a_size INT,
  group_b_size INT,
  score FLOAT,
  score_breakdown JSONB,
  is_forced BOOLEAN,
  matched_at TIMESTAMPTZ
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
    match_row.id,
    match_row.group_a_id,
    match_row.group_b_id,
    public.get_group_composition_gender(match_row.group_a_id),
    public.get_group_composition_gender(match_row.group_b_id),
    group_a.size,
    group_b.size,
    match_row.score,
    match_row.score_breakdown,
    match_row.is_forced,
    match_row.matched_at
  FROM public.matches AS match_row
  JOIN public.groups AS group_a ON group_a.id = match_row.group_a_id
  JOIN public.groups AS group_b ON group_b.id = match_row.group_b_id
  WHERE match_row.approval_status = 'pending_review'
  ORDER BY match_row.matched_at DESC NULLS LAST, match_row.score DESC NULLS LAST
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.set_app_config(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_review_match(UUID, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_pending_matches()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_app_config(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_match(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_matches() TO authenticated;

COMMENT ON FUNCTION public.set_app_config(TEXT, JSONB) IS
  'Recent-auth super-admin-only allowlisted global matching configuration mutation.';
COMMENT ON FUNCTION public.admin_review_match(UUID, TEXT, TEXT, BOOLEAN) IS
  'Recent-auth super-admin-only match approval or rejection without free-text reason storage.';
COMMENT ON FUNCTION public.admin_list_pending_matches() IS
  'Recent-auth super-admin-only bounded pending-match score summary.';

COMMIT;
