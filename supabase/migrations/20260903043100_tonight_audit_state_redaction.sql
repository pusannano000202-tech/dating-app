-- Redact sensitive audit payload keys inside the database so direct Data API
-- calls cannot bypass the API route's defense-in-depth sanitizer.

BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.redact_tonight_audit_state(
  p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
RETURNS NULL ON NULL INPUT
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_redacted JSONB;
BEGIN
  CASE pg_catalog.jsonb_typeof(p_value)
    WHEN 'object' THEN
      SELECT COALESCE(
        pg_catalog.jsonb_object_agg(
          entry.key,
          quantum_private.redact_tonight_audit_state(entry.value)
        ),
        '{}'::JSONB
      )
      INTO v_redacted
      FROM pg_catalog.jsonb_each(p_value) AS entry(key, value)
      WHERE entry.key !~* '(?:payment_key|secret|token|password|phone|photo|idempotency)';
      RETURN v_redacted;
    WHEN 'array' THEN
      SELECT COALESCE(
        pg_catalog.jsonb_agg(
          quantum_private.redact_tonight_audit_state(item.value)
          ORDER BY item.position
        ),
        '[]'::JSONB
      )
      INTO v_redacted
      FROM pg_catalog.jsonb_array_elements(p_value)
        WITH ORDINALITY AS item(value, position);
      RETURN v_redacted;
    ELSE
      RETURN p_value;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.redact_tonight_audit_state(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.super_admin_list_tonight_audit_events(
  p_round_id UUID,
  p_before_occurred_at TIMESTAMPTZ,
  p_before_id BIGINT,
  p_limit INTEGER
)
RETURNS TABLE (
  audit_id BIGINT,
  audit_cursor_id TEXT,
  audit_entity_type TEXT,
  audit_entity_id UUID,
  audit_action TEXT,
  audit_actor_user_id UUID,
  audit_actor_kind TEXT,
  audit_occurred_at TIMESTAMPTZ,
  audit_before_state JSONB,
  audit_after_state JSONB
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

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  IF (p_before_occurred_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_audit_cursor';
  END IF;
  IF p_round_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tonight_rounds AS round_row
    WHERE round_row.id = p_round_id
  ) THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;

  IF p_round_id IS NULL THEN
    RETURN QUERY
    SELECT
      audit.id,
      audit.id::TEXT AS audit_cursor_id,
      audit.entity_type,
      audit.entity_id,
      audit.action,
      audit.actor_user_id,
      audit.actor_kind,
      audit.occurred_at,
      quantum_private.redact_tonight_audit_state(audit.before_state),
      quantum_private.redact_tonight_audit_state(audit.after_state)
    FROM quantum_private.tonight_audit_events AS audit
    WHERE p_before_occurred_at IS NULL
      OR (audit.occurred_at, audit.id) < (p_before_occurred_at, p_before_id)
    ORDER BY audit.occurred_at DESC, audit.id DESC
    LIMIT p_limit + 1;
  ELSE
    RETURN QUERY
    SELECT
      audit.id,
      audit.id::TEXT AS audit_cursor_id,
      audit.entity_type,
      audit.entity_id,
      audit.action,
      audit.actor_user_id,
      audit.actor_kind,
      audit.occurred_at,
      quantum_private.redact_tonight_audit_state(audit.before_state),
      quantum_private.redact_tonight_audit_state(audit.after_state)
    FROM quantum_private.tonight_audit_round_projection AS projection
    JOIN quantum_private.tonight_audit_events AS audit
      ON audit.id = projection.audit_id
    WHERE projection.round_id = p_round_id
      AND (
        p_before_occurred_at IS NULL
        OR (projection.occurred_at, projection.audit_id) < (p_before_occurred_at, p_before_id)
      )
    ORDER BY projection.occurred_at DESC, projection.audit_id DESC
    LIMIT p_limit + 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_list_tonight_audit_events(
  UUID, TIMESTAMPTZ, BIGINT, INTEGER
)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_list_tonight_audit_events(
  UUID, TIMESTAMPTZ, BIGINT, INTEGER
)
  TO authenticated;

COMMENT ON FUNCTION quantum_private.redact_tonight_audit_state(JSONB) IS
  'Recursively removes sensitive object keys before audit state reaches browser clients.';
COMMENT ON FUNCTION public.super_admin_list_tonight_audit_events(UUID, TIMESTAMPTZ, BIGINT, INTEGER) IS
  'Recent-super-admin audit page with stable keyset pagination and database-redacted state.';

COMMIT;
