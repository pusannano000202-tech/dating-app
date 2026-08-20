BEGIN;

-- Expand phase: add the private score boundary while legacy application
-- writers remain operational. Legacy columns are retired only after the new
-- application has been deployed and verified.
CREATE TABLE public.private_appearance_scores (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  photo_revision UUID,
  analyzed_photo_revision UUID,
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'ready', 'failed', 'stale')),
  lease_expires_at TIMESTAMPTZ,
  request_id UUID,
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  provider TEXT,
  model_version TEXT,
  prompt_version TEXT,
  anchor_version TEXT,
  score_raw DOUBLE PRECISION
    CHECK (score_raw IS NULL OR score_raw BETWEEN 0 AND 100),
  score_normalized DOUBLE PRECISION
    CHECK (score_normalized IS NULL OR score_normalized BETWEEN 0 AND 1),
  confidence_0_1 DOUBLE PRECISION
    CHECK (confidence_0_1 IS NULL OR confidence_0_1 BETWEEN 0 AND 1),
  appearance_type TEXT
    CHECK (
      appearance_type IS NULL
      OR appearance_type IN ('cute', 'pure', 'chic', 'warm', 'stylish', 'healthy')
    ),
  error_code TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    status <> 'pending'
    OR (
      photo_revision IS NOT NULL
      AND request_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
    )
  ),
  CHECK (status = 'pending' OR lease_expires_at IS NULL),
  CHECK (
    status <> 'ready'
    OR (
      photo_revision IS NOT NULL
      AND analyzed_photo_revision = photo_revision
      AND request_id IS NOT NULL
      AND score_raw IS NOT NULL
      AND score_normalized IS NOT NULL
      AND confidence_0_1 IS NOT NULL
      AND appearance_type IS NOT NULL
      AND provider = 'openai'
      AND model_version = 'gpt-5.6-terra'
      AND prompt_version = 'appearance-anchor-v2'
      AND anchor_version = 'approved-v1'
      AND analyzed_at IS NOT NULL
      AND error_code IS NULL
    )
  ),
  CHECK (status <> 'failed' OR error_code IS NOT NULL)
);

COMMENT ON TABLE public.private_appearance_scores IS
  'Service-owned appearance analysis state. Browser roles must use readiness-only RPCs.';
COMMENT ON COLUMN public.private_appearance_scores.photo_revision IS
  'Opaque UUID identifying the exact photo set analyzed or currently leased.';
COMMENT ON COLUMN public.private_appearance_scores.lease_expires_at IS
  'Exclusive claim expiry. Non-null only while status is pending.';
COMMENT ON COLUMN public.private_appearance_scores.request_id IS
  'Opaque idempotency token owning the current or most recently completed analysis attempt.';
COMMENT ON COLUMN public.private_appearance_scores.attempt_count IS
  'Monotonic number of analysis leases acquired for the current photo revision.';

ALTER TABLE public.private_appearance_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY private_appearance_scores_service_role_all
  ON public.private_appearance_scores
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON TABLE public.private_appearance_scores
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.private_appearance_scores
  TO service_role;

-- Preserve legacy values privately, but never treat them as ready: old rows do
-- not identify which photo revision produced the score.
INSERT INTO public.private_appearance_scores (
  user_id,
  status,
  provider,
  model_version,
  score_raw,
  score_normalized,
  appearance_type,
  error_code,
  analyzed_at
)
SELECT
  app_user.id,
  'stale',
  CASE
    WHEN profile.user_id IS NOT NULL THEN 'legacy-profile'
    ELSE 'legacy-appearance-scores'
  END,
  CASE
    WHEN profile.self_appearance_score IS NULL
      AND profile.self_appearance_score_override IS NULL
      AND profile.self_appearance_score_auto IS NULL
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
  COALESCE(profile.self_appearance_score_updated_at, legacy_score.scored_at)
FROM public.users AS app_user
LEFT JOIN public.profiles AS profile
  ON profile.user_id = app_user.id
LEFT JOIN public.appearance_scores AS legacy_score
  ON legacy_score.user_id = app_user.id
