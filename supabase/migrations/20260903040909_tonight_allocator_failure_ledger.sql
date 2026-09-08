-- Persist proof failures from the Tonight allocator without storing applicant
-- identity or profile data. The private row is one current incident per round;
-- service RPCs reopen/resolve it monotonically and the admin RPC projects only
-- the bounded operational fields needed by the read-only console.

BEGIN;

CREATE TABLE IF NOT EXISTS quantum_private.tonight_allocator_failures (
  round_id UUID PRIMARY KEY REFERENCES public.tonight_rounds(id) ON DELETE CASCADE,
  lower_bound_team_count INTEGER NOT NULL CHECK (lower_bound_team_count >= 0),
  upper_bound_team_count INTEGER NOT NULL CHECK (upper_bound_team_count >= 0),
  applicant_count INTEGER NOT NULL CHECK (applicant_count >= 0 AND applicant_count <= 10000),
  attempted_at TIMESTAMPTZ NOT NULL,
  error_code TEXT NOT NULL CHECK (error_code ~ '^[a-z0-9_]{1,80}$'),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  last_record_idempotency_key TEXT NOT NULL
    CHECK (length(last_record_idempotency_key) BETWEEN 1 AND 160),
  last_resolve_idempotency_key TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (lower_bound_team_count <= upper_bound_team_count),
  CHECK (
    (status = 'open' AND resolved_at IS NULL)
    OR (status = 'resolved' AND resolved_at IS NOT NULL)
  )
);

ALTER TABLE quantum_private.tonight_allocator_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_private.tonight_allocator_failures FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE quantum_private.tonight_allocator_failures
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS tonight_allocator_failures_status_attempted_idx
  ON quantum_private.tonight_allocator_failures (
    status,
    attempted_at DESC,
    round_id DESC
  );

