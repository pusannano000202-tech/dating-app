-- Production ledgers for the 부산대 Tonight journey. These records are
-- deliberately independent from legacy groups, matches, and deposits.

BEGIN;

CREATE SCHEMA IF NOT EXISTS quantum_private;
REVOKE ALL ON SCHEMA quantum_private
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA quantum_private TO service_role;

CREATE OR REPLACE FUNCTION public.tonight_deposit_amount()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 10000;
$$;

CREATE TABLE public.tonight_market_memberships (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  market_code TEXT NOT NULL CHECK (
    market_code = pg_catalog.upper(market_code)
    AND market_code ~ '^[A-Z0-9_-]{2,24}$'
  ),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  granted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  grant_idempotency_key TEXT NOT NULL UNIQUE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  revoked_at TIMESTAMPTZ,
  revoke_idempotency_key TEXT UNIQUE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  CONSTRAINT tonight_market_memberships_revocation_pair CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoke_idempotency_key IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_idempotency_key IS NOT NULL)
  )
);

CREATE UNIQUE INDEX tonight_market_memberships_one_active
  ON public.tonight_market_memberships (market_code, user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX tonight_market_memberships_user_history
  ON public.tonight_market_memberships (user_id, granted_at DESC);

CREATE TABLE public.tonight_rounds (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  market_code TEXT NOT NULL CHECK (
    market_code = pg_catalog.upper(market_code)
    AND market_code ~ '^[A-Z0-9_-]{2,24}$'
  ),
  service_date DATE NOT NULL,
  service_timezone TEXT NOT NULL DEFAULT 'Asia/Seoul'
    CHECK (service_timezone = 'Asia/Seoul'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'open', 'allocation_locked', 'awaiting_deposits',
    'partner_confirmation', 'accepted', 'in_progress', 'completed', 'cancelled'
  )),
  signup_open_at TIMESTAMPTZ NOT NULL,
  signup_close_at TIMESTAMPTZ NOT NULL,
  capacity_lock_at TIMESTAMPTZ NOT NULL,
  allocation_publish_at TIMESTAMPTZ NOT NULL,
  deposit_due_at TIMESTAMPTZ NOT NULL,
  partner_acceptance_due_at TIMESTAMPTZ NOT NULL,
  reveal_at TIMESTAMPTZ NOT NULL,
  arrival_at TIMESTAMPTZ NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  created_by_kind TEXT NOT NULL CHECK (created_by_kind IN ('authenticated', 'service')),
  create_idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (market_code, service_date),
  CONSTRAINT tonight_rounds_creator_consistency CHECK (
    (created_by_kind = 'service' AND created_by IS NULL)
    OR (created_by_kind = 'authenticated' AND created_by IS NOT NULL)
  ),
  CONSTRAINT tonight_rounds_gate_order CHECK (
    signup_open_at < signup_close_at
    AND signup_close_at <= capacity_lock_at
    AND capacity_lock_at <= allocation_publish_at
    AND allocation_publish_at < deposit_due_at
    AND deposit_due_at < partner_acceptance_due_at
    AND partner_acceptance_due_at <= reveal_at
    AND reveal_at <= arrival_at
    AND arrival_at < starts_at
  )
);

