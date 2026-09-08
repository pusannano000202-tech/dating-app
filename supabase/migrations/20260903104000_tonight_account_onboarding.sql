-- Fail-closed account onboarding for the PNU Tonight pilot.
-- Public signup always creates an ordinary user. Privileged roles are added
-- only through the bounded flows below; raw invite tokens are never stored.

BEGIN;

CREATE TABLE quantum_private.tonight_account_onboarding_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('admin', 'partner_invite', 'market_request')),
  subject_id UUID NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'bootstrap', 'invite_create', 'invite_claim', 'invite_approve', 'invite_cancel',
    'market_request', 'market_approve', 'market_reject', 'market_cancel'
  )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  before_state JSONB NOT NULL,
  after_state JSONB NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (
    pg_catalog.length(pg_catalog.btrim(idempotency_key)) BETWEEN 1 AND 160
  ),
  UNIQUE (actor_user_id, idempotency_key)
);

ALTER TABLE quantum_private.tonight_account_onboarding_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quantum_private.tonight_account_onboarding_events
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION quantum_private.prevent_tonight_account_onboarding_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'tonight_account_onboarding_events_are_immutable';
END;
$$;

CREATE TRIGGER tonight_account_onboarding_events_no_update
  BEFORE UPDATE ON quantum_private.tonight_account_onboarding_events
  FOR EACH ROW EXECUTE FUNCTION quantum_private.prevent_tonight_account_onboarding_event_mutation();
CREATE TRIGGER tonight_account_onboarding_events_no_delete
  BEFORE DELETE ON quantum_private.tonight_account_onboarding_events
  FOR EACH ROW EXECUTE FUNCTION quantum_private.prevent_tonight_account_onboarding_event_mutation();

