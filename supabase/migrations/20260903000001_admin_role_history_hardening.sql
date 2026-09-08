-- Harden operator role changes with optimistic concurrency, exact idempotency,
-- self-lockout prevention and an immutable private before/after ledger.

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.admins
  DROP CONSTRAINT IF EXISTS admins_revision_positive;
ALTER TABLE public.admins
  ADD CONSTRAINT admins_revision_positive CHECK (revision > 0);

-- `public.admins` is the live authorization set and rows are deleted on revoke.
-- Keep the optimistic-concurrency high-water separately so a revoke/regrant
-- cycle can never reset a target back to revision zero (ABA).
CREATE TABLE quantum_private.admin_role_revision_states (
  target_user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  last_role TEXT CHECK (last_role IS NULL OR last_role IN ('admin', 'super_admin')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE quantum_private.admin_role_revision_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quantum_private.admin_role_revision_states
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

-- Preserve the revision of owners/operators that existed before this migration.
INSERT INTO quantum_private.admin_role_revision_states (
  target_user_id,
  revision,
  is_active,
  last_role
)
SELECT
  admin.user_id,
  admin.revision,
  TRUE,
  admin.role
FROM public.admins AS admin
ON CONFLICT (target_user_id) DO UPDATE
SET revision = GREATEST(
      quantum_private.admin_role_revision_states.revision,
      EXCLUDED.revision
    ),
    is_active = TRUE,
    last_role = EXCLUDED.last_role,
    updated_at = CURRENT_TIMESTAMP;

CREATE TABLE quantum_private.admin_role_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('grant', 'role_change', 'revoke')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_payload JSONB NOT NULL,
  before_state JSONB NOT NULL,
  after_state JSONB NOT NULL,
  result_revision INTEGER NOT NULL CHECK (result_revision > 0),
  idempotency_key TEXT NOT NULL CHECK (
    pg_catalog.length(pg_catalog.btrim(idempotency_key)) BETWEEN 1 AND 160
  ),
  UNIQUE (actor_user_id, idempotency_key)
);

ALTER TABLE quantum_private.admin_role_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quantum_private.admin_role_events
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION quantum_private.prevent_admin_role_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'admin_role_events_are_immutable';
END;
$$;

DROP TRIGGER IF EXISTS admin_role_events_no_update
  ON quantum_private.admin_role_events;
CREATE TRIGGER admin_role_events_no_update
  BEFORE UPDATE ON quantum_private.admin_role_events
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_admin_role_event_mutation();

DROP TRIGGER IF EXISTS admin_role_events_no_delete
  ON quantum_private.admin_role_events;
CREATE TRIGGER admin_role_events_no_delete
  BEFORE DELETE ON quantum_private.admin_role_events
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_admin_role_event_mutation();

-- Disable the unrevisioned legacy signatures. Bootstrap of the first owner is
-- an explicit service-role SQL operation, not a public RPC.
CREATE OR REPLACE FUNCTION public.grant_admin(
  p_user_id UUID,
  p_role TEXT DEFAULT 'admin',
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_admin_role_rpc';
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_admin_role_rpc';
END;
$$;

-- A targeted read always returns one row. A never-granted account has revision
-- zero; a revoked account returns its durable tombstone revision. The live
-- `admins` fallback preserves the explicit service-role bootstrap path for the
-- first owner if it was inserted after this migration.
CREATE OR REPLACE FUNCTION public.super_admin_get_admin_role_state(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  role TEXT,
  revision INTEGER,
  is_active BOOLEAN,
  granted_by UUID,
  granted_at TIMESTAMPTZ
)
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
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_admin_role_request';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

  RETURN QUERY
  SELECT
    p_user_id,
    COALESCE(state.last_role, admin.role),
    COALESCE(state.revision, admin.revision, 0),
    COALESCE(state.is_active, admin.user_id IS NOT NULL, FALSE),
    admin.granted_by,
    admin.granted_at
  FROM (SELECT 1) AS singleton
  LEFT JOIN quantum_private.admin_role_revision_states AS state
    ON state.target_user_id = p_user_id
  LEFT JOIN public.admins AS admin
    ON admin.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_admin_revisioned(
  p_user_id UUID,
  p_role TEXT,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  admin_row public.admins%ROWTYPE;
  state_row quantum_private.admin_role_revision_states%ROWTYPE;
  event_row quantum_private.admin_role_events%ROWTYPE;
  v_admin_found BOOLEAN;
  v_action TEXT;
  v_before JSONB;
  v_after JSONB;
  v_request JSONB;
  v_result_revision INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_user_id IS NULL OR p_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'invalid_admin_role_request';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  -- One global lock prevents two super-admins from demoting each other at the
  -- same time and accidentally leaving the service without an owner.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum:admin-role-mutation', 0)
  );
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'cannot_change_own_admin_role';
  END IF;

  v_request := pg_catalog.jsonb_build_object(
    'operation', 'grant',
    'target_user_id', p_user_id,
    'role', p_role,
    'expected_revision', p_expected_revision
  );
  SELECT event.*
  INTO event_row
  FROM quantum_private.admin_role_events AS event
  WHERE event.actor_user_id = v_caller
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF event_row.target_user_id <> p_user_id
      OR event_row.action NOT IN ('grant', 'role_change')
      OR event_row.request_payload <> v_request THEN
      RAISE EXCEPTION 'admin_role_event_idempotency_conflict';
    END IF;
    RETURN event_row.result_revision;
  END IF;

  SELECT admin.*
  INTO admin_row
  FROM public.admins AS admin
  WHERE admin.user_id = p_user_id
  FOR UPDATE;

  v_admin_found := FOUND;
  INSERT INTO quantum_private.admin_role_revision_states (
    target_user_id,
    revision,
    is_active,
    last_role
  )
  VALUES (
    p_user_id,
    CASE WHEN v_admin_found THEN admin_row.revision ELSE 0 END,
    v_admin_found,
    CASE WHEN v_admin_found THEN admin_row.role ELSE NULL END
  )
  ON CONFLICT (target_user_id) DO NOTHING;

  SELECT state.*
  INTO state_row
  FROM quantum_private.admin_role_revision_states AS state
  WHERE state.target_user_id = p_user_id
  FOR UPDATE;

  IF state_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'admin_revision_conflict';
  END IF;
  IF state_row.is_active <> v_admin_found
    OR (
      v_admin_found
      AND (
        state_row.revision <> admin_row.revision
        OR state_row.last_role IS DISTINCT FROM admin_row.role
      )
    ) THEN
    RAISE EXCEPTION 'admin_role_state_inconsistent';
  END IF;

  IF v_admin_found THEN
    v_before := pg_catalog.jsonb_build_object(
      'active', TRUE,
      'role', admin_row.role,
      'revision', state_row.revision
    );
    IF admin_row.role = p_role THEN
      v_action := 'grant';
      v_result_revision := state_row.revision;
      v_after := v_before;
    ELSE
      IF admin_row.role = 'super_admin'
        AND (
          SELECT COUNT(*)
          FROM public.admins AS owner_row
          WHERE owner_row.role = 'super_admin'
        ) <= 1 THEN
        RAISE EXCEPTION 'last_super_admin_required';
      END IF;
      UPDATE public.admins
      SET role = p_role,
          granted_by = v_caller,
          granted_at = CURRENT_TIMESTAMP,
          notes = NULL,
          revision = state_row.revision + 1
      WHERE user_id = p_user_id;
      v_action := 'role_change';
      v_result_revision := state_row.revision + 1;
      UPDATE quantum_private.admin_role_revision_states
      SET revision = v_result_revision,
          is_active = TRUE,
          last_role = p_role,
          updated_at = CURRENT_TIMESTAMP
      WHERE target_user_id = p_user_id
        AND revision = p_expected_revision
        AND is_active = TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'admin_revision_conflict';
      END IF;
      v_after := pg_catalog.jsonb_build_object(
        'active', TRUE,
        'role', p_role,
        'revision', v_result_revision
      );
    END IF;
  ELSE
    v_result_revision := state_row.revision + 1;
    INSERT INTO public.admins (
      user_id,
      role,
      granted_by,
      granted_at,
      notes,
      revision
    )
    VALUES (
      p_user_id,
      p_role,
      v_caller,
      CURRENT_TIMESTAMP,
      NULL,
      v_result_revision
    );
    v_action := 'grant';
    v_before := pg_catalog.jsonb_build_object(
      'active', FALSE,
      'role', state_row.last_role,
      'revision', state_row.revision
    );
    UPDATE quantum_private.admin_role_revision_states
    SET revision = v_result_revision,
        is_active = TRUE,
        last_role = p_role,
        updated_at = CURRENT_TIMESTAMP
    WHERE target_user_id = p_user_id
      AND revision = p_expected_revision
      AND is_active = FALSE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'admin_revision_conflict';
    END IF;
    v_after := pg_catalog.jsonb_build_object(
      'active', TRUE,
      'role', p_role,
      'revision', v_result_revision
    );
  END IF;

  INSERT INTO quantum_private.admin_role_events (
    target_user_id,
    actor_user_id,
    action,
    request_payload,
    before_state,
    after_state,
    result_revision,
    idempotency_key
  )
  VALUES (
    p_user_id,
    v_caller,
    v_action,
    v_request,
    v_before,
    v_after,
    v_result_revision,
    p_idempotency_key
  );

  RETURN v_result_revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_admin_revisioned(
  p_user_id UUID,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  admin_row public.admins%ROWTYPE;
  state_row quantum_private.admin_role_revision_states%ROWTYPE;
  event_row quantum_private.admin_role_events%ROWTYPE;
  v_admin_found BOOLEAN;
  v_before JSONB;
  v_after JSONB;
  v_request JSONB;
  v_result_revision INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_user_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'invalid_admin_role_request';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum:admin-role-mutation', 0)
  );
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'cannot_change_own_admin_role';
  END IF;

  v_request := pg_catalog.jsonb_build_object(
    'operation', 'revoke',
    'target_user_id', p_user_id,
    'expected_revision', p_expected_revision
  );
  SELECT event.*
  INTO event_row
  FROM quantum_private.admin_role_events AS event
  WHERE event.actor_user_id = v_caller
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF event_row.target_user_id <> p_user_id
      OR event_row.action <> 'revoke'
      OR event_row.request_payload <> v_request THEN
      RAISE EXCEPTION 'admin_role_event_idempotency_conflict';
    END IF;
    RETURN event_row.result_revision;
  END IF;

  SELECT admin.*
  INTO admin_row
  FROM public.admins AS admin
  WHERE admin.user_id = p_user_id
  FOR UPDATE;

  v_admin_found := FOUND;
  INSERT INTO quantum_private.admin_role_revision_states (
    target_user_id,
    revision,
    is_active,
    last_role
  )
  VALUES (
    p_user_id,
    CASE WHEN v_admin_found THEN admin_row.revision ELSE 0 END,
    v_admin_found,
    CASE WHEN v_admin_found THEN admin_row.role ELSE NULL END
  )
  ON CONFLICT (target_user_id) DO NOTHING;

  SELECT state.*
  INTO state_row
  FROM quantum_private.admin_role_revision_states AS state
  WHERE state.target_user_id = p_user_id
  FOR UPDATE;

  IF state_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'admin_revision_conflict';
  END IF;
  IF state_row.is_active <> v_admin_found
    OR (
      v_admin_found
      AND (
        state_row.revision <> admin_row.revision
        OR state_row.last_role IS DISTINCT FROM admin_row.role
      )
    ) THEN
    RAISE EXCEPTION 'admin_role_state_inconsistent';
  END IF;
  IF NOT v_admin_found THEN
    RAISE EXCEPTION 'admin_membership_not_found';
  END IF;
  IF admin_row.role = 'super_admin'
    AND (
      SELECT COUNT(*)
      FROM public.admins AS owner_row
      WHERE owner_row.role = 'super_admin'
    ) <= 1 THEN
    RAISE EXCEPTION 'last_super_admin_required';
  END IF;

  v_result_revision := state_row.revision + 1;
  v_before := pg_catalog.jsonb_build_object(
    'active', TRUE,
    'role', admin_row.role,
    'revision', state_row.revision
  );
  v_after := pg_catalog.jsonb_build_object(
    'active', FALSE,
    'role', admin_row.role,
    'revision', v_result_revision
  );

  UPDATE quantum_private.admin_role_revision_states
  SET revision = v_result_revision,
      is_active = FALSE,
      last_role = admin_row.role,
      updated_at = CURRENT_TIMESTAMP
  WHERE target_user_id = p_user_id
    AND revision = p_expected_revision
    AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_revision_conflict';
  END IF;

  DELETE FROM public.admins
  WHERE user_id = p_user_id;

  INSERT INTO quantum_private.admin_role_events (
    target_user_id,
    actor_user_id,
    action,
    request_payload,
    before_state,
    after_state,
    result_revision,
    idempotency_key
  )
  VALUES (
    p_user_id,
    v_caller,
    'revoke',
    v_request,
    v_before,
    v_after,
    v_result_revision,
    p_idempotency_key
  );

  RETURN v_result_revision;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.prevent_admin_role_event_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_get_admin_role_state(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.grant_admin(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_admin(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.grant_admin_revisioned(UUID, TEXT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_admin_revisioned(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.grant_admin_revisioned(UUID, TEXT, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_admin_revisioned(UUID, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_get_admin_role_state(UUID)
  TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.admins FROM anon, authenticated;
