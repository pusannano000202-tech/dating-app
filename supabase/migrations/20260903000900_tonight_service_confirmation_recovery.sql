-- Preserve a partner's service headcount evidence even when reconciliation is
-- required, add a recent-auth super-admin recovery path, and bound the team
-- lists used by the live operations consoles.

BEGIN;

CREATE TABLE quantum_private.tonight_partner_service_confirmation_attempts (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.tonight_teams(id) ON DELETE RESTRICT,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  reported_attendee_count SMALLINT NOT NULL CHECK (reported_attendee_count BETWEEN 0 AND 5),
  observed_arrived_count SMALLINT NOT NULL CHECK (observed_arrived_count BETWEEN 0 AND 5),
  reported_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  service_completed_at TIMESTAMPTZ NOT NULL,
  expected_confirmation_revision INTEGER NOT NULL CHECK (expected_confirmation_revision >= 0),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE INDEX tonight_partner_service_confirmation_attempts_team_idx
  ON quantum_private.tonight_partner_service_confirmation_attempts
  (team_id, attempted_at DESC, id DESC);

ALTER TABLE quantum_private.tonight_partner_service_confirmation_attempts
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE quantum_private.tonight_partner_service_confirmation_attempts
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tonight_partner_service_confirmation_attempts_update_immutable
  BEFORE UPDATE ON quantum_private.tonight_partner_service_confirmation_attempts
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE TRIGGER tonight_partner_service_confirmation_attempts_delete_immutable
  BEFORE DELETE ON quantum_private.tonight_partner_service_confirmation_attempts
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE OR REPLACE FUNCTION public.partner_record_tonight_service_confirmation_attempt(
  p_team_id UUID,
  p_reported_attendee_count SMALLINT,
  p_service_completed_at TIMESTAMPTZ,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_team public.tonight_teams%ROWTYPE;
  v_round public.tonight_rounds%ROWTYPE;
  v_venue_id UUID;
  v_current_venue_id UUID;
  v_activity_duration_minutes SMALLINT;
  v_observed_arrived_count INTEGER;
  v_confirmation_revision INTEGER := 0;
  v_attempt quantum_private.tonight_partner_service_confirmation_attempts%ROWTYPE;
  v_attempt_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_team_id IS NULL THEN RAISE EXCEPTION 'tonight_team_not_found'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_reported_attendee_count IS NULL
    OR p_reported_attendee_count < 0
    OR p_reported_attendee_count > 5 THEN
    RAISE EXCEPTION 'invalid_confirmed_attendee_count';
  END IF;
  IF p_service_completed_at IS NULL THEN
    RAISE EXCEPTION 'invalid_service_completion_time';
  END IF;

  SELECT candidate_capacity.venue_id
  INTO v_venue_id
  FROM public.tonight_teams AS candidate_team
  JOIN public.tonight_venue_capacities AS candidate_capacity
    ON candidate_capacity.id = candidate_team.venue_capacity_id
  WHERE candidate_team.id = p_team_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'venue-partner-venue:' || v_venue_id::TEXT,
      0
    )
  );
  PERFORM active_partner.id
  FROM public.venue_partner_memberships AS active_partner
  WHERE active_partner.venue_id = v_venue_id
    AND active_partner.user_id = v_caller
    AND active_partner.revoked_at IS NULL
  FOR SHARE OF active_partner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  SELECT team.* INTO v_team
  FROM public.tonight_teams AS team
  WHERE team.id = p_team_id
  FOR UPDATE OF team;
  IF NOT FOUND OR v_team.venue_capacity_id IS NULL THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  SELECT capacity.venue_id INTO v_current_venue_id
  FROM public.tonight_venue_capacities AS capacity
  WHERE capacity.id = v_team.venue_capacity_id;
  IF v_current_venue_id IS NULL
    OR v_current_venue_id IS DISTINCT FROM v_venue_id
    OR NOT public.is_venue_partner(v_venue_id, v_caller) THEN
    -- Do not reveal whether a team belongs to another venue.
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  SELECT attempt.* INTO v_attempt
  FROM quantum_private.tonight_partner_service_confirmation_attempts AS attempt
  WHERE attempt.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_attempt.team_id <> p_team_id
      OR v_attempt.venue_id <> v_venue_id
      OR v_attempt.reported_by <> v_caller
      OR v_attempt.reported_attendee_count <> p_reported_attendee_count
      OR v_attempt.service_completed_at <> p_service_completed_at
      OR v_attempt.expected_confirmation_revision <> p_expected_revision THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'attempt_id', v_attempt.id,
      'reported_attendee_count', v_attempt.reported_attendee_count,
      'observed_arrived_count', v_attempt.observed_arrived_count,
      'matches_attendance', v_attempt.reported_attendee_count = v_attempt.observed_arrived_count,
      'confirmation_revision', v_attempt.expected_confirmation_revision
    );
  END IF;

  SELECT round_row.* INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = v_team.round_id;
  SELECT activity.duration_minutes INTO v_activity_duration_minutes
  FROM public.tonight_round_activities AS activity
  WHERE activity.id = v_team.activity_id
    AND activity.round_id = v_team.round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tonight_activity_not_found'; END IF;
  IF CURRENT_TIMESTAMP < v_round.starts_at
        + pg_catalog.make_interval(mins => v_activity_duration_minutes)
    OR p_service_completed_at < v_round.starts_at
        + pg_catalog.make_interval(mins => v_activity_duration_minutes)
    OR p_service_completed_at > CURRENT_TIMESTAMP + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'invalid_service_completion_time';
  END IF;
  IF v_team.status NOT IN ('accepted', 'revealed', 'in_progress', 'completed') THEN
    RAISE EXCEPTION 'team_not_serviceable';
  END IF;

  PERFORM attendance.id
  FROM public.tonight_attendance AS attendance
  WHERE attendance.team_id = p_team_id
  ORDER BY attendance.user_id
  FOR UPDATE OF attendance;

  SELECT COUNT(*) INTO v_observed_arrived_count
  FROM public.tonight_attendance AS attendance
  WHERE attendance.team_id = p_team_id
    AND attendance.status = 'arrived';

  SELECT confirmation.revision INTO v_confirmation_revision
  FROM public.tonight_partner_service_confirmations AS confirmation
  WHERE confirmation.team_id = p_team_id
  FOR UPDATE OF confirmation;
  IF NOT FOUND THEN v_confirmation_revision := 0; END IF;
  IF v_confirmation_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision'
      USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || v_confirmation_revision;
  END IF;

  INSERT INTO quantum_private.tonight_partner_service_confirmation_attempts (
    team_id, venue_id, reported_attendee_count, observed_arrived_count,
    reported_by, service_completed_at, expected_confirmation_revision, idempotency_key
  ) VALUES (
    p_team_id, v_venue_id, p_reported_attendee_count, v_observed_arrived_count,
    v_caller, p_service_completed_at, p_expected_revision, p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_attempt_id;

  IF v_attempt_id IS NULL THEN
    SELECT attempt.* INTO v_attempt
    FROM quantum_private.tonight_partner_service_confirmation_attempts AS attempt
    WHERE attempt.idempotency_key = p_idempotency_key;
    IF NOT FOUND
      OR v_attempt.team_id <> p_team_id
      OR v_attempt.venue_id <> v_venue_id
      OR v_attempt.reported_by <> v_caller
      OR v_attempt.reported_attendee_count <> p_reported_attendee_count
      OR v_attempt.observed_arrived_count <> v_observed_arrived_count
      OR v_attempt.service_completed_at <> p_service_completed_at
      OR v_attempt.expected_confirmation_revision <> p_expected_revision THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    v_attempt_id := v_attempt.id;
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'service_confirmation_attempt', v_attempt_id, 'partner_service_confirmation_attempted', NULL,
    pg_catalog.jsonb_build_object(
      'team_id', p_team_id,
      'venue_id', v_venue_id,
      'reported_attendee_count', p_reported_attendee_count,
      'observed_arrived_count', v_observed_arrived_count,
      'expected_confirmation_revision', p_expected_revision
    ),
    p_idempotency_key
  );

  -- A mismatch is evidence, not an error in this transaction. The API commits
  -- this RPC before attempting canonical confirmation in a separate request.
  RETURN pg_catalog.jsonb_build_object(
    'attempt_id', v_attempt_id,
    'reported_attendee_count', p_reported_attendee_count,
    'observed_arrived_count', v_observed_arrived_count,
    'matches_attendance', p_reported_attendee_count = v_observed_arrived_count,
    'confirmation_revision', v_confirmation_revision
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tonight_service_exceptions(
  p_round_id UUID
)
RETURNS TABLE (
  exception_kind TEXT,
  exception_team_id UUID,
  exception_team_code TEXT,
  exception_status TEXT,
  service_attempt_id UUID,
  reported_attendee_count SMALLINT,
  observed_arrived_count SMALLINT,
  service_confirmation_revision INTEGER
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
  IF NOT public.is_admin(v_caller) THEN RAISE EXCEPTION 'admin_required'; END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN latest_attempt.id IS NOT NULL
        AND latest_attempt.reported_attendee_count <> arrived.arrived_count
      THEN 'headcount_mismatch'::TEXT
      WHEN confirmation.id IS NOT NULL
        AND confirmation.confirmed_attendee_count <> arrived.arrived_count
      THEN 'headcount_mismatch'::TEXT
      ELSE 'service_confirmation_missing'::TEXT
    END,
    team.id,
    team.team_code,
    CASE
      WHEN latest_attempt.id IS NOT NULL
        AND latest_attempt.reported_attendee_count <> arrived.arrived_count
      THEN 'attendance_mismatch'::TEXT
      WHEN confirmation.id IS NOT NULL
        AND confirmation.confirmed_attendee_count <> arrived.arrived_count
      THEN 'attendance_mismatch'::TEXT
      ELSE 'confirmation_missing'::TEXT
    END,
    latest_attempt.id,
    latest_attempt.reported_attendee_count,
    arrived.arrived_count::SMALLINT,
    COALESCE(confirmation.revision, 0)
  FROM public.tonight_teams AS team
  JOIN public.tonight_rounds AS round_row
    ON round_row.id = team.round_id
  JOIN public.tonight_round_activities AS activity
    ON activity.id = team.activity_id
    AND activity.round_id = team.round_id
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS arrived_count
    FROM public.tonight_attendance AS attendance
    WHERE attendance.team_id = team.id
      AND attendance.status = 'arrived'
  ) AS arrived
  LEFT JOIN LATERAL (
    SELECT attempt.*
    FROM quantum_private.tonight_partner_service_confirmation_attempts AS attempt
    WHERE attempt.team_id = team.id
    ORDER BY attempt.attempted_at DESC, attempt.id DESC
    LIMIT 1
  ) AS latest_attempt ON TRUE
  LEFT JOIN public.tonight_partner_service_confirmations AS confirmation
    ON confirmation.team_id = team.id
  WHERE team.round_id = p_round_id
    AND team.status IN ('accepted', 'revealed', 'in_progress', 'completed')
    AND CURRENT_TIMESTAMP >= round_row.starts_at
      + pg_catalog.make_interval(mins => activity.duration_minutes)
      + INTERVAL '10 minutes'
    AND (
      confirmation.id IS NULL
      OR confirmation.confirmed_attendee_count <> arrived.arrived_count
      OR (
        latest_attempt.id IS NOT NULL
        AND latest_attempt.attempted_at > confirmation.updated_at
        AND latest_attempt.reported_attendee_count <> arrived.arrived_count
      )
    )
  ORDER BY team.team_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_recover_tonight_service_confirmation(
  p_team_id UUID,
  p_attempt_id UUID,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_team public.tonight_teams%ROWTYPE;
  v_attempt quantum_private.tonight_partner_service_confirmation_attempts%ROWTYPE;
  v_latest_attempt_id UUID;
  v_confirmation public.tonight_partner_service_confirmations%ROWTYPE;
  v_confirmation_id UUID;
  v_confirmation_revision INTEGER;
  v_observed_arrived_count INTEGER;
  v_before JSONB;
  v_after JSONB;
  v_audit quantum_private.tonight_audit_events%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_team_id IS NULL OR p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'service_attempt_required';
  END IF;
  IF p_expected_revision IS NULL THEN RAISE EXCEPTION 'expected_revision_required'; END IF;
  IF p_expected_revision < 0 THEN RAISE EXCEPTION 'stale_revision'; END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  SELECT audit.* INTO v_audit
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'service_confirmation'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_audit.actor_user_id <> v_caller
      OR v_audit.action <> 'service_confirmation_recovered'
      OR (v_audit.after_state ->> 'team_id')::UUID <> p_team_id
      OR (v_audit.after_state ->> 'attempt_id')::UUID <> p_attempt_id
      OR (v_audit.before_state ->> 'revision')::INTEGER <> p_expected_revision THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_audit.after_state;
  END IF;

  SELECT team.* INTO v_team
  FROM public.tonight_teams AS team
  WHERE team.id = p_team_id
  FOR UPDATE OF team;
  IF NOT FOUND OR v_team.venue_capacity_id IS NULL THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  SELECT audit.* INTO v_audit
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'service_confirmation'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_audit.actor_user_id <> v_caller
      OR v_audit.action <> 'service_confirmation_recovered'
      OR (v_audit.after_state ->> 'team_id')::UUID <> p_team_id
      OR (v_audit.after_state ->> 'attempt_id')::UUID <> p_attempt_id
      OR (v_audit.before_state ->> 'revision')::INTEGER <> p_expected_revision THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_audit.after_state;
  END IF;

  SELECT attempt.* INTO v_attempt
  FROM quantum_private.tonight_partner_service_confirmation_attempts AS attempt
  WHERE attempt.id = p_attempt_id
    AND attempt.team_id = p_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'service_attempt_not_found'; END IF;

  SELECT latest_attempt.id INTO v_latest_attempt_id
  FROM quantum_private.tonight_partner_service_confirmation_attempts AS latest_attempt
  WHERE latest_attempt.team_id = p_team_id
  ORDER BY latest_attempt.attempted_at DESC, latest_attempt.id DESC
  LIMIT 1;
  IF v_latest_attempt_id IS DISTINCT FROM p_attempt_id THEN
    RAISE EXCEPTION 'latest_service_attempt_required';
  END IF;

  PERFORM attendance.id
  FROM public.tonight_attendance AS attendance
  WHERE attendance.team_id = p_team_id
  ORDER BY attendance.user_id
  FOR UPDATE OF attendance;
  SELECT COUNT(*) INTO v_observed_arrived_count
  FROM public.tonight_attendance AS attendance
  WHERE attendance.team_id = p_team_id
    AND attendance.status = 'arrived';
  IF v_observed_arrived_count <> v_attempt.reported_attendee_count THEN
    RAISE EXCEPTION 'attendance_reconciliation_required';
  END IF;

  SELECT confirmation.* INTO v_confirmation
  FROM public.tonight_partner_service_confirmations AS confirmation
  WHERE confirmation.team_id = p_team_id
  FOR UPDATE OF confirmation;
  IF FOUND THEN
    v_before := pg_catalog.to_jsonb(v_confirmation);
    IF v_confirmation.revision <> p_expected_revision THEN
      RAISE EXCEPTION 'stale_revision'
        USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || v_confirmation.revision;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.tonight_settlements AS settlement
      WHERE settlement.team_id = p_team_id
    ) THEN
      RAISE EXCEPTION 'settlement_already_finalized';
    END IF;
    UPDATE public.tonight_partner_service_confirmations AS confirmation
    SET confirmed_attendee_count = v_attempt.reported_attendee_count,
        observed_arrived_count = v_observed_arrived_count,
        confirmed_by = v_attempt.reported_by,
        revision = confirmation.revision + 1,
        idempotency_key = p_idempotency_key,
        service_completed_at = v_attempt.service_completed_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE confirmation.id = v_confirmation.id
      AND confirmation.revision = p_expected_revision
    RETURNING confirmation.id, confirmation.revision
      INTO v_confirmation_id, v_confirmation_revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;
  ELSE
    v_before := pg_catalog.jsonb_build_object('revision', 0);
    IF p_expected_revision <> 0 THEN
      RAISE EXCEPTION 'stale_revision'
        USING DETAIL = 'expected=' || p_expected_revision || ';actual=0';
    END IF;
    INSERT INTO public.tonight_partner_service_confirmations (
      team_id, venue_capacity_id, venue_id, confirmed_attendee_count,
      observed_arrived_count, confirmed_by, revision, idempotency_key,
      service_completed_at
    ) VALUES (
      p_team_id, v_team.venue_capacity_id, v_attempt.venue_id,
      v_attempt.reported_attendee_count, v_observed_arrived_count,
      v_attempt.reported_by, 0, p_idempotency_key, v_attempt.service_completed_at
    )
    RETURNING id, revision INTO v_confirmation_id, v_confirmation_revision;
  END IF;

  UPDATE public.tonight_teams AS team
  SET status = 'completed', revision = team.revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE team.id = p_team_id;
  UPDATE public.tonight_attendance AS attendance
  SET status = 'no_show', revision = attendance.revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE attendance.team_id = p_team_id AND attendance.status = 'pending';
  UPDATE public.tonight_rounds AS round_row
  SET status = CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM public.tonight_teams AS active_team
          WHERE active_team.round_id = v_team.round_id
            AND active_team.status NOT IN ('completed', 'cancelled')
        ) THEN 'completed'
        ELSE 'accepted'
      END,
      revision = round_row.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE round_row.id = v_team.round_id;

  v_after := pg_catalog.jsonb_build_object(
    'service_confirmation_id', v_confirmation_id,
    'service_confirmation_revision', v_confirmation_revision,
    'team_id', p_team_id,
    'attempt_id', p_attempt_id,
    'reported_attendee_count', v_attempt.reported_attendee_count,
    'observed_arrived_count', v_observed_arrived_count
  );
  PERFORM quantum_private.write_tonight_audit(
    'service_confirmation', v_confirmation_id, 'service_confirmation_recovered',
    v_before, v_after, p_idempotency_key
  );
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tonight_round_summary_page(
  p_round_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_after_team_number INTEGER DEFAULT NULL
)
RETURNS TABLE (
  summary_team_id UUID,
  summary_team_number INTEGER,
  summary_team_code TEXT,
  summary_team_status TEXT,
  summary_activity_title TEXT,
  summary_venue_name TEXT,
  summary_member_count SMALLINT,
  summary_male_count SMALLINT,
  summary_female_count SMALLINT,
  summary_paid_count INTEGER,
  summary_arrived_count INTEGER,
  summary_confirmed_count SMALLINT,
  summary_open_report_count INTEGER
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
  IF NOT public.is_admin(v_caller) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_limit < 1 OR p_limit > 50 THEN RAISE EXCEPTION 'invalid_limit'; END IF;
  IF p_after_team_number IS NOT NULL AND p_after_team_number < 0 THEN
    RAISE EXCEPTION 'invalid_cursor';
  END IF;

  RETURN QUERY
  SELECT
    team.id,
    team.team_number,
    team.team_code,
    team.status,
    activity.title,
    snapshot.display_name,
    team.member_count,
    team.male_count,
    team.female_count,
    (
      SELECT COUNT(*)::INTEGER
      FROM public.tonight_team_members AS paid_member
      JOIN public.tonight_deposits AS paid_deposit
        ON paid_deposit.application_id = paid_member.application_id
      WHERE paid_member.team_id = team.id
        AND paid_deposit.status IN ('paid', 'held')
    ),
    (
      SELECT COUNT(*)::INTEGER
      FROM public.tonight_attendance AS arrived_attendance
      WHERE arrived_attendance.team_id = team.id
        AND arrived_attendance.status = 'arrived'
    ),
    confirmation.confirmed_attendee_count,
    (
      SELECT COUNT(*)::INTEGER
      FROM public.tonight_incident_reports AS report
      WHERE report.team_id = team.id
        AND report.status IN ('open', 'reviewing')
    )
  FROM public.tonight_teams AS team
  JOIN public.tonight_round_activities AS activity ON activity.id = team.activity_id
  LEFT JOIN public.tonight_venue_capacities AS capacity ON capacity.id = team.venue_capacity_id
  LEFT JOIN public.venue_snapshots AS snapshot ON snapshot.id = capacity.venue_snapshot_id
  LEFT JOIN public.tonight_partner_service_confirmations AS confirmation
    ON confirmation.team_id = team.id
  WHERE team.round_id = p_round_id
    AND (p_after_team_number IS NULL OR team.team_number > p_after_team_number)
  ORDER BY team.team_number
  LIMIT p_limit + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_tonight_team_bundle_options(
  p_round_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_after_team_number INTEGER DEFAULT NULL
)
RETURNS TABLE (
  bundle_team_id UUID,
  bundle_team_number INTEGER,
  bundle_team_code TEXT,
  bundle_team_revision INTEGER,
  bundle_id UUID,
  bundle_member_count INTEGER
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
  IF p_limit < 1 OR p_limit > 50 THEN RAISE EXCEPTION 'invalid_limit'; END IF;
  IF p_after_team_number IS NOT NULL AND p_after_team_number < 0 THEN
    RAISE EXCEPTION 'invalid_cursor';
  END IF;

  RETURN QUERY
  WITH page_teams AS MATERIALIZED (
    SELECT team.id, team.team_number, team.team_code, team.revision
    FROM public.tonight_teams AS team
    WHERE team.round_id = p_round_id
      AND (p_after_team_number IS NULL OR team.team_number > p_after_team_number)
    ORDER BY team.team_number
    LIMIT p_limit + 1
  )
  SELECT
    team.id,
    team.team_number,
    team.team_code,
    team.revision,
    member.bundle_id,
    COUNT(*)::INTEGER
  FROM page_teams AS team
  JOIN public.tonight_team_members AS member ON member.team_id = team.id
  GROUP BY team.id, team.team_number, team.team_code, team.revision, member.bundle_id
  ORDER BY team.team_number, MIN(member.seat_number);
END;
$$;

-- Canonicalize legacy outcomes before making the call ledger immutable.
DO $$
DECLARE
  attempt quantum_private.tonight_call_attempts%ROWTYPE;
  v_new_outcome TEXT;
BEGIN
  FOR attempt IN
    SELECT call_attempt.*
    FROM quantum_private.tonight_call_attempts AS call_attempt
    WHERE call_attempt.outcome IN ('busy', 'follow_up')
    ORDER BY call_attempt.attempted_at, call_attempt.id
  LOOP
    v_new_outcome := CASE attempt.outcome
      WHEN 'busy' THEN 'no_answer'
      WHEN 'follow_up' THEN 'arriving'
    END;
    UPDATE quantum_private.tonight_call_attempts AS call_attempt
    SET outcome = v_new_outcome
    WHERE call_attempt.id = attempt.id;
    PERFORM quantum_private.write_tonight_audit(
      'call_attempt', attempt.id, 'call_outcome_canonicalized',
      pg_catalog.jsonb_build_object('outcome', attempt.outcome),
      pg_catalog.jsonb_build_object('outcome', v_new_outcome),
      'call-outcome-canonicalized-' || attempt.id::TEXT
    );
  END LOOP;
END;
$$;

ALTER TABLE quantum_private.tonight_call_attempts
  DROP CONSTRAINT IF EXISTS tonight_call_attempts_outcome_check;
ALTER TABLE quantum_private.tonight_call_attempts
  ADD CONSTRAINT tonight_call_attempts_outcome_check
  CHECK (outcome IN ('answered', 'no_answer', 'wrong_number', 'arriving', 'cancelled'));

CREATE TRIGGER tonight_call_attempts_update_immutable
  BEFORE UPDATE ON quantum_private.tonight_call_attempts
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();
CREATE TRIGGER tonight_call_attempts_delete_immutable
  BEFORE DELETE ON quantum_private.tonight_call_attempts
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE OR REPLACE FUNCTION public.admin_record_tonight_call_attempt(
  p_team_id UUID,
  p_subject_user_id UUID,
  p_outcome TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_attempt_id UUID;
  v_attempt quantum_private.tonight_call_attempts%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_caller) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_outcome IS NULL
    OR p_outcome NOT IN ('answered', 'no_answer', 'wrong_number', 'arriving', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_call_outcome';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tonight_team_members AS member
    WHERE member.team_id = p_team_id AND member.user_id = p_subject_user_id
  ) THEN
    RAISE EXCEPTION 'team_member_not_found';
  END IF;

  INSERT INTO quantum_private.tonight_call_attempts (
    team_id, subject_user_id, attempted_by, outcome, idempotency_key
  ) VALUES (p_team_id, p_subject_user_id, v_caller, p_outcome, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_attempt_id;
  IF v_attempt_id IS NULL THEN
    SELECT existing_attempt.* INTO v_attempt
    FROM quantum_private.tonight_call_attempts AS existing_attempt
    WHERE existing_attempt.idempotency_key = p_idempotency_key;
    IF NOT FOUND
      OR v_attempt.attempted_by <> v_caller
      OR v_attempt.team_id <> p_team_id
      OR v_attempt.subject_user_id <> p_subject_user_id
      OR v_attempt.outcome <> p_outcome THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_attempt.id;
  END IF;

  -- cancelled is contact history only; it never mutates attendance or a team.
  PERFORM quantum_private.write_tonight_audit(
    'call_attempt', v_attempt_id, 'call_attempt_recorded', NULL,
    pg_catalog.jsonb_build_object(
      'team_id', p_team_id,
      'subject_user_id', p_subject_user_id,
      'outcome', p_outcome
    ),
    p_idempotency_key
  );
  RETURN v_attempt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_record_tonight_service_confirmation_attempt(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_service_exceptions(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_recover_tonight_service_confirmation(UUID, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_round_summary_page(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_list_tonight_team_bundle_options(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_record_tonight_call_attempt(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
-- Keep the legacy function for migration compatibility but remove browser use.
REVOKE ALL ON FUNCTION public.admin_get_tonight_round_summary(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.partner_record_tonight_service_confirmation_attempt(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_service_exceptions(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_recover_tonight_service_confirmation(UUID, UUID, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_round_summary_page(UUID, INTEGER, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_list_tonight_team_bundle_options(UUID, INTEGER, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_tonight_call_attempt(UUID, UUID, TEXT, TEXT)
  TO authenticated;

COMMIT;
