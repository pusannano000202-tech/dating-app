-- Keep a durable optimistic-concurrency high-water for each account and venue.
-- The public membership table is historical, but every grant creates a new row;
-- without this tombstone a revoked pair appears absent and can reset to revision
-- zero (ABA). This follow-up intentionally leaves the original RBAC migration
-- immutable and replaces only the affected RPC implementations.

BEGIN;

CREATE TABLE quantum_private.venue_partner_membership_revision_states (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  active_membership_id UUID
    REFERENCES public.venue_partner_memberships(id) ON DELETE RESTRICT,
  last_role TEXT CHECK (last_role IS NULL OR last_role IN ('owner', 'staff')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, venue_id),
  CONSTRAINT venue_partner_membership_revision_state_shape CHECK (
    (
      is_active
      AND active_membership_id IS NOT NULL
      AND last_role IS NOT NULL
    )
    OR (
      NOT is_active
      AND active_membership_id IS NULL
    )
  )
);

ALTER TABLE quantum_private.venue_partner_membership_revision_states
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quantum_private.venue_partner_membership_revision_states
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

-- Old incarnations each started at revision one. Summing the terminal revision
-- of every historical row reconstructs the number of real grant/revoke
-- transitions while ignoring same-role no-op grants.
INSERT INTO quantum_private.venue_partner_membership_revision_states (
  user_id,
  venue_id,
  revision,
  is_active,
  active_membership_id,
  last_role
)
SELECT
  membership.user_id,
  membership.venue_id,
  SUM(membership.revision)::INTEGER,
  pg_catalog.bool_or(membership.revoked_at IS NULL),
  CASE
    WHEN pg_catalog.bool_or(membership.revoked_at IS NULL)
    THEN (
      pg_catalog.array_agg(
        membership.id
        ORDER BY
          (membership.revoked_at IS NULL) DESC,
          COALESCE(membership.revoked_at, membership.granted_at) DESC,
          membership.id DESC
      )
    )[1]
    ELSE NULL
  END,
  (
    pg_catalog.array_agg(
      membership.role
      ORDER BY
        (membership.revoked_at IS NULL) DESC,
        COALESCE(membership.revoked_at, membership.granted_at) DESC,
        membership.id DESC
    )
  )[1]
FROM public.venue_partner_memberships AS membership
GROUP BY membership.user_id, membership.venue_id;