-- Admin and venue-partner are mutually exclusive account roles. A single
-- per-user transaction lock makes grants through different RPCs serialize,
-- while row triggers preserve the invariant for every current grant path.
CREATE OR REPLACE FUNCTION quantum_private.lock_tonight_exclusive_access_role(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'account_role_target_required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum:exclusive-access-role:' || p_user_id::TEXT, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION quantum_private.guard_admin_partner_role_exclusivity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM quantum_private.lock_tonight_exclusive_access_role(NEW.user_id);
  IF EXISTS (
    SELECT 1 FROM public.venue_partner_memberships AS membership
    WHERE membership.user_id = NEW.user_id AND membership.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'exclusive_account_role_conflict'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION quantum_private.guard_partner_admin_role_exclusivity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM quantum_private.lock_tonight_exclusive_access_role(NEW.user_id);
  IF EXISTS (SELECT 1 FROM public.admins AS admin_row WHERE admin_row.user_id = NEW.user_id)
    OR EXISTS (
      SELECT 1 FROM public.venue_partner_memberships AS membership
      WHERE membership.user_id = NEW.user_id AND membership.revoked_at IS NULL
    )
  THEN RAISE EXCEPTION 'exclusive_account_role_conflict'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER admins_partner_role_exclusivity
  BEFORE INSERT OR UPDATE ON public.admins
  FOR EACH ROW EXECUTE FUNCTION quantum_private.guard_admin_partner_role_exclusivity();
CREATE TRIGGER venue_partners_admin_role_exclusivity
  BEFORE INSERT ON public.venue_partner_memberships
  FOR EACH ROW EXECUTE FUNCTION quantum_private.guard_partner_admin_role_exclusivity();

REVOKE ALL ON FUNCTION quantum_private.lock_tonight_exclusive_access_role(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.guard_admin_partner_role_exclusivity()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.guard_partner_admin_role_exclusivity()
  FROM PUBLIC, anon, authenticated, service_role;

-- This function intentionally has no public HTTP route. Run it once from the
-- Supabase SQL Editor (postgres) or a service-role session after the owner has
-- completed ordinary signup. Schema/function privileges are the outer guard;
-- the runtime check provides defense in depth.
CREATE OR REPLACE FUNCTION quantum_private.bootstrap_initial_super_admin(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision INTEGER := 1;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
    AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users AS user_row WHERE user_row.id = p_user_id
  ) THEN
    RAISE EXCEPTION 'bootstrap_user_not_found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quantum:initial-super-admin-bootstrap', 0)
  );
  IF EXISTS (SELECT 1 FROM public.admins AS admin_row WHERE admin_row.role = 'super_admin') THEN
    RAISE EXCEPTION 'super_admin_already_bootstrapped';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admins AS admin_row WHERE admin_row.user_id = p_user_id)
    OR EXISTS (
      SELECT 1 FROM quantum_private.admin_role_revision_states AS state
      WHERE state.target_user_id = p_user_id
    ) THEN
    RAISE EXCEPTION 'bootstrap_target_already_privileged';
  END IF;

  INSERT INTO public.admins (user_id, role, granted_by, granted_at, notes, revision)
  VALUES (p_user_id, 'super_admin', p_user_id, CURRENT_TIMESTAMP, NULL, v_revision);
  INSERT INTO quantum_private.admin_role_revision_states (
    target_user_id, revision, is_active, last_role, updated_at
  ) VALUES (p_user_id, v_revision, TRUE, 'super_admin', CURRENT_TIMESTAMP)
  ON CONFLICT (target_user_id) DO UPDATE
  SET revision = EXCLUDED.revision,
      is_active = TRUE,
      last_role = 'super_admin',
      updated_at = CURRENT_TIMESTAMP;
  INSERT INTO quantum_private.tonight_account_onboarding_events (
    subject_kind, subject_id, actor_user_id, action, before_state, after_state, idempotency_key
  ) VALUES (
    'admin', p_user_id, p_user_id, 'bootstrap',
    pg_catalog.jsonb_build_object('active', FALSE, 'revision', 0),
    pg_catalog.jsonb_build_object('active', TRUE, 'role', 'super_admin', 'revision', v_revision),
    'bootstrap:' || p_user_id::TEXT
  );
  RETURN v_revision;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.bootstrap_initial_super_admin(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION quantum_private.bootstrap_initial_super_admin(UUID) TO service_role;

CREATE TABLE public.tonight_partner_onboarding_invites (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  invited_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  claimed_by_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  partner_role TEXT NOT NULL CHECK (partner_role IN ('owner', 'staff')),
  membership_expected_revision INTEGER NOT NULL CHECK (membership_expected_revision >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'approved', 'cancelled', 'expired')),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  cancelled_at TIMESTAMPTZ,
  membership_id UUID REFERENCES public.venue_partner_memberships(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  creation_idempotency_key TEXT NOT NULL CHECK (
    pg_catalog.length(pg_catalog.btrim(creation_idempotency_key)) BETWEEN 8 AND 128
  ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (created_by, creation_idempotency_key),
  CONSTRAINT tonight_partner_invite_expiry CHECK (
    expires_at > created_at AND expires_at <= created_at + INTERVAL '7 days'
  ),
  CONSTRAINT tonight_partner_invite_state_shape CHECK (
    (status = 'pending' AND claimed_by_user_id IS NULL AND claimed_at IS NULL AND approved_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'claimed' AND claimed_by_user_id IS NOT NULL AND claimed_at IS NOT NULL AND approved_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'approved' AND claimed_by_user_id IS NOT NULL AND claimed_at IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND membership_id IS NOT NULL AND cancelled_at IS NULL)
    OR (status IN ('cancelled', 'expired') AND approved_at IS NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
  )
);

CREATE INDEX tonight_partner_invites_venue_status
  ON public.tonight_partner_onboarding_invites (venue_id, status, expires_at);
CREATE INDEX tonight_partner_invites_claimed_user
  ON public.tonight_partner_onboarding_invites (claimed_by_user_id, status)
  WHERE claimed_by_user_id IS NOT NULL;

ALTER TABLE public.tonight_partner_onboarding_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tonight_partner_onboarding_invites
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tonight_partner_onboarding_invites TO service_role;

CREATE OR REPLACE FUNCTION quantum_private.guard_tonight_partner_onboarding_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'partner_invite_delete_forbidden'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
    OR NEW.venue_id IS DISTINCT FROM OLD.venue_id
    OR NEW.invited_user_id IS DISTINCT FROM OLD.invited_user_id
    OR NEW.partner_role IS DISTINCT FROM OLD.partner_role
    OR NEW.membership_expected_revision IS DISTINCT FROM OLD.membership_expected_revision
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.creation_idempotency_key IS DISTINCT FROM OLD.creation_idempotency_key
    OR NEW.revision <> OLD.revision + 1
    OR NEW.updated_at <= OLD.updated_at
  THEN RAISE EXCEPTION 'invalid_partner_invite_transition'; END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('claimed', 'cancelled', 'expired'))
    OR (OLD.status = 'claimed' AND NEW.status IN ('approved', 'cancelled', 'expired'))
  ) THEN RAISE EXCEPTION 'invalid_partner_invite_transition'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tonight_partner_onboarding_invites_guard_update
  BEFORE UPDATE ON public.tonight_partner_onboarding_invites
  FOR EACH ROW EXECUTE FUNCTION quantum_private.guard_tonight_partner_onboarding_invite();
CREATE TRIGGER tonight_partner_onboarding_invites_guard_delete
  BEFORE DELETE ON public.tonight_partner_onboarding_invites
  FOR EACH ROW EXECUTE FUNCTION quantum_private.guard_tonight_partner_onboarding_invite();

CREATE OR REPLACE FUNCTION quantum_private.assert_tonight_onboarding_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_role TEXT;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT context.access_role INTO v_role FROM public.get_access_context() AS context;
  IF v_role <> 'user' THEN RAISE EXCEPTION 'ordinary_user_role_required'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tonight_partner_invite(
  p_venue_id UUID,
  p_invited_user_id UUID,
  p_partner_role TEXT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ,
  p_expected_membership_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS TABLE (invite_id UUID, created BOOLEAN, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_existing public.tonight_partner_onboarding_invites%ROWTYPE;
  v_id UUID;
BEGIN
  IF v_caller IS NULL OR NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_venue_id IS NULL OR p_invited_user_id IS NULL OR p_partner_role NOT IN ('owner', 'staff')
    OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_expires_at <= CURRENT_TIMESTAMP OR p_expires_at > CURRENT_TIMESTAMP + INTERVAL '7 days'
    OR p_expected_membership_revision IS NULL OR p_expected_membership_revision < 0
    OR pg_catalog.length(pg_catalog.btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 128
  THEN RAISE EXCEPTION 'invalid_partner_invite_request'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.venues AS venue WHERE venue.id = p_venue_id) THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;
  IF p_invited_user_id = v_caller THEN RAISE EXCEPTION 'partner_invite_self_forbidden'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users AS user_row WHERE user_row.id = p_invited_user_id
  ) THEN RAISE EXCEPTION 'invite_target_not_found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.admins AS admin_row WHERE admin_row.user_id = p_invited_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.venue_partner_memberships AS membership
    WHERE membership.user_id = p_invited_user_id AND membership.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'invite_target_not_ordinary_user'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'partner-invite-key:' || pg_catalog.btrim(p_idempotency_key), 0
  ));
  SELECT invite.* INTO v_existing
  FROM public.tonight_partner_onboarding_invites AS invite
  WHERE invite.created_by = v_caller AND invite.creation_idempotency_key = pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing.venue_id <> p_venue_id
      OR v_existing.invited_user_id IS DISTINCT FROM p_invited_user_id
      OR v_existing.partner_role <> p_partner_role
      OR v_existing.membership_expected_revision <> p_expected_membership_revision
    THEN RAISE EXCEPTION 'partner_invite_idempotency_conflict'; END IF;
    RETURN QUERY SELECT v_existing.id, FALSE, v_existing.expires_at;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'partner-invite-pair:' || p_venue_id::TEXT || ':' || p_invited_user_id::TEXT,
    0
  ));

  IF EXISTS (
    SELECT 1 FROM public.venue_partner_memberships AS membership
    WHERE membership.user_id = p_invited_user_id
      AND membership.venue_id = p_venue_id AND membership.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'partner_invite_duplicate_membership'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.tonight_partner_onboarding_invites AS invite
    WHERE invite.invited_user_id = p_invited_user_id AND invite.venue_id = p_venue_id
      AND invite.status IN ('pending', 'claimed') AND invite.expires_at > CURRENT_TIMESTAMP
  ) THEN RAISE EXCEPTION 'partner_invite_duplicate_pending'; END IF;

  INSERT INTO public.tonight_partner_onboarding_invites (
    token_hash, venue_id, invited_user_id, partner_role, membership_expected_revision,
    created_by, expires_at, creation_idempotency_key
  ) VALUES (
    p_token_hash, p_venue_id, p_invited_user_id, p_partner_role, p_expected_membership_revision,
    v_caller, p_expires_at, pg_catalog.btrim(p_idempotency_key)
  ) RETURNING id INTO v_id;
  INSERT INTO quantum_private.tonight_account_onboarding_events (
    subject_kind, subject_id, actor_user_id, action, before_state, after_state, idempotency_key
  ) VALUES (
    'partner_invite', v_id, v_caller, 'invite_create', '{}'::JSONB,
    pg_catalog.jsonb_build_object('status', 'pending', 'venue_id', p_venue_id, 'targeted', p_invited_user_id IS NOT NULL),
    'partner-create:' || pg_catalog.btrim(p_idempotency_key)
  );
  RETURN QUERY SELECT v_id, TRUE, p_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tonight_partner_invite(p_token_hash TEXT)
