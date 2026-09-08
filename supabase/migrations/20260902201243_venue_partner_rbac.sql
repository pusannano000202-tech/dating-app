-- Venue-partner authorization is stored in the database so revocation takes
-- effect immediately. Browser roles never receive direct table privileges.

BEGIN;

CREATE SCHEMA IF NOT EXISTS quantum_private;
REVOKE ALL ON SCHEMA quantum_private
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION quantum_private.require_recent_super_admin_auth(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session_id_text TEXT := auth.jwt() ->> 'session_id';
  v_session_id UUID;
  v_session_created_at TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'reauthentication_required';
  END IF;

  IF NOT public.is_super_admin(p_user_id) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  IF v_session_id_text IS NULL
    OR v_session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'reauthentication_required';
  END IF;

  v_session_id := v_session_id_text::UUID;

  SELECT session_row.created_at
  INTO v_session_created_at
  FROM auth.sessions AS session_row
  WHERE session_row.id = v_session_id
    AND session_row.user_id = p_user_id;

  IF NOT FOUND
    OR v_session_created_at IS NULL
    OR v_session_created_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
    OR v_session_created_at > CURRENT_TIMESTAMP + INTERVAL '5 minutes'
  THEN
    RAISE EXCEPTION 'reauthentication_required';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.require_recent_super_admin_auth(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verify_recent_super_admin_session()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM quantum_private.require_recent_super_admin_auth(auth.uid());
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_recent_super_admin_session()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.verify_recent_super_admin_session()
  TO authenticated;

CREATE TABLE public.venue_partner_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  granted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  revoked_at TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  CONSTRAINT venue_partner_memberships_revocation_pair CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);

CREATE TABLE quantum_private.venue_partner_membership_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL
    REFERENCES public.venue_partner_memberships(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('grant', 'revoke')),
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_payload JSONB NOT NULL,
  before_state JSONB NOT NULL,
  after_state JSONB NOT NULL,
  membership_revision INTEGER NOT NULL CHECK (membership_revision > 0),
  idempotency_key TEXT NOT NULL CHECK (
    pg_catalog.length(pg_catalog.btrim(idempotency_key)) BETWEEN 1 AND 128
  )
);

CREATE UNIQUE INDEX venue_partner_memberships_one_active_per_user_venue
  ON public.venue_partner_memberships (user_id, venue_id)
  WHERE revoked_at IS NULL;

