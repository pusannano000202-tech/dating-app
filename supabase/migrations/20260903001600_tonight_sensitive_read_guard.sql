-- Audit and throttle PII-bearing Tonight reads. The log is append-only and the
-- rate limit is serialized per actor so serverless instances cannot bypass it.

BEGIN;

CREATE TABLE quantum_private.tonight_sensitive_read_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  surface TEXT NOT NULL CHECK (surface IN (
    'super_admin_directory',
    'super_admin_profile',
    'super_admin_diagnostics',
    'admin_exception_detail',
    'legacy_admin_user_profile',
    'legacy_admin_match_review'
  )),
  subject_key TEXT CHECK (
    subject_key IS NULL
    OR (
      pg_catalog.char_length(subject_key) BETWEEN 1 AND 128
      AND subject_key ~ '^[A-Za-z0-9:_-]+$'
    )
  ),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX tonight_sensitive_read_events_actor_time_idx
  ON quantum_private.tonight_sensitive_read_events (actor_user_id, occurred_at DESC);

ALTER TABLE quantum_private.tonight_sensitive_read_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quantum_private.tonight_sensitive_read_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE quantum_private.tonight_sensitive_read_events
  TO service_role;

CREATE TRIGGER tonight_sensitive_read_events_update_immutable
  BEFORE UPDATE ON quantum_private.tonight_sensitive_read_events
  FOR EACH ROW EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE TRIGGER tonight_sensitive_read_events_delete_immutable
  BEFORE DELETE ON quantum_private.tonight_sensitive_read_events
  FOR EACH ROW EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE OR REPLACE FUNCTION public.authorize_tonight_sensitive_read(
  p_surface TEXT,
  p_subject_key TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_minute_count INTEGER;
  v_hour_count INTEGER;
  v_event_id BIGINT;
BEGIN
  IF v_caller IS NULL OR (SELECT auth.role()) IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF p_surface IS NULL OR p_surface NOT IN (
    'super_admin_directory',
    'super_admin_profile',
    'super_admin_diagnostics',
    'admin_exception_detail',
    'legacy_admin_user_profile',
    'legacy_admin_match_review'
  ) THEN
    RAISE EXCEPTION 'invalid_sensitive_read_surface';
  END IF;
  IF p_subject_key IS NOT NULL AND (
    pg_catalog.char_length(p_subject_key) NOT BETWEEN 1 AND 128
    OR p_subject_key !~ '^[A-Za-z0-9:_-]+$'
  ) THEN
    RAISE EXCEPTION 'invalid_sensitive_read_subject';
  END IF;

  IF p_surface IN (
    'super_admin_directory',
    'super_admin_profile',
    'super_admin_diagnostics',
    'legacy_admin_user_profile',
    'legacy_admin_match_review'
  ) THEN
    IF NOT public.is_super_admin(v_caller) THEN
      RAISE EXCEPTION 'super_admin_required';
    END IF;
    PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  ELSIF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_caller::TEXT, 0)
  );
  SELECT
    pg_catalog.count(*) FILTER (
      WHERE event.occurred_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute'
    ),
    pg_catalog.count(*) FILTER (
      WHERE event.occurred_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
    )
  INTO v_minute_count, v_hour_count
  FROM quantum_private.tonight_sensitive_read_events AS event
  WHERE event.actor_user_id = v_caller
    AND event.occurred_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour';

  IF v_minute_count >= 60 OR v_hour_count >= 500 THEN
    RAISE EXCEPTION 'sensitive_read_rate_limited';
  END IF;

  INSERT INTO quantum_private.tonight_sensitive_read_events (
    actor_user_id, surface, subject_key, occurred_at
  ) VALUES (
    v_caller, p_surface, p_subject_key, CURRENT_TIMESTAMP
  ) RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_tonight_sensitive_read(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.authorize_tonight_sensitive_read(TEXT, TEXT)
  TO authenticated;

COMMIT;