WHERE profile.appearance_score_normalized IS NOT NULL
   OR profile.self_appearance_score IS NOT NULL
   OR profile.self_appearance_score_auto IS NOT NULL
   OR profile.self_appearance_score_override IS NOT NULL
   OR legacy_score.score_raw IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE public.private_appearance_scores IS
  'Canonical private score boundary. Legacy writers remain temporarily available during the expand phase.';

CREATE OR REPLACE FUNCTION public.get_my_appearance_score_status()
RETURNS TABLE (
  status TEXT,
  ready BOOLEAN,
  photo_revision UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(score.status, 'pending') AS status,
    COALESCE(
      score.status = 'ready'
      AND score.photo_revision IS NOT NULL
      AND score.analyzed_photo_revision = score.photo_revision
      AND score.request_id IS NOT NULL
      AND score.score_raw IS NOT NULL
      AND score.score_normalized IS NOT NULL
      AND score.confidence_0_1 IS NOT NULL
      AND score.appearance_type IS NOT NULL
      AND score.provider = 'openai'
      AND score.model_version = 'gpt-5.6-terra'
      AND score.prompt_version = 'appearance-anchor-v2'
      AND score.anchor_version = 'approved-v1'
      AND score.analyzed_at IS NOT NULL
      AND score.error_code IS NULL,
      FALSE
    ) AS ready,
    score.photo_revision
  FROM (VALUES (1)) AS sentinel(value)
  LEFT JOIN public.private_appearance_scores AS score
    ON score.user_id = v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_group_appearance_score_readiness(
  p_group_id UUID
)
RETURNS TABLE (
  user_id UUID,
  ready BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members AS caller
    WHERE caller.group_id = p_group_id
      AND caller.user_id = v_uid
      AND caller.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  RETURN QUERY
  SELECT
    member.user_id,
    COALESCE(
      score.status = 'ready'
      AND score.photo_revision IS NOT NULL
      AND score.analyzed_photo_revision = score.photo_revision
      AND score.request_id IS NOT NULL
      AND score.score_raw IS NOT NULL
      AND score.score_normalized IS NOT NULL
      AND score.confidence_0_1 IS NOT NULL
      AND score.appearance_type IS NOT NULL
      AND score.provider = 'openai'
      AND score.model_version = 'gpt-5.6-terra'
      AND score.prompt_version = 'appearance-anchor-v2'
      AND score.anchor_version = 'approved-v1'
      AND score.analyzed_at IS NOT NULL
      AND score.error_code IS NULL,
      FALSE
    ) AS ready
  FROM public.group_members AS member
  LEFT JOIN public.private_appearance_scores AS score
    ON score.user_id = member.user_id
  WHERE member.group_id = p_group_id
    AND member.left_at IS NULL
  ORDER BY member.joined_at, member.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_private_appearance_score(
  p_user_id UUID,
  p_photo_revision UUID,
  p_request_id UUID,
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  claimed BOOLEAN,
  current_status TEXT,
  current_photo_revision UUID,
  current_request_id UUID,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER,
  reused_existing_score BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_score public.private_appearance_scores%ROWTYPE;
  v_reused BOOLEAN;
BEGIN
  IF p_user_id IS NULL OR p_photo_revision IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_claim_target';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'invalid_lease_seconds';
  END IF;

  INSERT INTO public.private_appearance_scores AS private_appearance_scores (
    user_id,
    photo_revision,
    analyzed_photo_revision,
    status,
    lease_expires_at,
    request_id,
    attempt_count,
    updated_at
  )
  VALUES (
    p_user_id,
    p_photo_revision,
    NULL,
    'pending',
    CURRENT_TIMESTAMP + pg_catalog.make_interval(secs => p_lease_seconds),
    p_request_id,
    1,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (user_id) DO UPDATE
  SET photo_revision = EXCLUDED.photo_revision,
      analyzed_photo_revision = NULL,
      status = 'pending',
      lease_expires_at = EXCLUDED.lease_expires_at,
      request_id = p_request_id,
      attempt_count = private_appearance_scores.attempt_count + 1,
      provider = NULL,
      model_version = NULL,
      prompt_version = NULL,
      anchor_version = NULL,
      score_raw = NULL,
      score_normalized = NULL,
      confidence_0_1 = NULL,
      appearance_type = NULL,
      error_code = NULL,
      analyzed_at = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE private_appearance_scores.status IN ('stale', 'failed')
     OR (
       private_appearance_scores.status = 'pending'
       AND private_appearance_scores.lease_expires_at <= CURRENT_TIMESTAMP
     )
  RETURNING private_appearance_scores.*
  INTO v_score;

  IF FOUND THEN
    RETURN QUERY SELECT
      TRUE,
      v_score.status,
      v_score.photo_revision,
      v_score.request_id,
      v_score.lease_expires_at,
      v_score.attempt_count,
      FALSE;
    RETURN;
  END IF;

  SELECT score.*
  INTO v_score
  FROM public.private_appearance_scores AS score
  WHERE score.user_id = p_user_id;

  v_reused := COALESCE(
    v_score.status = 'ready'
    AND v_score.photo_revision = p_photo_revision
    AND v_score.analyzed_photo_revision = v_score.photo_revision
    AND v_score.request_id IS NOT NULL
    AND v_score.score_raw IS NOT NULL
    AND v_score.score_normalized IS NOT NULL
    AND v_score.confidence_0_1 IS NOT NULL
    AND v_score.appearance_type IS NOT NULL
    AND v_score.provider = 'openai'
    AND v_score.model_version = 'gpt-5.6-terra'
    AND v_score.prompt_version = 'appearance-anchor-v2'
    AND v_score.anchor_version = 'approved-v1'
    AND v_score.analyzed_at IS NOT NULL
    AND v_score.error_code IS NULL,
    FALSE
  );

  RETURN QUERY SELECT
    FALSE,
    v_score.status,
    v_score.photo_revision,
    v_score.request_id,
    v_score.lease_expires_at,
    v_score.attempt_count,
    v_reused;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_private_appearance_score(
  p_user_id UUID,
  p_photo_revision UUID,
  p_request_id UUID,
  p_provider TEXT,
  p_model_version TEXT,
  p_prompt_version TEXT,
  p_anchor_version TEXT,
  p_score_raw DOUBLE PRECISION,
  p_score_normalized DOUBLE PRECISION,
  p_confidence_0_1 DOUBLE PRECISION,
  p_appearance_type TEXT,
  p_analyzed_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated_rows INTEGER;
BEGIN
  IF p_provider IS NULL OR p_provider <> 'openai'
    OR p_model_version IS NULL OR p_model_version <> 'gpt-5.6-terra'
    OR p_prompt_version IS NULL OR p_prompt_version <> 'appearance-anchor-v2'
    OR p_anchor_version IS NULL OR p_anchor_version <> 'approved-v1'
  THEN
    RAISE EXCEPTION 'unapproved_appearance_analysis_version';
  END IF;

  UPDATE public.private_appearance_scores
  SET status = 'ready',
      analyzed_photo_revision = p_photo_revision,
      lease_expires_at = NULL,
      provider = p_provider,
      model_version = p_model_version,
      prompt_version = p_prompt_version,
      anchor_version = p_anchor_version,
      score_raw = p_score_raw,
      score_normalized = p_score_normalized,
      confidence_0_1 = p_confidence_0_1,
      appearance_type = p_appearance_type,
      error_code = NULL,
      analyzed_at = p_analyzed_at,
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id
    AND photo_revision = p_photo_revision
    AND request_id = p_request_id
    AND status = 'pending'
    AND lease_expires_at > CURRENT_TIMESTAMP;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  RETURN v_updated_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_private_appearance_score(
  p_user_id UUID,
  p_photo_revision UUID,
  p_request_id UUID,
  p_error_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated_rows INTEGER;
BEGIN
  IF p_error_code IS NULL OR pg_catalog.btrim(p_error_code) = '' THEN
    RAISE EXCEPTION 'invalid_error_code';
  END IF;

  UPDATE public.private_appearance_scores
  SET status = 'failed',
      lease_expires_at = NULL,
      error_code = p_error_code,
      analyzed_at = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id
    AND photo_revision = p_photo_revision
    AND request_id = p_request_id
    AND status = 'pending'
    AND lease_expires_at > CURRENT_TIMESTAMP;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  RETURN v_updated_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_appearance_score_status()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_group_appearance_score_readiness(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_private_appearance_score(UUID, UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_private_appearance_score(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fail_private_appearance_score(UUID, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_appearance_score_status()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_appearance_score_readiness(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_private_appearance_score(UUID, UUID, UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_private_appearance_score(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_private_appearance_score(UUID, UUID, UUID, TEXT)
  TO service_role;

-- Preserve the latest enter_match_pool contract and add a transaction-local
-- private readiness check so callers cannot bypass API preflight checks.
-- PostgreSQL cannot replace a function when its OUT table shape changes.
-- Drop the legacy four-column result before creating the five-column contract.
DROP FUNCTION IF EXISTS public.enter_match_pool(UUID);

CREATE OR REPLACE FUNCTION public.enter_match_pool(p_group_id UUID)
RETURNS TABLE (
  pool_id UUID,
  group_id UUID,
  group_status TEXT,
  pool_status TEXT,
  reused_existing_entry BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_group public.groups%ROWTYPE;
  v_member_count INTEGER;
  v_pool_id UUID;
  v_pool_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT group_row.*
  INTO v_group
  FROM public.groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;
  IF v_group.leader_user_id <> v_uid THEN
    RAISE EXCEPTION 'not_group_leader';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members AS member
    WHERE member.group_id = p_group_id
      AND member.user_id = v_uid
      AND member.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'group_membership_invalid';
  END IF;

  SELECT pool.id, pool.status
  INTO v_pool_id, v_pool_status
    FROM public.match_pool AS pool
    WHERE pool.group_id = p_group_id
      AND pool.status IN ('waiting', 'rolled_over')
    ORDER BY pool.entered_at DESC, pool.id DESC
    LIMIT 1;

  IF v_pool_id IS NULL AND v_group.status <> 'forming' THEN
    RAISE EXCEPTION 'group_not_open';
  END IF;

  IF v_pool_id IS NOT NULL AND v_group.status NOT IN ('forming', 'ready') THEN
    RAISE EXCEPTION 'group_not_open';
  END IF;

  SELECT count(*)
  INTO v_member_count
  FROM public.group_members AS member
  WHERE member.group_id = p_group_id
    AND member.left_at IS NULL;

  IF v_member_count < 2 THEN
    RAISE EXCEPTION 'not_enough_members';
  END IF;
  IF v_member_count <> v_group.size THEN
    RAISE EXCEPTION 'group_not_full';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.group_members AS member
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL
      AND NOT quantum_private.match_setup_ready(member.user_id)
  ) THEN
    RAISE EXCEPTION 'member_match_setup_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.group_members AS member
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.private_appearance_scores AS score
        WHERE score.user_id = member.user_id
          AND score.status = 'ready'
          AND score.photo_revision IS NOT NULL
          AND score.analyzed_photo_revision = score.photo_revision
          AND score.request_id IS NOT NULL
          AND score.score_raw IS NOT NULL
          AND score.score_normalized IS NOT NULL
          AND score.confidence_0_1 IS NOT NULL
          AND score.appearance_type IS NOT NULL
          AND score.provider = 'openai'
          AND score.model_version = 'gpt-5.6-terra'
          AND score.prompt_version = 'appearance-anchor-v2'
          AND score.anchor_version = 'approved-v1'
          AND score.analyzed_at IS NOT NULL
          AND score.error_code IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'member_appearance_score_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.group_members AS member
    WHERE member.group_id = p_group_id
      AND member.left_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.pre_match_card_drafts AS draft
        WHERE draft.user_id = member.user_id
          AND draft.completed_items >= 4
      )
  ) THEN
    RAISE EXCEPTION 'member_pre_match_card_incomplete';
  END IF;

  IF v_pool_id IS NOT NULL THEN
    RETURN QUERY
    SELECT v_pool_id, p_group_id, v_group.status, v_pool_status, TRUE;
    RETURN;
  END IF;

  UPDATE public.groups
  SET status = 'ready',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_group_id;

  INSERT INTO public.match_pool (group_id, status, rollover_count, batch_id)
  VALUES (p_group_id, 'waiting', 0, NULL)
  RETURNING id
  INTO v_pool_id;

  RETURN QUERY
  SELECT v_pool_id, p_group_id, 'ready'::TEXT, 'waiting'::TEXT, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.enter_match_pool(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enter_match_pool(UUID) TO authenticated;

COMMIT;