RETURNS TABLE (
  invite_id UUID, venue_id UUID, venue_name TEXT, partner_role TEXT,
  status TEXT, expires_at TIMESTAMPTZ, target_matches BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_caller UUID := auth.uid();
BEGIN
  PERFORM quantum_private.assert_tonight_onboarding_user(v_caller);
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_partner_invite_token'; END IF;
  RETURN QUERY
  SELECT invite.id, invite.venue_id, venue.name, invite.partner_role,
    CASE WHEN invite.expires_at <= CURRENT_TIMESTAMP THEN 'expired' ELSE invite.status END,
    invite.expires_at,
    TRUE
  FROM public.tonight_partner_onboarding_invites AS invite
  JOIN public.venues AS venue ON venue.id = invite.venue_id
  WHERE invite.token_hash = p_token_hash
    AND invite.invited_user_id = v_caller;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_tonight_partner_invite(
  p_token_hash TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_invite public.tonight_partner_onboarding_invites%ROWTYPE;
  v_replay_event quantum_private.tonight_account_onboarding_events%ROWTYPE;
BEGIN
  PERFORM quantum_private.assert_tonight_onboarding_user(v_caller);
  IF p_token_hash !~ '^[0-9a-f]{64}$'
    OR pg_catalog.length(pg_catalog.btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 128
  THEN RAISE EXCEPTION 'invalid_partner_invite_request'; END IF;
  SELECT invite.* INTO v_invite
  FROM public.tonight_partner_onboarding_invites AS invite
  WHERE invite.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  SELECT event.* INTO v_replay_event
  FROM quantum_private.tonight_account_onboarding_events AS event
  WHERE event.actor_user_id = v_caller
    AND event.idempotency_key = 'partner-claim:' || pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_replay_event.action <> 'invite_claim' OR v_replay_event.subject_id <> v_invite.id THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_invite.id;
  END IF;
  IF v_invite.expires_at <= CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'invite_expired'; END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'invite_already_used'; END IF;
  IF v_invite.invited_user_id IS NOT NULL AND v_invite.invited_user_id <> v_caller THEN
    RAISE EXCEPTION 'invite_target_mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.venue_partner_memberships AS membership
    WHERE membership.user_id = v_caller AND membership.venue_id = v_invite.venue_id
      AND membership.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'partner_invite_duplicate_membership'; END IF;

  UPDATE public.tonight_partner_onboarding_invites
  SET status = 'claimed', claimed_by_user_id = v_caller, claimed_at = CURRENT_TIMESTAMP,
      revision = revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = v_invite.id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_already_used'; END IF;
  INSERT INTO quantum_private.tonight_account_onboarding_events (
    subject_kind, subject_id, actor_user_id, action, before_state, after_state, idempotency_key
  ) VALUES (
    'partner_invite', v_invite.id, v_caller, 'invite_claim',
    pg_catalog.jsonb_build_object('status', 'pending'),
    pg_catalog.jsonb_build_object('status', 'claimed'),
    'partner-claim:' || pg_catalog.btrim(p_idempotency_key)
  );
  RETURN v_invite.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_tonight_partner_invite(
  p_invite_id UUID,
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
  v_invite public.tonight_partner_onboarding_invites%ROWTYPE;
  v_membership_id UUID;
  v_replay_event quantum_private.tonight_account_onboarding_events%ROWTYPE;
BEGIN
  IF v_caller IS NULL OR NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_invite_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 1
    OR pg_catalog.length(pg_catalog.btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 128
  THEN RAISE EXCEPTION 'invalid_partner_invite_request'; END IF;
  SELECT invite.* INTO v_invite FROM public.tonight_partner_onboarding_invites AS invite
  WHERE invite.id = p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  SELECT event.* INTO v_replay_event
  FROM quantum_private.tonight_account_onboarding_events AS event
  WHERE event.actor_user_id = v_caller
    AND event.idempotency_key = 'partner-approve:' || pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_replay_event.action <> 'invite_approve'
      OR v_replay_event.subject_id <> p_invite_id
      OR (v_replay_event.before_state ->> 'revision')::INTEGER IS DISTINCT FROM p_expected_revision
    THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN (v_replay_event.after_state ->> 'membership_id')::UUID;
  END IF;
  IF v_invite.revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
  IF v_invite.expires_at <= CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'invite_expired'; END IF;
  IF v_invite.status <> 'claimed' OR v_invite.claimed_by_user_id IS NULL THEN RAISE EXCEPTION 'invite_not_claimed'; END IF;

  PERFORM quantum_private.lock_tonight_exclusive_access_role(v_invite.claimed_by_user_id);
  IF EXISTS (
    SELECT 1 FROM public.admins AS admin_row
    WHERE admin_row.user_id = v_invite.claimed_by_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.venue_partner_memberships AS membership
    WHERE membership.user_id = v_invite.claimed_by_user_id
      AND membership.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'invite_target_not_ordinary_user'; END IF;

  v_membership_id := public.grant_venue_partner_membership(
    v_invite.claimed_by_user_id, v_invite.venue_id, v_invite.partner_role,
    v_invite.membership_expected_revision, pg_catalog.btrim(p_idempotency_key)
  );
  UPDATE public.tonight_partner_onboarding_invites
  SET status = 'approved', approved_by = v_caller, approved_at = CURRENT_TIMESTAMP,
      membership_id = v_membership_id, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = p_invite_id AND revision = p_expected_revision AND status = 'claimed';
  IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;
  INSERT INTO quantum_private.tonight_account_onboarding_events (
    subject_kind, subject_id, actor_user_id, action, before_state, after_state, idempotency_key
  ) VALUES (
    'partner_invite', p_invite_id, v_caller, 'invite_approve',
    pg_catalog.jsonb_build_object('status', 'claimed', 'revision', p_expected_revision),
    pg_catalog.jsonb_build_object('status', 'approved', 'revision', p_expected_revision + 1, 'membership_id', v_membership_id),
    'partner-approve:' || pg_catalog.btrim(p_idempotency_key)
  );
  RETURN v_membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_tonight_partner_invite(
  p_invite_id UUID,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_caller UUID := auth.uid(); v_invite public.tonight_partner_onboarding_invites%ROWTYPE;
  v_replay_event quantum_private.tonight_account_onboarding_events%ROWTYPE;
BEGIN
  IF v_caller IS NULL OR NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_invite_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 1
    OR pg_catalog.length(pg_catalog.btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 128
  THEN RAISE EXCEPTION 'invalid_partner_invite_request'; END IF;
  SELECT invite.* INTO v_invite FROM public.tonight_partner_onboarding_invites AS invite
  WHERE invite.id = p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  SELECT event.* INTO v_replay_event
  FROM quantum_private.tonight_account_onboarding_events AS event
  WHERE event.actor_user_id = v_caller
    AND event.idempotency_key = 'partner-cancel:' || pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_replay_event.action <> 'invite_cancel'
      OR v_replay_event.subject_id <> p_invite_id
      OR (v_replay_event.before_state ->> 'revision')::INTEGER IS DISTINCT FROM p_expected_revision
    THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN TRUE;
  END IF;
  IF v_invite.revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
  IF v_invite.status NOT IN ('pending', 'claimed') THEN RAISE EXCEPTION 'invite_already_used'; END IF;
  UPDATE public.tonight_partner_onboarding_invites
  SET status = 'cancelled', cancelled_by = v_caller, cancelled_at = CURRENT_TIMESTAMP,
      revision = revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = p_invite_id AND revision = p_expected_revision;
  INSERT INTO quantum_private.tonight_account_onboarding_events (
    subject_kind, subject_id, actor_user_id, action, before_state, after_state, idempotency_key
  ) VALUES (
    'partner_invite', p_invite_id, v_caller, 'invite_cancel',
    pg_catalog.jsonb_build_object('status', v_invite.status, 'revision', p_expected_revision),
    pg_catalog.jsonb_build_object('status', 'cancelled', 'revision', p_expected_revision + 1),
    'partner-cancel:' || pg_catalog.btrim(p_idempotency_key)
  );
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_tonight_partner_invites()
RETURNS TABLE (
  invite_id UUID, venue_id UUID, venue_name TEXT,
  invited_user_id UUID, invited_user_name TEXT, invited_user_email TEXT,
  claimed_by_user_id UUID, claimed_user_name TEXT, claimed_user_email TEXT,
  partner_role TEXT, status TEXT, expires_at TIMESTAMPTZ, revision INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  RETURN QUERY SELECT invite.id, invite.venue_id, venue.name,
    invite.invited_user_id, invited_profile.display_name, invited_user.email,
    invite.claimed_by_user_id, claimed_profile.display_name, claimed_user.email,
    invite.partner_role,
    CASE WHEN invite.status IN ('pending', 'claimed') AND invite.expires_at <= CURRENT_TIMESTAMP THEN 'expired' ELSE invite.status END,
    invite.expires_at, invite.revision
  FROM public.tonight_partner_onboarding_invites AS invite
  JOIN public.venues AS venue ON venue.id = invite.venue_id
  JOIN public.users AS invited_user ON invited_user.id = invite.invited_user_id
  LEFT JOIN public.profiles AS invited_profile ON invited_profile.user_id = invite.invited_user_id
  LEFT JOIN public.users AS claimed_user ON claimed_user.id = invite.claimed_by_user_id
  LEFT JOIN public.profiles AS claimed_profile ON claimed_profile.user_id = invite.claimed_by_user_id
  ORDER BY invite.created_at DESC, invite.id DESC LIMIT 100;
END;
$$;

-- The previous school-email field is deliberately not consulted: that proof
-- was retired. A PNU profile may request review, but only a recent-auth owner
-- can approve the resulting market membership.
CREATE TABLE public.tonight_market_membership_requests (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  market_code TEXT NOT NULL DEFAULT 'PNU' CHECK (market_code = 'PNU'),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  verification_state TEXT NOT NULL DEFAULT 'manual_review_required'
    CHECK (verification_state = 'manual_review_required'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  membership_id UUID REFERENCES public.tonight_market_memberships(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tonight_market_request_state_shape CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND membership_id IS NULL)
    OR (status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND membership_id IS NOT NULL)
    OR (status IN ('rejected', 'cancelled') AND reviewed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX tonight_market_membership_requests_one_pending
  ON public.tonight_market_membership_requests (user_id, market_code)
  WHERE status = 'pending';

ALTER TABLE public.tonight_market_membership_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tonight_market_membership_requests
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tonight_market_membership_requests TO service_role;

CREATE OR REPLACE FUNCTION public.request_my_tonight_market_membership(p_idempotency_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_id UUID;
  v_replay_event quantum_private.tonight_account_onboarding_events%ROWTYPE;
BEGIN
  PERFORM quantum_private.assert_tonight_onboarding_user(v_caller);
  IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 128
  THEN RAISE EXCEPTION 'invalid_idempotency_key'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'tonight-market-request:PNU:' || v_caller::TEXT,
    0
  ));
  SELECT event.* INTO v_replay_event
  FROM quantum_private.tonight_account_onboarding_events AS event
  WHERE event.actor_user_id = v_caller
    AND event.idempotency_key = 'market-request:' || pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_replay_event.action <> 'market_request' OR v_replay_event.subject_kind <> 'market_request' THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_replay_event.subject_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS profile
    WHERE profile.user_id = v_caller
      AND pg_catalog.lower(pg_catalog.btrim(profile.school)) IN ('부산대학교', '부산대', 'pusan national university')
  ) THEN RAISE EXCEPTION 'pnu_profile_required'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.tonight_market_memberships AS membership
    WHERE membership.market_code = 'PNU' AND membership.user_id = v_caller AND membership.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'tonight_market_membership_already_active'; END IF;
  SELECT request.id INTO v_id FROM public.tonight_market_membership_requests AS request
  WHERE request.user_id = v_caller AND request.market_code = 'PNU' AND request.status = 'pending';
  IF FOUND THEN
    INSERT INTO quantum_private.tonight_account_onboarding_events (
      subject_kind, subject_id, actor_user_id, action, before_state, after_state, idempotency_key
    ) VALUES (
      'market_request', v_id, v_caller, 'market_request',
      pg_catalog.jsonb_build_object('status', 'pending', 'reused', TRUE),
      pg_catalog.jsonb_build_object('status', 'pending', 'verification_state', 'manual_review_required', 'reused', TRUE),
      'market-request:' || pg_catalog.btrim(p_idempotency_key)
    );
    RETURN v_id;
  END IF;
  INSERT INTO public.tonight_market_membership_requests (user_id)
  VALUES (v_caller) RETURNING id INTO v_id;
  INSERT INTO quantum_private.tonight_account_onboarding_events (
    subject_kind, subject_id, actor_user_id, action, before_state, after_state, idempotency_key
  ) VALUES (
    'market_request', v_id, v_caller, 'market_request', '{}'::JSONB,
    pg_catalog.jsonb_build_object('status', 'pending', 'verification_state', 'manual_review_required'),
    'market-request:' || pg_catalog.btrim(p_idempotency_key)
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_tonight_market_membership_requests()
RETURNS TABLE (
  request_id UUID, user_id UUID, display_name TEXT, school TEXT, department TEXT,
  status TEXT, verification_state TEXT, requested_at TIMESTAMPTZ, revision INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  RETURN QUERY SELECT request.id, request.user_id, profile.display_name, profile.school, profile.department,
    request.status, request.verification_state, request.requested_at, request.revision
  FROM public.tonight_market_membership_requests AS request
  LEFT JOIN public.profiles AS profile ON profile.user_id = request.user_id
  WHERE request.status = 'pending'
  ORDER BY request.requested_at, request.id LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_tonight_market_membership_request(
  p_request_id UUID, p_expected_revision INTEGER, p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_request public.tonight_market_membership_requests%ROWTYPE;
  v_membership UUID;
  v_replay_event quantum_private.tonight_account_onboarding_events%ROWTYPE;
BEGIN
  IF v_caller IS NULL OR NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 1
    OR pg_catalog.length(pg_catalog.btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 128
  THEN RAISE EXCEPTION 'invalid_market_membership_request'; END IF;
  SELECT request.* INTO v_request FROM public.tonight_market_membership_requests AS request
  WHERE request.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'market_request_not_found'; END IF;
  SELECT event.* INTO v_replay_event
  FROM quantum_private.tonight_account_onboarding_events AS event
  WHERE event.actor_user_id = v_caller
    AND event.idempotency_key = 'market-approve:' || pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_replay_event.action <> 'market_approve'
      OR v_replay_event.subject_id <> p_request_id
      OR (v_replay_event.before_state ->> 'revision')::INTEGER IS DISTINCT FROM p_expected_revision
    THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN (v_replay_event.after_state ->> 'membership_id')::UUID;
  END IF;
  IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'market_request_already_reviewed'; END IF;
  IF v_request.revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
  v_membership := public.super_admin_grant_tonight_market_membership(
    'PNU', v_request.user_id, pg_catalog.btrim(p_idempotency_key)
  );
  UPDATE public.tonight_market_membership_requests
  SET status = 'approved', reviewed_by = v_caller, reviewed_at = CURRENT_TIMESTAMP,
      membership_id = v_membership, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = p_request_id AND revision = p_expected_revision;
  INSERT INTO quantum_private.tonight_account_onboarding_events (
    subject_kind, subject_id, actor_user_id, action, before_state, after_state, idempotency_key
  ) VALUES (
    'market_request', p_request_id, v_caller, 'market_approve',
    pg_catalog.jsonb_build_object('status', 'pending', 'revision', p_expected_revision),
    pg_catalog.jsonb_build_object('status', 'approved', 'revision', p_expected_revision + 1, 'membership_id', v_membership),
    'market-approve:' || pg_catalog.btrim(p_idempotency_key)
  );
  RETURN v_membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_tonight_market_membership_request(
  p_request_id UUID, p_expected_revision INTEGER, p_idempotency_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_request public.tonight_market_membership_requests%ROWTYPE;
  v_replay_event quantum_private.tonight_account_onboarding_events%ROWTYPE;
BEGIN
  IF v_caller IS NULL OR NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 1
    OR pg_catalog.length(pg_catalog.btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 128
  THEN RAISE EXCEPTION 'invalid_market_membership_request'; END IF;
  SELECT request.* INTO v_request FROM public.tonight_market_membership_requests AS request
  WHERE request.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'market_request_not_found'; END IF;
  SELECT event.* INTO v_replay_event
  FROM quantum_private.tonight_account_onboarding_events AS event
  WHERE event.actor_user_id = v_caller
    AND event.idempotency_key = 'market-reject:' || pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_replay_event.action <> 'market_reject'
      OR v_replay_event.subject_id <> p_request_id
      OR (v_replay_event.before_state ->> 'revision')::INTEGER IS DISTINCT FROM p_expected_revision
    THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN TRUE;
  END IF;
  IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'market_request_already_reviewed'; END IF;
  IF v_request.revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
  UPDATE public.tonight_market_membership_requests
  SET status = 'rejected', reviewed_by = v_caller, reviewed_at = CURRENT_TIMESTAMP,
      revision = revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = p_request_id AND revision = p_expected_revision;
  INSERT INTO quantum_private.tonight_account_onboarding_events (
    subject_kind, subject_id, actor_user_id, action, before_state, after_state, idempotency_key
  ) VALUES (
    'market_request', p_request_id, v_caller, 'market_reject',
    pg_catalog.jsonb_build_object('status', 'pending', 'revision', p_expected_revision),
    pg_catalog.jsonb_build_object('status', 'rejected', 'revision', p_expected_revision + 1),
    'market-reject:' || pg_catalog.btrim(p_idempotency_key)
  );
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.assert_tonight_onboarding_user(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_tonight_partner_invite(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_tonight_partner_invite(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_tonight_partner_invite(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_tonight_partner_invite(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_tonight_partner_invite(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_list_tonight_partner_invites()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_my_tonight_market_membership(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_list_tonight_market_membership_requests()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_tonight_market_membership_request(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_tonight_market_membership_request(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_tonight_partner_invite(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tonight_partner_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tonight_partner_invite(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_tonight_partner_invite(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_tonight_partner_invite(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_list_tonight_partner_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_tonight_market_membership(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_list_tonight_market_membership_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_tonight_market_membership_request(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_tonight_market_membership_request(UUID, INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION quantum_private.bootstrap_initial_super_admin(UUID) IS
  'One-time service/SQL-editor bootstrap. Public signup cannot self-promote.';
COMMENT ON TABLE public.tonight_market_membership_requests IS
  'Fail-closed PNU review queue. Profile school is not authoritative verification.';

COMMIT;