CREATE TABLE public.tonight_round_activities (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.tonight_rounds(id) ON DELETE RESTRICT,
  slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 3),
  title TEXT NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(title)) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL CHECK (
    pg_catalog.length(pg_catalog.btrim(image_url)) BETWEEN 1 AND 2048
  ),
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes BETWEEN 30 AND 240),
  activity_kind TEXT NOT NULL CHECK (activity_kind IN (
    'bar', 'board_game', 'cafe', 'walk', 'shopping', 'experience', 'online_game', 'other'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (round_id, slot),
  UNIQUE (round_id, id)
);

CREATE TABLE public.tonight_friend_bundles (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.tonight_rounds(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  invite_code TEXT NOT NULL UNIQUE,
  max_size SMALLINT NOT NULL DEFAULT 3 CHECK (max_size BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'forming' CHECK (status IN ('forming', 'locked', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (round_id, id)
);

CREATE TABLE public.tonight_applications (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.tonight_rounds(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  bundle_id UUID NOT NULL,
  matching_consent_version TEXT NOT NULL CHECK (matching_consent_version = '2026-09-03'),
  matching_consent_accepted_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted', 'waitlisted', 'allocated', 'withdrawn', 'cancelled'
  )),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  submission_idempotency_key TEXT NOT NULL UNIQUE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (round_id, user_id),
  UNIQUE (id, round_id),
  UNIQUE (id, user_id),
  UNIQUE (id, bundle_id),
  FOREIGN KEY (round_id, bundle_id)
    REFERENCES public.tonight_friend_bundles(round_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.tonight_friend_bundle_members (
  bundle_id UUID NOT NULL REFERENCES public.tonight_friend_bundles(id) ON DELETE RESTRICT,
  application_id UUID NOT NULL REFERENCES public.tonight_applications(id) ON DELETE RESTRICT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bundle_id, application_id),
  UNIQUE (application_id),
  FOREIGN KEY (application_id, bundle_id)
    REFERENCES public.tonight_applications(id, bundle_id) ON DELETE RESTRICT
);

CREATE TABLE public.tonight_application_choices (
  application_id UUID NOT NULL,
  round_id UUID NOT NULL,
  activity_id UUID NOT NULL,
  rank SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (application_id, rank),
  UNIQUE (application_id, activity_id),
  FOREIGN KEY (application_id, round_id)
    REFERENCES public.tonight_applications(id, round_id) ON DELETE RESTRICT,
  FOREIGN KEY (round_id, activity_id)
    REFERENCES public.tonight_round_activities(round_id, id) ON DELETE RESTRICT
);

CREATE TABLE quantum_private.tonight_applicant_features (
  application_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  age_years SMALLINT NOT NULL CHECK (age_years BETWEEN 18 AND 99),
  gender_code TEXT NOT NULL CHECK (gender_code IN ('male', 'female')),
  automatic_appearance_score NUMERIC(5,2) NOT NULL
    CHECK (automatic_appearance_score BETWEEN 0 AND 100),
  appearance_score NUMERIC(5,2) NOT NULL CHECK (appearance_score BETWEEN 0 AND 100),
  appearance_score_adjustment NUMERIC(6,2)
    GENERATED ALWAYS AS (appearance_score - automatic_appearance_score) STORED,
  source_score_revision UUID,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  adjusted_at TIMESTAMPTZ,
  adjusted_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  FOREIGN KEY (application_id, user_id)
    REFERENCES public.tonight_applications(id, user_id) ON DELETE RESTRICT
);

-- A capacity must snapshot the same venue it claims to reserve. The snapshot
-- ledger predates Tonight, so expose the composite candidate key here before
-- referencing it from the Tonight-only ledger.
ALTER TABLE public.venue_snapshots
  ADD CONSTRAINT venue_snapshots_id_venue_unique UNIQUE (id, venue_id);

CREATE TABLE public.tonight_venue_capacities (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  round_id UUID NOT NULL,
  activity_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  venue_snapshot_id UUID NOT NULL REFERENCES public.venue_snapshots(id) ON DELETE RESTRICT,
  team_capacity SMALLINT NOT NULL CHECK (team_capacity BETWEEN 0 AND 100),
  reserved_team_count SMALLINT NOT NULL DEFAULT 0 CHECK (
    reserved_team_count >= 0 AND reserved_team_count <= team_capacity
  ),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'closed')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  last_confirmed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (round_id, activity_id, venue_snapshot_id),
  UNIQUE (id, round_id, activity_id),
  UNIQUE (id, venue_snapshot_id),
  UNIQUE (id, venue_id),
  FOREIGN KEY (round_id, activity_id)
    REFERENCES public.tonight_round_activities(round_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (venue_snapshot_id, venue_id)
    REFERENCES public.venue_snapshots(id, venue_id) ON DELETE RESTRICT
);

CREATE TABLE public.tonight_teams (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  round_id UUID NOT NULL,
  activity_id UUID NOT NULL,
  venue_capacity_id UUID,
  team_number INTEGER NOT NULL CHECK (team_number > 0),
  team_code TEXT NOT NULL UNIQUE CHECK (
    team_code ~ '^Q-[A-Z0-9_-]+-[0-9]{8}-[0-9]{3,}$'
  ),
  status TEXT NOT NULL DEFAULT 'deposit_pending' CHECK (status IN (
    'drafted', 'deposit_pending', 'partner_pending', 'accepted',
    'revealed', 'in_progress', 'completed', 'cancelled'
  )),
  member_count SMALLINT NOT NULL DEFAULT 5 CHECK (member_count = 5),
  male_count SMALLINT NOT NULL,
  female_count SMALLINT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  allocation_idempotency_key TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (round_id, team_number),
  UNIQUE (id, round_id),
  UNIQUE (id, venue_capacity_id),
  UNIQUE (round_id, allocation_idempotency_key, team_number),
  FOREIGN KEY (round_id, activity_id)
    REFERENCES public.tonight_round_activities(round_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (venue_capacity_id, round_id, activity_id)
    REFERENCES public.tonight_venue_capacities(id, round_id, activity_id) ON DELETE RESTRICT,
  CONSTRAINT tonight_teams_gender_mix CHECK (
    member_count = 5
    AND (
      (male_count = 2 AND female_count = 3)
      OR (male_count = 3 AND female_count = 2)
    )
  )
);

CREATE TABLE public.tonight_team_members (
  team_id UUID NOT NULL,
  round_id UUID NOT NULL,
  application_id UUID NOT NULL,
  user_id UUID NOT NULL,
  bundle_id UUID NOT NULL REFERENCES public.tonight_friend_bundles(id) ON DELETE RESTRICT,
  seat_number SMALLINT NOT NULL CHECK (seat_number BETWEEN 1 AND 5),
  member_status TEXT NOT NULL DEFAULT 'assigned' CHECK (member_status IN (
    'assigned', 'confirmed', 'cancelled', 'no_show', 'completed'
  )),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, application_id),
  UNIQUE (application_id),
  UNIQUE (team_id, seat_number),
  FOREIGN KEY (team_id, round_id)
    REFERENCES public.tonight_teams(id, round_id) ON DELETE RESTRICT,
  FOREIGN KEY (application_id, round_id)
    REFERENCES public.tonight_applications(id, round_id) ON DELETE RESTRICT,
  FOREIGN KEY (application_id, bundle_id)
    REFERENCES public.tonight_applications(id, bundle_id) ON DELETE RESTRICT,
  FOREIGN KEY (application_id, user_id)
    REFERENCES public.tonight_applications(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.tonight_deposits (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  application_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL DEFAULT public.tonight_deposit_amount()
    CHECK (amount = public.tonight_deposit_amount()),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN (
    'initiated', 'pending', 'paid', 'held', 'refund_requested',
    'refunded', 'forfeited', 'reconciliation_required', 'cancelled'
  )),
  provider_order_id TEXT UNIQUE,
  provider_payment_key_hash TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  paid_at TIMESTAMPTZ,
  held_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, application_id, user_id),
  FOREIGN KEY (application_id, user_id)
    REFERENCES public.tonight_applications(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE quantum_private.tonight_deposit_result_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deposit_id UUID NOT NULL,
  application_id UUID NOT NULL,
  user_id UUID NOT NULL,
  result_status TEXT NOT NULL CHECK (result_status IN (
    'paid', 'held', 'reconciliation_required', 'cancelled'
  )),
  provider_order_id TEXT,
  provider_payment_key_hash TEXT,
  amount INTEGER NOT NULL CHECK (amount = public.tonight_deposit_amount()),
  idempotency_key TEXT NOT NULL UNIQUE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deposit_id, application_id, user_id)
    REFERENCES public.tonight_deposits(id, application_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT tonight_deposit_result_events_provider_refs CHECK (
    result_status = 'cancelled'
    OR (
      provider_order_id IS NOT NULL
      AND pg_catalog.btrim(provider_order_id) <> ''
      AND provider_payment_key_hash IS NOT NULL
      AND pg_catalog.btrim(provider_payment_key_hash) <> ''
    )
  )
);

CREATE TABLE public.tonight_deposit_refund_requests (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  deposit_id UUID NOT NULL UNIQUE REFERENCES public.tonight_deposits(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'approved', 'rejected', 'processing', 'completed', 'failed'
  )),
  idempotency_key TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  settlement_lease_id UUID,
  settlement_lease_expires_at TIMESTAMPTZ,
  settlement_attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (settlement_attempt_count BETWEEN 0 AND 10),
  settlement_last_error TEXT,
  settlement_next_retry_at TIMESTAMPTZ,
  provider_order_id TEXT,
  provider_payment_key_hash TEXT,
  provider_refund_transaction_key TEXT UNIQUE,
  refunded_amount INTEGER CHECK (
    refunded_amount IS NULL OR refunded_amount = public.tonight_deposit_amount()
  ),
  finalize_idempotency_key TEXT UNIQUE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  CONSTRAINT tonight_refund_request_lease_consistency CHECK (
    (status = 'processing' AND settlement_lease_id IS NOT NULL
      AND settlement_lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND settlement_lease_id IS NULL
      AND settlement_lease_expires_at IS NULL)
  ),
  CONSTRAINT tonight_refund_request_result_consistency CHECK (
    (
      status = 'completed'
      AND provider_order_id IS NOT NULL
      AND pg_catalog.btrim(provider_order_id) <> ''
      AND provider_payment_key_hash IS NOT NULL
      AND pg_catalog.btrim(provider_payment_key_hash) <> ''
      AND provider_refund_transaction_key IS NOT NULL
      AND pg_catalog.btrim(provider_refund_transaction_key) <> ''
      AND refunded_amount = public.tonight_deposit_amount()
      AND finalize_idempotency_key IS NOT NULL
    )
    OR (
      status <> 'completed'
      AND provider_order_id IS NULL
      AND provider_payment_key_hash IS NULL
      AND provider_refund_transaction_key IS NULL
      AND refunded_amount IS NULL
      AND finalize_idempotency_key IS NULL
    )
  )
);

CREATE TABLE public.tonight_partner_acceptances (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE,
  venue_capacity_id UUID NOT NULL,
  venue_snapshot_id UUID NOT NULL REFERENCES public.venue_snapshots(id) ON DELETE RESTRICT,
  accepted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  accepted_headcount SMALLINT NOT NULL DEFAULT 5 CHECK (accepted_headcount = 5),
  accepted_team_revision INTEGER NOT NULL CHECK (accepted_team_revision >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id, venue_capacity_id)
    REFERENCES public.tonight_teams(id, venue_capacity_id) ON DELETE RESTRICT,
  FOREIGN KEY (venue_capacity_id, venue_snapshot_id)
    REFERENCES public.tonight_venue_capacities(id, venue_snapshot_id) ON DELETE RESTRICT
);

CREATE TABLE public.tonight_attendance (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id UUID NOT NULL,
  application_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'arrived', 'no_show', 'excused'
  )),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  arrival_idempotency_key TEXT UNIQUE,
  arrived_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (application_id),
  FOREIGN KEY (team_id, application_id)
    REFERENCES public.tonight_team_members(team_id, application_id) ON DELETE RESTRICT,
  FOREIGN KEY (application_id, user_id)
    REFERENCES public.tonight_applications(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.tonight_partner_service_confirmations (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE,
  venue_capacity_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  confirmed_attendee_count SMALLINT NOT NULL CHECK (confirmed_attendee_count BETWEEN 0 AND 5),
  observed_arrived_count SMALLINT NOT NULL CHECK (observed_arrived_count BETWEEN 0 AND 5),
  confirmed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  service_completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (team_id, venue_id),
  FOREIGN KEY (team_id, venue_capacity_id)
    REFERENCES public.tonight_teams(id, venue_capacity_id) ON DELETE RESTRICT,
  FOREIGN KEY (venue_capacity_id, venue_id)
    REFERENCES public.tonight_venue_capacities(id, venue_id) ON DELETE RESTRICT
);

CREATE TABLE public.tonight_settlements (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  confirmed_attendee_count SMALLINT NOT NULL CHECK (confirmed_attendee_count BETWEEN 0 AND 5),
  fee_per_attendee INTEGER NOT NULL CHECK (fee_per_attendee >= 0),
  total_fee INTEGER GENERATED ALWAYS AS (confirmed_attendee_count * fee_per_attendee) STORED,
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN (
    'ready', 'processing', 'paid', 'void', 'disputed'
  )),
  idempotency_key TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMPTZ,
  FOREIGN KEY (team_id, venue_id)
    REFERENCES public.tonight_partner_service_confirmations(team_id, venue_id) ON DELETE RESTRICT
);

CREATE TABLE public.tonight_incident_reports (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.tonight_teams(id) ON DELETE RESTRICT,
  reporter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  subject_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN (
    'safety', 'harassment', 'no_show', 'venue', 'payment', 'other'
  )),
  description TEXT NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(description)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quantum_private.tonight_call_attempts (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.tonight_teams(id) ON DELETE RESTRICT,
  subject_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  attempted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  outcome TEXT NOT NULL CHECK (outcome IN ('answered', 'no_answer', 'busy', 'wrong_number', 'follow_up')),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE TABLE quantum_private.tonight_audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('authenticated', 'service')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  before_state JSONB,
  after_state JSONB,
  idempotency_key TEXT
);

CREATE INDEX tonight_rounds_status_date_idx
  ON public.tonight_rounds (status, service_date);
CREATE INDEX tonight_round_activities_round_idx
  ON public.tonight_round_activities (round_id, slot);
CREATE INDEX tonight_friend_bundles_round_idx
  ON public.tonight_friend_bundles (round_id, status);
CREATE INDEX tonight_friend_bundle_members_application_idx
  ON public.tonight_friend_bundle_members (application_id);
CREATE INDEX tonight_applications_round_status_idx
  ON public.tonight_applications (round_id, status);
CREATE INDEX tonight_applications_user_idx
  ON public.tonight_applications (user_id, submitted_at DESC);
CREATE INDEX tonight_application_choices_activity_idx
  ON public.tonight_application_choices (activity_id, rank);
CREATE INDEX tonight_applicant_features_user_idx
  ON quantum_private.tonight_applicant_features (user_id);
CREATE UNIQUE INDEX tonight_audit_events_idempotency_idx
  ON quantum_private.tonight_audit_events (entity_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX tonight_venue_capacities_venue_round_idx
  ON public.tonight_venue_capacities (venue_id, round_id, status);
CREATE INDEX tonight_teams_round_status_idx
  ON public.tonight_teams (round_id, status);
CREATE INDEX tonight_team_members_user_idx
  ON public.tonight_team_members (user_id);
CREATE INDEX tonight_team_members_bundle_idx
  ON public.tonight_team_members (bundle_id, team_id);
CREATE INDEX tonight_deposits_user_status_idx
  ON public.tonight_deposits (user_id, status);
CREATE INDEX tonight_deposit_result_events_deposit_idx
  ON quantum_private.tonight_deposit_result_events (deposit_id, recorded_at DESC);
CREATE INDEX tonight_refund_requests_claim_idx
  ON public.tonight_deposit_refund_requests (
    settlement_next_retry_at,
    settlement_lease_expires_at,
    requested_at
  )
  WHERE status IN ('requested', 'failed', 'processing');
CREATE INDEX tonight_attendance_team_status_idx
  ON public.tonight_attendance (team_id, status);
CREATE INDEX tonight_reports_team_status_idx
  ON public.tonight_incident_reports (team_id, status);
CREATE INDEX tonight_call_attempts_subject_idx
  ON quantum_private.tonight_call_attempts (subject_user_id, attempted_at DESC);
CREATE INDEX tonight_audit_entity_idx
  ON quantum_private.tonight_audit_events (entity_type, entity_id, occurred_at DESC);

ALTER TABLE public.tonight_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_market_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_round_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_friend_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_friend_bundle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_application_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_venue_capacities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_deposit_refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_partner_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_partner_service_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tonight_incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_private.tonight_applicant_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_private.tonight_deposit_result_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_private.tonight_call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_private.tonight_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tonight_rounds
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_market_memberships
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_round_activities
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_friend_bundles
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_friend_bundle_members
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_applications
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_application_choices
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_venue_capacities
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_teams
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_team_members
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_deposits
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_deposit_refund_requests
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_partner_acceptances
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_attendance
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_partner_service_confirmations
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_settlements
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tonight_incident_reports
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE quantum_private.tonight_applicant_features
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE quantum_private.tonight_deposit_result_events
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE quantum_private.tonight_call_attempts
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE quantum_private.tonight_audit_events
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.tonight_market_memberships,
  public.tonight_rounds,
  public.tonight_round_activities,
  public.tonight_friend_bundles,
  public.tonight_friend_bundle_members,
  public.tonight_applications,
  public.tonight_application_choices,
  public.tonight_venue_capacities,
  public.tonight_teams,
  public.tonight_team_members,
  public.tonight_deposits,
  public.tonight_deposit_refund_requests,
  public.tonight_partner_acceptances,
  public.tonight_attendance,
  public.tonight_partner_service_confirmations,
  public.tonight_settlements,
  public.tonight_incident_reports
TO service_role;

GRANT SELECT ON TABLE
  quantum_private.tonight_applicant_features,
  quantum_private.tonight_deposit_result_events,
  quantum_private.tonight_call_attempts,
  quantum_private.tonight_audit_events
TO service_role;

REVOKE ALL ON FUNCTION public.tonight_deposit_amount()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tonight_deposit_amount()
  TO authenticated, service_role;

COMMENT ON TABLE public.tonight_teams IS
  'Tonight-only five-person teams. team_code is stable and globally unique, not venue-local Quantum 1.';
COMMENT ON TABLE quantum_private.tonight_applicant_features IS
  'Private server snapshot used for age, gender, and appearance-aware allocation; never browser-readable.';
COMMENT ON TABLE quantum_private.tonight_deposit_result_events IS
  'Append-only raw-key-free provider result ledger supporting uncertain payment reconciliation.';
COMMENT ON TABLE quantum_private.tonight_audit_events IS
  'Append-only automatic actor/time/before/after ledger. Product policy intentionally requires no manual reason.';

COMMIT;