CREATE INDEX venue_partner_memberships_active_venue_lookup
  ON public.venue_partner_memberships (venue_id, user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX venue_partner_memberships_user_history
  ON public.venue_partner_memberships (user_id, granted_at DESC);

CREATE UNIQUE INDEX venue_partner_membership_events_actor_idempotency
  ON quantum_private.venue_partner_membership_events (actor_id, idempotency_key);

CREATE INDEX venue_partner_membership_events_membership_history
  ON quantum_private.venue_partner_membership_events (
    membership_id,
    occurred_at DESC,
    id
  );

ALTER TABLE public.venue_partner_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_private.venue_partner_membership_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.venue_partner_memberships
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.venue_partner_memberships
  TO service_role;

REVOKE ALL ON TABLE quantum_private.venue_partner_membership_events
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA quantum_private TO service_role;
GRANT SELECT ON TABLE quantum_private.venue_partner_membership_events
  TO service_role;

CREATE OR REPLACE FUNCTION quantum_private.guard_venue_partner_membership_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'venue_partner_membership_delete_forbidden';
  END IF;

  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'venue_partner_membership_history_is_immutable';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.venue_id IS DISTINCT FROM OLD.venue_id
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
    OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.revoked_at IS NULL
    OR NEW.revoked_by IS NULL
    OR NEW.revision <> OLD.revision + 1
  THEN
    RAISE EXCEPTION 'invalid_venue_partner_membership_transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION quantum_private.prevent_venue_partner_membership_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'venue_partner_membership_events_are_immutable';
END;
$$;

CREATE TRIGGER venue_partner_memberships_guard_update
  BEFORE UPDATE ON public.venue_partner_memberships
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.guard_venue_partner_membership_transition();

CREATE TRIGGER venue_partner_memberships_guard_delete
  BEFORE DELETE ON public.venue_partner_memberships
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.guard_venue_partner_membership_transition();

CREATE TRIGGER venue_partner_membership_events_no_update
  BEFORE UPDATE ON quantum_private.venue_partner_membership_events
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_venue_partner_membership_event_mutation();

CREATE TRIGGER venue_partner_membership_events_no_delete
  BEFORE DELETE ON quantum_private.venue_partner_membership_events
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_venue_partner_membership_event_mutation();

CREATE OR REPLACE FUNCTION quantum_private.write_venue_partner_membership_event(
  p_membership_id UUID,
  p_event_type TEXT,
  p_request_payload JSONB,
  p_before_state JSONB,
  p_after_state JSONB,
  p_membership_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_event_id UUID;
  existing quantum_private.venue_partner_membership_events%ROWTYPE;
  v_existing_signature JSONB;
  v_expected_signature JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_event_type NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'invalid_venue_partner_membership_event_type';
  END IF;
  IF p_request_payload IS NULL OR p_before_state IS NULL OR p_after_state IS NULL THEN
    RAISE EXCEPTION 'venue_partner_membership_event_state_required';
  END IF;
  IF p_membership_revision IS NULL OR p_membership_revision < 1 THEN
    RAISE EXCEPTION 'invalid_venue_partner_membership_revision';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 128
  THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  INSERT INTO quantum_private.venue_partner_membership_events (
    membership_id,
    event_type,
    actor_id,
    occurred_at,
    request_payload,
    before_state,
    after_state,
    membership_revision,
    idempotency_key
  )
  VALUES (
    p_membership_id,
    p_event_type,
    v_actor,
    CURRENT_TIMESTAMP,
    p_request_payload,
    p_before_state,
    p_after_state,
    p_membership_revision,
    pg_catalog.btrim(p_idempotency_key)
  )
  ON CONFLICT (actor_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NOT NULL THEN
    RETURN v_event_id;
  END IF;

  SELECT event.*
  INTO existing
  FROM quantum_private.venue_partner_membership_events AS event
  WHERE event.actor_id = v_actor
    AND event.idempotency_key = pg_catalog.btrim(p_idempotency_key);

  v_existing_signature := pg_catalog.jsonb_build_object(
    'membership_id', existing.membership_id,
    'event_type', existing.event_type,
    'request_payload', existing.request_payload,
    'before_state', existing.before_state,
    'after_state', existing.after_state,
    'membership_revision', existing.membership_revision
  );
  v_expected_signature := pg_catalog.jsonb_build_object(
    'membership_id', p_membership_id,
    'event_type', p_event_type,
    'request_payload', p_request_payload,
    'before_state', p_before_state,
    'after_state', p_after_state,
    'membership_revision', p_membership_revision
  );

  IF existing.id IS NULL OR v_existing_signature <> v_expected_signature THEN
    RAISE EXCEPTION 'venue_partner_membership_event_idempotency_conflict';
  END IF;

  RETURN existing.id;
END;
$$;

-- Tonight tables are created by later migrations. Until the post-ledger guard
-- replaces this function, fail closed instead of allowing the last responsible
-- partner to be removed during a partially-applied migration set.
CREATE OR REPLACE FUNCTION quantum_private.venue_has_live_tonight_obligations(
  p_venue_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_venue_id IS NULL THEN
    RAISE EXCEPTION 'invalid_venue_id';
  END IF;

  RAISE EXCEPTION 'venue_partner_obligation_state_unavailable';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_venue_partner(
  p_venue_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL OR p_user_id IS NULL OR p_user_id <> v_caller THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.venue_partner_memberships AS membership
    WHERE membership.user_id = v_caller
      AND membership.venue_id = p_venue_id
      AND membership.revoked_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_access_context()
RETURNS TABLE (
  access_role TEXT,
  partner_venue_ids UUID[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_admin_role TEXT;
  v_partner_venue_ids UUID[];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT admin_row.role
  INTO v_admin_role
  FROM public.admins AS admin_row
  WHERE admin_row.user_id = v_caller;

  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT membership.venue_id ORDER BY membership.venue_id),
    ARRAY[]::UUID[]
  )
  INTO v_partner_venue_ids
  FROM public.venue_partner_memberships AS membership
  WHERE membership.user_id = v_caller
    AND membership.revoked_at IS NULL;

  RETURN QUERY
  SELECT
    CASE
      WHEN v_admin_role = 'super_admin' THEN 'super_admin'
      WHEN v_admin_role = 'admin' THEN 'admin'
      WHEN pg_catalog.cardinality(v_partner_venue_ids) > 0 THEN 'partner'
      ELSE 'user'
    END,
    v_partner_venue_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_partner_venues()
RETURNS TABLE (
  venue_id UUID,
  venue_name TEXT,
  venue_category TEXT,
  venue_address TEXT,
  area_label TEXT,
  membership_role TEXT
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

  RETURN QUERY
  SELECT
    venue.id,
    venue.name,
    venue.category,
    venue.address,
    COALESCE(
      NULLIF(pg_catalog.btrim(venue.area), ''),
      NULLIF(pg_catalog.btrim(venue.nearest_school), ''),
      venue.address
    ),
    membership.role
  FROM public.venue_partner_memberships AS membership
  JOIN public.venues AS venue
    ON venue.id = membership.venue_id
  WHERE membership.user_id = v_caller
    AND membership.revoked_at IS NULL
  ORDER BY venue.name, venue.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_venue_partner_membership(
  p_user_id UUID,
  p_venue_id UUID,
  p_role TEXT,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  membership public.venue_partner_memberships%ROWTYPE;
  replay_event quantum_private.venue_partner_membership_events%ROWTYPE;
  v_request_payload JSONB;
  v_before_state JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_role NOT IN ('owner', 'staff') THEN
    RAISE EXCEPTION 'invalid_partner_role';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'invalid_expected_revision';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 128
  THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'expected_revision', p_expected_revision,
    'role', p_role,
    'user_id', p_user_id,
    'venue_id', p_venue_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'venue-partner-venue:' || p_venue_id::TEXT,
      0
    )
  );

  SELECT event.*
  INTO replay_event
  FROM quantum_private.venue_partner_membership_events AS event
  WHERE event.actor_id = v_caller
    AND event.idempotency_key = pg_catalog.btrim(p_idempotency_key);

  IF replay_event.id IS NOT NULL THEN
    IF replay_event.event_type <> 'grant' OR replay_event.request_payload <> v_request_payload THEN
      RAISE EXCEPTION 'venue_partner_membership_event_idempotency_conflict';
    END IF;
    RETURN replay_event.membership_id;
  END IF;

  SELECT active_membership.*
  INTO membership
  FROM public.venue_partner_memberships AS active_membership
  WHERE active_membership.user_id = p_user_id
    AND active_membership.venue_id = p_venue_id
    AND active_membership.revoked_at IS NULL
  FOR UPDATE;

  IF membership.id IS NOT NULL THEN
    IF membership.role = p_role THEN
      IF membership.revision <> p_expected_revision THEN
        RAISE EXCEPTION 'venue_partner_membership_revision_conflict';
      END IF;

      PERFORM quantum_private.write_venue_partner_membership_event(
        membership.id,
        'grant',
        v_request_payload,
        pg_catalog.to_jsonb(membership),
        pg_catalog.to_jsonb(membership),
        membership.revision,
        p_idempotency_key
      );
      RETURN membership.id;
    END IF;

    RAISE EXCEPTION 'active_partner_role_conflict';
  END IF;

  IF p_expected_revision <> 0 THEN
    RAISE EXCEPTION 'venue_partner_membership_revision_conflict';
  END IF;

  v_before_state := pg_catalog.jsonb_build_object(
    'active_membership_id', NULL,
    'revision', 0
  );

  INSERT INTO public.venue_partner_memberships (
    user_id,
    venue_id,
    role,
    granted_by,
    granted_at,
    revision
  )
  VALUES (
    p_user_id,
    p_venue_id,
    p_role,
    v_caller,
    CURRENT_TIMESTAMP,
    1
  )
  RETURNING * INTO membership;

  PERFORM quantum_private.write_venue_partner_membership_event(
    membership.id,
    'grant',
    v_request_payload,
    v_before_state,
    pg_catalog.to_jsonb(membership),
    membership.revision,
    p_idempotency_key
  );

  RETURN membership.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_venue_partner_membership(
  p_membership_id UUID,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_membership_venue_id UUID;
  v_has_other_active_partner BOOLEAN;
  membership public.venue_partner_memberships%ROWTYPE;
  updated_membership public.venue_partner_memberships%ROWTYPE;
  replay_event quantum_private.venue_partner_membership_events%ROWTYPE;
  v_request_payload JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'invalid_expected_revision';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 128
  THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'expected_revision', p_expected_revision,
    'membership_id', p_membership_id
  );

  SELECT event.*
  INTO replay_event
  FROM quantum_private.venue_partner_membership_events AS event
  WHERE event.actor_id = v_caller
    AND event.idempotency_key = pg_catalog.btrim(p_idempotency_key);

  IF replay_event.id IS NOT NULL THEN
    IF replay_event.event_type <> 'revoke' OR replay_event.request_payload <> v_request_payload THEN
      RAISE EXCEPTION 'venue_partner_membership_event_idempotency_conflict';
    END IF;
    RETURN TRUE;
  END IF;

  SELECT existing_membership.venue_id
  INTO v_membership_venue_id
  FROM public.venue_partner_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id;

  IF v_membership_venue_id IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'venue-partner-venue:' || v_membership_venue_id::TEXT,
      0
    )
  );

  -- A concurrent identical revoke may have committed while this transaction
  -- waited for the venue lock. Resolve that canonical replay before reading
  -- the now-revoked membership state so the retry succeeds idempotently.
  SELECT event.*
  INTO replay_event
  FROM quantum_private.venue_partner_membership_events AS event
  WHERE event.actor_id = v_caller
    AND event.idempotency_key = pg_catalog.btrim(p_idempotency_key);

  IF replay_event.id IS NOT NULL THEN
    IF replay_event.event_type <> 'revoke' OR replay_event.request_payload <> v_request_payload THEN
      RAISE EXCEPTION 'venue_partner_membership_event_idempotency_conflict';
    END IF;
    RETURN TRUE;
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.venue_partner_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF membership.id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF membership.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'venue_partner_membership_already_revoked';
  END IF;
  IF membership.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'venue_partner_membership_revision_conflict';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.venue_partner_memberships AS other_membership
    WHERE other_membership.venue_id = membership.venue_id
      AND other_membership.id <> membership.id
      AND other_membership.revoked_at IS NULL
  )
  INTO v_has_other_active_partner;

  IF NOT v_has_other_active_partner
    AND quantum_private.venue_has_live_tonight_obligations(membership.venue_id)
  THEN
    RAISE EXCEPTION 'venue_partner_last_active_has_live_obligations';
  END IF;

  UPDATE public.venue_partner_memberships AS target
  SET revoked_at = CURRENT_TIMESTAMP,
      revoked_by = v_caller,
      revision = membership.revision + 1
  WHERE target.id = p_membership_id
  RETURNING target.* INTO updated_membership;

  PERFORM quantum_private.write_venue_partner_membership_event(
    updated_membership.id,
    'revoke',
    v_request_payload,
    pg_catalog.to_jsonb(membership),
    pg_catalog.to_jsonb(updated_membership),
    updated_membership.revision,
    p_idempotency_key
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_venue_partner_memberships(
  p_venue_id UUID DEFAULT NULL,
  p_include_revoked BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  membership_id UUID,
  user_id UUID,
  venue_id UUID,
  membership_role TEXT,
  granted_by UUID,
  granted_at TIMESTAMPTZ,
  revoked_by UUID,
  revoked_at TIMESTAMPTZ,
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
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

  RETURN QUERY
  SELECT
    membership.id,
    membership.user_id,
    membership.venue_id,
    membership.role,
    membership.granted_by,
    membership.granted_at,
    membership.revoked_by,
    membership.revoked_at,
    membership.revision
  FROM public.venue_partner_memberships AS membership
  WHERE (p_venue_id IS NULL OR membership.venue_id = p_venue_id)
    AND (p_include_revoked OR membership.revoked_at IS NULL)
  ORDER BY membership.granted_at DESC, membership.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_venue_partner_membership_events(
  p_membership_id UUID DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  membership_id UUID,
  event_type TEXT,
  actor_id UUID,
  occurred_at TIMESTAMPTZ,
  before_state JSONB,
  after_state JSONB,
  membership_revision INTEGER,
  idempotency_key TEXT
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
    event.id,
    event.membership_id,
    event.event_type,
    event.actor_id,
    event.occurred_at,
    event.before_state,
    event.after_state,
    event.membership_revision,
    event.idempotency_key
  FROM quantum_private.venue_partner_membership_events AS event
  WHERE p_membership_id IS NULL OR event.membership_id = p_membership_id
  ORDER BY event.occurred_at DESC, event.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.is_venue_partner(UUID, UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_access_context()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_my_partner_venues()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_venue_partner_membership(UUID, UUID, TEXT, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_venue_partner_membership(UUID, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_venue_partner_memberships(UUID, BOOLEAN)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_venue_partner_membership_events(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION quantum_private.guard_venue_partner_membership_transition()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.prevent_venue_partner_membership_event_mutation()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.write_venue_partner_membership_event(
  UUID, TEXT, JSONB, JSONB, JSONB, INTEGER, TEXT
)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.venue_has_live_tonight_obligations(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_venue_partner(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_access_context()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_partner_venues()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_venue_partner_membership(UUID, UUID, TEXT, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_venue_partner_membership(UUID, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_venue_partner_memberships(UUID, BOOLEAN)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_venue_partner_membership_events(UUID)
  TO authenticated;

COMMENT ON TABLE public.venue_partner_memberships IS
  'Historical venue ownership and staff membership. Role changes require revoke then insert; revoked_at NULL is the only active state.';
COMMENT ON TABLE quantum_private.venue_partner_membership_events IS
  'Append-only grant/revoke ledger with actor, database time, before/after state, revision and exact idempotency.';
COMMENT ON FUNCTION public.get_access_context() IS
  'Returns only caller role precedence and live partner venue ids; authorization never trusts JWT metadata.';
COMMENT ON FUNCTION public.list_my_partner_venues() IS
  'Caller-scoped safe venue allowlist for the partner portal.';
COMMENT ON FUNCTION public.grant_venue_partner_membership(UUID, UUID, TEXT, INTEGER, TEXT) IS
  'Super-admin-only idempotent grant. Existing active roles are never overwritten.';
COMMENT ON FUNCTION public.revoke_venue_partner_membership(UUID, INTEGER, TEXT) IS
  'Super-admin-only revision-checked revoke that preserves history and the last responsible partner while live venue obligations remain.';

COMMIT;
