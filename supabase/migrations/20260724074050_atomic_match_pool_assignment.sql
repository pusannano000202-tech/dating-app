-- Atomically turn two active queue rows into one pending match.
-- match_pool.id remains a queue artifact; matches.id is the durable match id.

BEGIN;

ALTER TABLE public.match_pool
  ADD COLUMN IF NOT EXISTS match_id UUID
    REFERENCES public.matches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_match_pool_match_id
  ON public.match_pool(match_id)
  WHERE match_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.match_pool AS pool
    WHERE pool.status = 'matched'
      AND pool.match_id IS NULL
  ) THEN
    RAISE EXCEPTION 'legacy_matched_pool_missing_match_id';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'match_pool_matched_requires_match'
      AND conrelid = 'public.match_pool'::regclass
  ) THEN
    ALTER TABLE public.match_pool
      ADD CONSTRAINT match_pool_matched_requires_match
      CHECK (status <> 'matched' OR match_id IS NOT NULL);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_pending_match(
  p_group_a UUID,
  p_group_b UUID,
  p_score DOUBLE PRECISION DEFAULT NULL,
  p_breakdown JSONB DEFAULT NULL,
  p_is_forced BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_request_role TEXT := COALESCE(
    auth.jwt() ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', TRUE),
    ''
  );
  v_a UUID;
  v_b UUID;
  v_pool public.match_pool%ROWTYPE;
  v_pool_ids UUID[] := ARRAY[]::UUID[];
  v_pool_groups UUID[] := ARRAY[]::UUID[];
  v_batch_id UUID;
  v_seen_batch_id UUID;
  v_pool_count INTEGER := 0;
  v_requires_approval BOOLEAN;
  v_approval_status TEXT;
  v_match_id UUID;
  v_updated_pool_rows INTEGER;
BEGIN
  IF v_request_role <> 'service_role' THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'not_authenticated';
    END IF;
    IF NOT public.is_admin(v_caller) THEN
      RAISE EXCEPTION 'admin_required';
    END IF;
  END IF;

  IF p_group_a IS NULL OR p_group_b IS NULL OR p_group_a = p_group_b THEN
    RAISE EXCEPTION 'invalid_groups';
  END IF;

  IF p_group_a < p_group_b THEN
    v_a := p_group_a;
    v_b := p_group_b;
  ELSE
    v_a := p_group_b;
    v_b := p_group_a;
  END IF;

  -- Lock both active queue rows in a deterministic order. Concurrent
  -- assignments for either group must wait and then fail closed.
  FOR v_pool IN
    SELECT pool.*
    FROM public.match_pool AS pool
    WHERE pool.group_id IN (v_a, v_b)
      AND pool.status IN ('waiting', 'rolled_over')
    ORDER BY pool.id
    FOR UPDATE
  LOOP
    v_pool_count := v_pool_count + 1;
    v_pool_ids := pg_catalog.array_append(v_pool_ids, v_pool.id);
    v_pool_groups := pg_catalog.array_append(v_pool_groups, v_pool.group_id);

    IF v_pool.batch_id IS NOT NULL THEN
      IF v_seen_batch_id IS NOT NULL AND v_seen_batch_id <> v_pool.batch_id THEN
        RAISE EXCEPTION 'match_pool_batch_mismatch';
      END IF;
      v_seen_batch_id := v_pool.batch_id;
    END IF;
  END LOOP;

  IF v_pool_count <> 2
     OR NOT (v_a = ANY (v_pool_groups))
     OR NOT (v_b = ANY (v_pool_groups)) THEN
    RAISE EXCEPTION 'active_match_pool_pair_not_found';
  END IF;

  PERFORM 1
  FROM public.groups AS group_row
  WHERE group_row.id IN (v_a, v_b)
    AND group_row.status = 'ready'
  ORDER BY group_row.id
  FOR UPDATE;

  IF (
    SELECT COUNT(*)
    FROM public.groups AS group_row
    WHERE group_row.id IN (v_a, v_b)
      AND group_row.status = 'ready'
  ) <> 2 THEN
    RAISE EXCEPTION 'group_not_ready';
  END IF;

  PERFORM 1
  FROM public.matches AS active_match
  WHERE active_match.status IN ('pending', 'confirmed')
    AND (
      active_match.group_a_id IN (v_a, v_b)
      OR active_match.group_b_id IN (v_a, v_b)
    )
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'group_already_has_active_match';
  END IF;

  v_batch_id := COALESCE(v_seen_batch_id, pg_catalog.gen_random_uuid());
  v_requires_approval := COALESCE(
    (
      SELECT config.value = pg_catalog.to_jsonb(TRUE)
      FROM public.app_config AS config
      WHERE config.key = 'match_requires_approval'
    ),
    TRUE
  );
  v_approval_status := CASE
    WHEN v_requires_approval THEN 'pending_review'
    ELSE 'approved'
  END;

  INSERT INTO public.matches (
    group_a_id,
    group_b_id,
    score,
    score_breakdown,
    batch_id,
    is_forced,
    status,
    approval_status,
    matched_at
  )
  VALUES (
    v_a,
    v_b,
    COALESCE(p_score, 0),
    p_breakdown,
    v_batch_id,
    p_is_forced,
    'pending',
    v_approval_status,
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO v_match_id;

  UPDATE public.match_pool
  SET status = 'matched',
      left_at = CURRENT_TIMESTAMP,
      batch_id = v_batch_id,
      match_id = v_match_id
  WHERE id = ANY (v_pool_ids)
    AND status IN ('waiting', 'rolled_over');
  GET DIAGNOSTICS v_updated_pool_rows = ROW_COUNT;

  IF v_updated_pool_rows <> 2 THEN
    RAISE EXCEPTION 'match_pool_assignment_incomplete';
  END IF;

  RETURN v_match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_pending_match(
  UUID,
  UUID,
  DOUBLE PRECISION,
  JSONB,
  BOOLEAN
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_create_pending_match(
  UUID,
  UUID,
  DOUBLE PRECISION,
  JSONB,
  BOOLEAN
)
TO authenticated, service_role;

COMMENT ON COLUMN public.match_pool.match_id IS
  'Durable match created from this queue row. Queue id and match id are distinct.';
COMMENT ON FUNCTION public.admin_create_pending_match(
  UUID,
  UUID,
  DOUBLE PRECISION,
  JSONB,
  BOOLEAN
) IS
  'Admin/service-only atomic queue assignment. Locks two active pool rows, creates one pending match, and links both rows to matches.id.';

COMMIT;