CREATE OR REPLACE FUNCTION public.super_admin_get_venue_partner_membership_state(
  p_user_id UUID,
  p_venue_id UUID
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
  revision INTEGER,
  is_active BOOLEAN
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
  IF p_user_id IS NULL OR p_venue_id IS NULL THEN
    RAISE EXCEPTION 'invalid_venue_partner_membership_target';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

  RETURN QUERY
  SELECT
    CASE
      WHEN COALESCE(state.is_active, FALSE) THEN state.active_membership_id
      ELSE latest.id
    END,
    p_user_id,
    p_venue_id,
    COALESCE(state.last_role, latest.role),
    latest.granted_by,
    latest.granted_at,
    latest.revoked_by,
    latest.revoked_at,
    COALESCE(state.revision, 0),
    COALESCE(state.is_active, FALSE)
  FROM (SELECT 1) AS singleton
  LEFT JOIN quantum_private.venue_partner_membership_revision_states AS state
    ON state.user_id = p_user_id
    AND state.venue_id = p_venue_id
  LEFT JOIN LATERAL (
    SELECT history.*
    FROM public.venue_partner_memberships AS history
    WHERE history.user_id = p_user_id
      AND history.venue_id = p_venue_id
    ORDER BY
      (history.revoked_at IS NULL) DESC,
      COALESCE(history.revoked_at, history.granted_at) DESC,
      history.id DESC
    LIMIT 1
  ) AS latest ON TRUE;
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
  state_row quantum_private.venue_partner_membership_revision_states%ROWTYPE;
  replay_event quantum_private.venue_partner_membership_events%ROWTYPE;
  v_membership_found BOOLEAN;
  v_seed_revision INTEGER;
  v_result_revision INTEGER;
  v_request_payload JSONB;
  v_before_state JSONB;
  v_after_state JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_user_id IS NULL OR p_venue_id IS NULL THEN
    RAISE EXCEPTION 'invalid_venue_partner_membership_target';
  END IF;
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
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

  v_request_payload := pg_catalog.jsonb_build_object(
    'expected_revision', p_expected_revision,
    'role', p_role,
    'user_id', p_user_id,
    'venue_id', p_venue_id
  );

  -- This is deliberately the same venue-wide lock used by revoke. It keeps
  -- last-partner checks, active uniqueness and the pair high-water in one
  -- serial order even when different super-admins act concurrently.
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
    IF replay_event.event_type <> 'grant'
      OR replay_event.request_payload <> v_request_payload
    THEN
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
  v_membership_found := FOUND;

  SELECT COALESCE(SUM(history.revision), 0)::INTEGER
  INTO v_seed_revision
  FROM public.venue_partner_memberships AS history
  WHERE history.user_id = p_user_id
    AND history.venue_id = p_venue_id;

  INSERT INTO quantum_private.venue_partner_membership_revision_states (
    user_id,
    venue_id,
    revision,
    is_active,
    active_membership_id,
    last_role
  )
  VALUES (
    p_user_id,
    p_venue_id,
    v_seed_revision,
    v_membership_found,
    CASE WHEN v_membership_found THEN membership.id ELSE NULL END,
    CASE WHEN v_membership_found THEN membership.role ELSE NULL END
  )
  ON CONFLICT (user_id, venue_id) DO NOTHING;

  SELECT state.*
  INTO state_row
  FROM quantum_private.venue_partner_membership_revision_states AS state
  WHERE state.user_id = p_user_id
    AND state.venue_id = p_venue_id
  FOR UPDATE;

  IF state_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'venue_partner_membership_revision_conflict';
  END IF;
  IF state_row.is_active <> v_membership_found
    OR (
      v_membership_found
      AND (
        state_row.active_membership_id IS DISTINCT FROM membership.id
        OR state_row.last_role IS DISTINCT FROM membership.role
      )
    )
  THEN
    RAISE EXCEPTION 'venue_partner_membership_state_inconsistent';
  END IF;

  IF v_membership_found THEN
    IF membership.role <> p_role THEN
      RAISE EXCEPTION 'active_partner_role_conflict';
    END IF;

    v_before_state := pg_catalog.to_jsonb(membership)
      || pg_catalog.jsonb_build_object('state_revision', state_row.revision);
    PERFORM quantum_private.write_venue_partner_membership_event(
      membership.id,
      'grant',
      v_request_payload,
      v_before_state,
      v_before_state,
      state_row.revision,
      p_idempotency_key
    );
    RETURN membership.id;
  END IF;

  IF state_row.revision >= 2147483647 THEN
    RAISE EXCEPTION 'venue_partner_membership_revision_exhausted';
  END IF;
  v_result_revision := state_row.revision + 1;
  v_before_state := pg_catalog.jsonb_build_object(
    'active_membership_id', NULL,
    'role', state_row.last_role,
    'revision', state_row.revision
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
    v_result_revision
  )
  RETURNING * INTO membership;

  UPDATE quantum_private.venue_partner_membership_revision_states
  SET revision = v_result_revision,
      is_active = TRUE,
      active_membership_id = membership.id,
      last_role = p_role,
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id
    AND venue_id = p_venue_id
    AND revision = p_expected_revision
    AND is_active = FALSE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue_partner_membership_revision_conflict';
  END IF;

  v_after_state := pg_catalog.to_jsonb(membership)
    || pg_catalog.jsonb_build_object('state_revision', v_result_revision);
  PERFORM quantum_private.write_venue_partner_membership_event(
    membership.id,
    'grant',
    v_request_payload,
    v_before_state,
    v_after_state,
    v_result_revision,
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
  v_seed_revision INTEGER;
  v_result_revision INTEGER;
  membership public.venue_partner_memberships%ROWTYPE;
  updated_membership public.venue_partner_memberships%ROWTYPE;
  state_row quantum_private.venue_partner_membership_revision_states%ROWTYPE;
  replay_event quantum_private.venue_partner_membership_events%ROWTYPE;
  v_request_payload JSONB;
  v_before_state JSONB;
  v_after_state JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_membership_id IS NULL
    OR p_expected_revision IS NULL
    OR p_expected_revision < 1
  THEN
    RAISE EXCEPTION 'invalid_expected_revision';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 128
  THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

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
    IF replay_event.event_type <> 'revoke'
      OR replay_event.request_payload <> v_request_payload
      OR replay_event.membership_id <> p_membership_id
    THEN
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

  -- A waiter must replay only the exact canonical request that committed while
  -- it was blocked on the venue lock.
  SELECT event.*
  INTO replay_event
  FROM quantum_private.venue_partner_membership_events AS event
  WHERE event.actor_id = v_caller
    AND event.idempotency_key = pg_catalog.btrim(p_idempotency_key);

  IF replay_event.id IS NOT NULL THEN
    IF replay_event.event_type <> 'revoke'
      OR replay_event.request_payload <> v_request_payload
      OR replay_event.membership_id <> p_membership_id
    THEN
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

  SELECT COALESCE(SUM(history.revision), 0)::INTEGER
  INTO v_seed_revision
  FROM public.venue_partner_memberships AS history
  WHERE history.user_id = membership.user_id
    AND history.venue_id = membership.venue_id;

  INSERT INTO quantum_private.venue_partner_membership_revision_states (
    user_id,
    venue_id,
    revision,
    is_active,
    active_membership_id,
    last_role
  )
  VALUES (
    membership.user_id,
    membership.venue_id,
    v_seed_revision,
    TRUE,
    membership.id,
    membership.role
  )
  ON CONFLICT (user_id, venue_id) DO NOTHING;

  SELECT state.*
  INTO state_row
  FROM quantum_private.venue_partner_membership_revision_states AS state
  WHERE state.user_id = membership.user_id
    AND state.venue_id = membership.venue_id
  FOR UPDATE;

  IF state_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'venue_partner_membership_revision_conflict';
  END IF;
  IF NOT state_row.is_active
    OR state_row.active_membership_id IS DISTINCT FROM membership.id
    OR state_row.last_role IS DISTINCT FROM membership.role
  THEN
    RAISE EXCEPTION 'venue_partner_membership_state_inconsistent';
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

  IF state_row.revision >= 2147483647 THEN
    RAISE EXCEPTION 'venue_partner_membership_revision_exhausted';
  END IF;
  v_result_revision := state_row.revision + 1;
  v_before_state := pg_catalog.to_jsonb(membership)
    || pg_catalog.jsonb_build_object('state_revision', state_row.revision);

  UPDATE quantum_private.venue_partner_membership_revision_states
  SET revision = v_result_revision,
      is_active = FALSE,
      active_membership_id = NULL,
      last_role = membership.role,
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = membership.user_id
    AND venue_id = membership.venue_id
    AND revision = p_expected_revision
    AND is_active = TRUE
    AND active_membership_id = membership.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue_partner_membership_revision_conflict';
  END IF;

  UPDATE public.venue_partner_memberships AS target
  SET revoked_at = CURRENT_TIMESTAMP,
      revoked_by = v_caller,
      revision = membership.revision + 1
  WHERE target.id = p_membership_id
  RETURNING target.* INTO updated_membership;

  v_after_state := pg_catalog.to_jsonb(updated_membership)
    || pg_catalog.jsonb_build_object('state_revision', v_result_revision);
  PERFORM quantum_private.write_venue_partner_membership_event(
    updated_membership.id,
    'revoke',
    v_request_payload,
    v_before_state,
    v_after_state,
    v_result_revision,
    p_idempotency_key
  );

  RETURN TRUE;
END;
$$;

-- Preserve the existing bounded page signature. Only the currently active row
-- projects the durable state revision, so revoke callers receive the same CAS
-- token as grant callers while historical revisions remain immutable evidence.
CREATE OR REPLACE FUNCTION public.super_admin_list_venue_partner_memberships_page(
  p_limit INTEGER DEFAULT 50,
  p_after_membership_id UUID DEFAULT NULL,
  p_venue_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
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
  v_cursor_granted_at TIMESTAMPTZ;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  IF p_include_revoked IS NULL THEN RAISE EXCEPTION 'include_revoked_required'; END IF;

  IF p_after_membership_id IS NOT NULL THEN
    SELECT membership.granted_at
    INTO v_cursor_granted_at
    FROM public.venue_partner_memberships AS membership
    WHERE membership.id = p_after_membership_id
      AND (p_venue_id IS NULL OR membership.venue_id = p_venue_id)
      AND (p_user_id IS NULL OR membership.user_id = p_user_id)
      AND (p_include_revoked OR membership.revoked_at IS NULL);
    IF NOT FOUND THEN RAISE EXCEPTION 'membership_cursor_not_found'; END IF;
  END IF;

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
    CASE
      WHEN state.is_active
        AND state.active_membership_id = membership.id
      THEN state.revision
      ELSE membership.revision
    END
  FROM public.venue_partner_memberships AS membership
  LEFT JOIN quantum_private.venue_partner_membership_revision_states AS state
    ON state.user_id = membership.user_id
    AND state.venue_id = membership.venue_id
  WHERE (p_venue_id IS NULL OR membership.venue_id = p_venue_id)
    AND (p_user_id IS NULL OR membership.user_id = p_user_id)
    AND (p_include_revoked OR membership.revoked_at IS NULL)
    AND (
      p_after_membership_id IS NULL
      OR membership.granted_at < v_cursor_granted_at
      OR (
        membership.granted_at = v_cursor_granted_at
        AND membership.id < p_after_membership_id
      )
    )
  ORDER BY membership.granted_at DESC, membership.id DESC
  LIMIT p_limit + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_get_venue_partner_membership(
  p_membership_id UUID
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
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_membership_id IS NULL THEN RAISE EXCEPTION 'membership_id_required'; END IF;

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
    CASE
      WHEN state.is_active
        AND state.active_membership_id = membership.id
      THEN state.revision
      ELSE membership.revision
    END
  FROM public.venue_partner_memberships AS membership
  LEFT JOIN quantum_private.venue_partner_membership_revision_states AS state
    ON state.user_id = membership.user_id
    AND state.venue_id = membership.venue_id
  WHERE membership.id = p_membership_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_get_venue_partner_membership_state(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.grant_venue_partner_membership(UUID, UUID, TEXT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_venue_partner_membership(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_list_venue_partner_memberships_page(INTEGER, UUID, UUID, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_get_venue_partner_membership(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.super_admin_get_venue_partner_membership_state(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_venue_partner_membership(UUID, UUID, TEXT, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_venue_partner_membership(UUID, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_list_venue_partner_memberships_page(INTEGER, UUID, UUID, UUID, BOOLEAN)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_get_venue_partner_membership(UUID)
  TO authenticated;

COMMENT ON TABLE quantum_private.venue_partner_membership_revision_states IS
  'Private per-account/per-venue CAS high-water retained across revoke and regrant incarnations.';
COMMENT ON FUNCTION public.super_admin_get_venue_partner_membership_state(UUID, UUID) IS
  'Recently reauthenticated super-admin target lookup that returns zero for never granted and a durable tombstone revision after revoke.';

COMMIT;