CREATE OR REPLACE FUNCTION public.service_record_tonight_allocator_failure(
  p_round_id UUID,
  p_expected_round_revision INTEGER,
  p_lower_bound_team_count INTEGER,
  p_upper_bound_team_count INTEGER,
  p_applicant_count INTEGER,
  p_attempted_at TIMESTAMPTZ,
  p_error_code TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  mutation_outcome TEXT,
  failure_round_id UUID,
  failure_status TEXT,
  failure_revision INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round public.tonight_rounds%ROWTYPE;
BEGIN
  IF p_round_id IS NULL THEN
    RAISE EXCEPTION 'round_id_required';
  END IF;
  IF p_expected_round_revision IS NULL OR p_expected_round_revision < 0 THEN
    RAISE EXCEPTION 'expected_round_revision_required';
  END IF;
  IF p_lower_bound_team_count IS NULL OR p_lower_bound_team_count < 0
    OR p_upper_bound_team_count IS NULL
    OR p_upper_bound_team_count < p_lower_bound_team_count
    OR p_applicant_count IS NULL OR p_applicant_count < 0 OR p_applicant_count > 10000
  THEN
    RAISE EXCEPTION 'invalid_allocator_failure_counts';
  END IF;
  IF p_attempted_at IS NULL THEN
    RAISE EXCEPTION 'attempted_at_required';
  END IF;
  IF p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_]{1,80}$' THEN
    RAISE EXCEPTION 'invalid_error_code';
  END IF;
  IF p_idempotency_key IS NULL
    OR length(trim(p_idempotency_key)) < 1
    OR length(p_idempotency_key) > 160
  THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  -- Serialize against every other round transition, including allocation
  -- publication. A calculation made against an older revision must never
  -- reopen an incident after another worker has already published the round.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-round-transition:' || p_round_id::TEXT,
      0
    )
  );

  SELECT *
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;
  IF v_round.revision <> p_expected_round_revision
    OR v_round.status <> 'open'
    OR CURRENT_TIMESTAMP < v_round.allocation_publish_at
    OR CURRENT_TIMESTAMP >= v_round.deposit_due_at
  THEN
    RETURN QUERY
    SELECT 'stale'::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  INSERT INTO quantum_private.tonight_allocator_failures AS failure (
    round_id,
    lower_bound_team_count,
    upper_bound_team_count,
    applicant_count,
    attempted_at,
    error_code,
    status,
    revision,
    last_record_idempotency_key,
    last_resolve_idempotency_key,
    resolved_at,
    updated_at
  )
  VALUES (
    p_round_id,
    p_lower_bound_team_count,
    p_upper_bound_team_count,
    p_applicant_count,
    p_attempted_at,
    p_error_code,
    'open',
    0,
    p_idempotency_key,
    NULL,
    NULL,
    clock_timestamp()
  )
  ON CONFLICT (round_id) DO UPDATE
  SET
    lower_bound_team_count = EXCLUDED.lower_bound_team_count,
    upper_bound_team_count = EXCLUDED.upper_bound_team_count,
    applicant_count = EXCLUDED.applicant_count,
    attempted_at = EXCLUDED.attempted_at,
    error_code = EXCLUDED.error_code,
    status = 'open',
    revision = failure.revision + 1,
    last_record_idempotency_key = EXCLUDED.last_record_idempotency_key,
    resolved_at = NULL,
    updated_at = clock_timestamp()
  WHERE failure.last_record_idempotency_key IS DISTINCT FROM EXCLUDED.last_record_idempotency_key
    AND failure.attempted_at <= EXCLUDED.attempted_at;

  RETURN QUERY
  SELECT 'recorded'::TEXT, failure.round_id, failure.status, failure.revision
  FROM quantum_private.tonight_allocator_failures AS failure
  WHERE failure.round_id = p_round_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_resolve_tonight_allocator_failure(
  p_round_id UUID,
  p_expected_round_revision INTEGER,
  p_observed_at TIMESTAMPTZ,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  mutation_outcome TEXT,
  failure_round_id UUID,
  failure_status TEXT,
  failure_revision INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round public.tonight_rounds%ROWTYPE;
BEGIN
  IF p_round_id IS NULL THEN
    RAISE EXCEPTION 'round_id_required';
  END IF;
  IF p_expected_round_revision IS NULL OR p_expected_round_revision < 0 THEN
    RAISE EXCEPTION 'expected_round_revision_required';
  END IF;
  IF p_observed_at IS NULL THEN
    RAISE EXCEPTION 'observed_at_required';
  END IF;
  IF p_idempotency_key IS NULL
    OR length(trim(p_idempotency_key)) < 1
    OR length(p_idempotency_key) > 160
  THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  -- Publication and incident resolution are separate RPC transactions. Lock
  -- and fence this cleanup against the exact post-publication round revision
  -- so a stale worker cannot resolve a newer incident.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-round-transition:' || p_round_id::TEXT,
      0
    )
  );

  SELECT *
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;
  IF v_round.revision <> p_expected_round_revision
    OR v_round.status NOT IN ('awaiting_deposits', 'completed')
  THEN
    RETURN QUERY
    SELECT 'stale'::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  UPDATE quantum_private.tonight_allocator_failures AS failure
  SET
    status = 'resolved',
    revision = failure.revision + 1,
    last_resolve_idempotency_key = p_idempotency_key,
    resolved_at = p_observed_at,
    updated_at = clock_timestamp()
  WHERE failure.round_id = p_round_id
    AND failure.status = 'open'
    AND failure.attempted_at <= p_observed_at
    AND failure.last_resolve_idempotency_key IS DISTINCT FROM p_idempotency_key;

  RETURN QUERY
  SELECT
    CASE WHEN failure.status = 'resolved' THEN 'resolved'::TEXT ELSE 'stale'::TEXT END,
    failure.round_id,
    failure.status,
    failure.revision
  FROM quantum_private.tonight_allocator_failures AS failure
  WHERE failure.round_id = p_round_id;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 'no_failure'::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_tonight_allocator_failures(
  p_round_id UUID DEFAULT NULL,
  p_before_attempted_at TIMESTAMPTZ DEFAULT NULL,
  p_before_round_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  round_id UUID,
  lower_bound_team_count INTEGER,
  upper_bound_team_count INTEGER,
  applicant_count INTEGER,
  attempted_at TIMESTAMPTZ,
  error_code TEXT,
  status TEXT,
  revision INTEGER
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
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  IF (p_before_attempted_at IS NULL) <> (p_before_round_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_allocator_failure_cursor';
  END IF;

  RETURN QUERY
  SELECT
    failure.round_id,
    failure.lower_bound_team_count,
    failure.upper_bound_team_count,
    failure.applicant_count,
    failure.attempted_at,
    failure.error_code,
    failure.status,
    failure.revision
  FROM quantum_private.tonight_allocator_failures AS failure
  WHERE (p_round_id IS NULL OR failure.round_id = p_round_id)
    AND (
      p_before_attempted_at IS NULL
      OR (failure.attempted_at, failure.round_id) < (p_before_attempted_at, p_before_round_id)
    )
  ORDER BY failure.attempted_at DESC, failure.round_id DESC
  LIMIT p_limit + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.service_record_tonight_allocator_failure(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.service_record_tonight_allocator_failure(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.service_resolve_tonight_allocator_failure(
  UUID, INTEGER, TIMESTAMPTZ, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.service_resolve_tonight_allocator_failure(
  UUID, INTEGER, TIMESTAMPTZ, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_tonight_allocator_failures(
  UUID, TIMESTAMPTZ, UUID, INTEGER
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_tonight_allocator_failures(
  UUID, TIMESTAMPTZ, UUID, INTEGER
) TO authenticated;

COMMENT ON TABLE quantum_private.tonight_allocator_failures IS
  'PII-free current allocator failure state, one durable row per Tonight round.';
COMMENT ON FUNCTION public.admin_list_tonight_allocator_failures(
  UUID, TIMESTAMPTZ, UUID, INTEGER
) IS 'Bounded PII-free allocator failure page for admin and super-admin operations.';

COMMIT;
