-- Runs after the authoritative friend-invite ledger. Standard teams are 3M2F; 3M3F is allowed
-- only when the three women are one fully ready, accepted friend bundle.

BEGIN;

-- Fail before changing any constraint when an older deployment still owns a
-- 2M3F (or otherwise incompatible) team. Historical team records require an
-- explicit, product-approved archive/remediation decision; this migration must
-- never silently rewrite or strand them midway through a transaction.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tonight_teams AS team
    WHERE NOT (
      (team.member_count = 5 AND team.male_count = 3 AND team.female_count = 2)
      OR (team.member_count = 6 AND team.male_count = 3 AND team.female_count = 3)
    )
  ) THEN
    RAISE EXCEPTION 'tonight_roster_legacy_team_remediation_required';
  END IF;
END;
$$;

ALTER TABLE public.tonight_teams
  DROP CONSTRAINT IF EXISTS tonight_teams_member_count_check,
  DROP CONSTRAINT IF EXISTS tonight_teams_gender_mix;
ALTER TABLE public.tonight_teams
  ADD CONSTRAINT tonight_teams_member_count_check CHECK (member_count IN (5, 6)),
  ADD CONSTRAINT tonight_teams_gender_mix CHECK (
    (member_count = 5 AND male_count = 3 AND female_count = 2)
    OR (member_count = 6 AND male_count = 3 AND female_count = 3)
  );

ALTER TABLE public.tonight_team_members
  DROP CONSTRAINT IF EXISTS tonight_team_members_seat_number_check;
ALTER TABLE public.tonight_team_members
  ADD CONSTRAINT tonight_team_members_seat_number_check
  CHECK (seat_number BETWEEN 1 AND 6);

ALTER TABLE public.tonight_partner_acceptances
  DROP CONSTRAINT IF EXISTS tonight_partner_acceptances_accepted_headcount_check;
ALTER TABLE public.tonight_partner_acceptances
  ADD CONSTRAINT tonight_partner_acceptances_accepted_headcount_check
  CHECK (accepted_headcount BETWEEN 0 AND 6);

ALTER TABLE public.tonight_partner_service_confirmations
  DROP CONSTRAINT IF EXISTS tonight_partner_service_confirmations_confirmed_attendee_count_check,
  DROP CONSTRAINT IF EXISTS tonight_partner_service_confirmations_observed_arrived_count_check;
ALTER TABLE public.tonight_partner_service_confirmations
  ADD CONSTRAINT tonight_partner_service_confirmations_confirmed_attendee_count_check
    CHECK (confirmed_attendee_count BETWEEN 0 AND 6),
  ADD CONSTRAINT tonight_partner_service_confirmations_observed_arrived_count_check
    CHECK (observed_arrived_count BETWEEN 0 AND 6);

ALTER TABLE public.tonight_settlements
  DROP CONSTRAINT IF EXISTS tonight_settlements_confirmed_attendee_count_check;
ALTER TABLE public.tonight_settlements
  ADD CONSTRAINT tonight_settlements_confirmed_attendee_count_check
  CHECK (confirmed_attendee_count BETWEEN 0 AND 6);

ALTER TABLE quantum_private.tonight_partner_service_confirmation_attempts
  DROP CONSTRAINT IF EXISTS tonight_partner_service_confirmation_attempts_reported_attendee_count_check,
  DROP CONSTRAINT IF EXISTS tonight_partner_service_confirmation_attempts_observed_arrived_count_check;
ALTER TABLE quantum_private.tonight_partner_service_confirmation_attempts
  ADD CONSTRAINT tonight_partner_service_confirmation_attempts_reported_attendee_count_check
    CHECK (reported_attendee_count BETWEEN 0 AND 6),
  ADD CONSTRAINT tonight_partner_service_confirmation_attempts_observed_arrived_count_check
    CHECK (observed_arrived_count BETWEEN 0 AND 6);

ALTER TABLE public.tonight_venue_capacities
  ADD COLUMN max_team_headcount SMALLINT NOT NULL DEFAULT 5;
ALTER TABLE public.tonight_venue_capacities
  ADD CONSTRAINT tonight_venue_capacities_max_team_headcount_check
  CHECK (max_team_headcount IN (5, 6));

-- The earlier ranked-activity validator was fixed to five members. Override it
-- before any roster-aware publisher calls it so the accepted female trio path
-- can publish a six-person team without weakening the default five-person rule.
CREATE OR REPLACE FUNCTION quantum_private.assert_tonight_ranked_activity_selection(
  p_round_id UUID,
  p_application_ids UUID[],
  p_selected_activity_id UUID,
  p_enforce_capacity BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team_size INTEGER := pg_catalog.cardinality(p_application_ids);
  v_application_count INTEGER;
  v_choice_count INTEGER;
  v_round_activity_count INTEGER;
  v_ranked_activity_ids UUID[];
  v_selected_position INTEGER;
BEGIN
  IF p_round_id IS NULL OR p_selected_activity_id IS NULL THEN
    RAISE EXCEPTION 'team_activity_rank_input_invalid';
  END IF;
  IF p_enforce_capacity IS NULL THEN
    RAISE EXCEPTION 'team_activity_capacity_policy_required';
  END IF;
  IF p_application_ids IS NULL OR v_team_size NOT IN (5, 6) THEN
    RAISE EXCEPTION 'invalid_team_size';
  END IF;
  IF (
    SELECT COUNT(DISTINCT application_id)
    FROM pg_catalog.unnest(p_application_ids) AS member(application_id)
  ) <> v_team_size THEN
    RAISE EXCEPTION 'duplicate_team_member';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_application_count
  FROM public.tonight_applications AS application_row
  WHERE application_row.round_id = p_round_id
    AND application_row.id = ANY(p_application_ids);
  IF v_application_count <> v_team_size THEN
    RAISE EXCEPTION 'team_application_invalid';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_round_activity_count
  FROM public.tonight_round_activities AS activity
  WHERE activity.round_id = p_round_id;
  IF v_round_activity_count <> 3
    OR (
      SELECT COUNT(DISTINCT activity.slot)
      FROM public.tonight_round_activities AS activity
      WHERE activity.round_id = p_round_id
    ) <> 3
    OR (
      SELECT pg_catalog.array_agg(activity.slot ORDER BY activity.slot)
      FROM public.tonight_round_activities AS activity
      WHERE activity.round_id = p_round_id
    ) <> ARRAY[1, 2, 3]::SMALLINT[] THEN
    RAISE EXCEPTION 'round_activity_count_invalid';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_choice_count
  FROM public.tonight_application_choices AS choice
  WHERE choice.round_id = p_round_id
    AND choice.application_id = ANY(p_application_ids);
  IF v_choice_count <> v_team_size * 3 THEN
    RAISE EXCEPTION 'application_choice_count_invalid';
  END IF;

  IF EXISTS (
    SELECT choice.application_id
    FROM public.tonight_application_choices AS choice
    WHERE choice.round_id = p_round_id
      AND choice.application_id = ANY(p_application_ids)
    GROUP BY choice.application_id
    HAVING COUNT(*) <> 3
      OR COUNT(DISTINCT choice.activity_id) <> 3
      OR pg_catalog.array_agg(choice.rank ORDER BY choice.rank)
        <> ARRAY[1, 2, 3]::SMALLINT[]
  ) THEN
    RAISE EXCEPTION 'application_choice_rank_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tonight_application_choices AS choice
    WHERE choice.round_id = p_round_id
      AND choice.application_id = ANY(p_application_ids)
      AND NOT EXISTS (
        SELECT 1
        FROM public.tonight_round_activities AS activity
        WHERE activity.round_id = p_round_id
          AND activity.id = choice.activity_id
      )
  ) THEN
    RAISE EXCEPTION 'application_choice_activity_invalid';
  END IF;

  SELECT pg_catalog.array_agg(
    ranked.activity_id
    ORDER BY
      ranked.points DESC,
      ranked.first_choice_count DESC,
      ranked.second_choice_count DESC,
      ranked.slot ASC
  )
  INTO v_ranked_activity_ids
  FROM (
    SELECT
      activity.id AS activity_id,
      activity.slot,
      COALESCE(SUM(4 - choice.rank), 0)::INTEGER AS points,
      COUNT(*) FILTER (WHERE choice.rank = 1)::INTEGER AS first_choice_count,
      COUNT(*) FILTER (WHERE choice.rank = 2)::INTEGER AS second_choice_count
    FROM public.tonight_round_activities AS activity
    LEFT JOIN public.tonight_application_choices AS choice
      ON choice.round_id = activity.round_id
      AND choice.activity_id = activity.id
      AND choice.application_id = ANY(p_application_ids)
    WHERE activity.round_id = p_round_id
    GROUP BY activity.id, activity.slot
  ) AS ranked;

  IF pg_catalog.cardinality(v_ranked_activity_ids) <> 3 THEN
    RAISE EXCEPTION 'team_activity_rank_invalid';
  END IF;

  v_selected_position := pg_catalog.array_position(v_ranked_activity_ids, p_selected_activity_id);
  IF v_selected_position IS NULL THEN
    RAISE EXCEPTION 'team_activity_rank_invalid';
  END IF;

  IF p_enforce_capacity AND v_selected_position > 1 AND EXISTS (
    SELECT 1
    FROM public.tonight_venue_capacities AS capacity
    WHERE capacity.round_id = p_round_id
      AND capacity.activity_id = ANY(v_ranked_activity_ids[1:v_selected_position - 1])
      AND capacity.status IN ('open', 'locked')
      AND capacity.max_team_headcount >= v_team_size
      AND capacity.reserved_team_count < capacity.team_capacity
  ) THEN
    RAISE EXCEPTION 'team_activity_higher_rank_capacity_available';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION quantum_private.assert_tonight_team_integrity(
  p_team_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round_id UUID;
  v_market_code TEXT;
  v_team_activity_id UUID;
  v_member_application_ids UUID[];
  v_member_count INTEGER;
  v_male_count INTEGER;
  v_female_count INTEGER;
  v_declared_member_count INTEGER;
  v_declared_male_count INTEGER;
  v_declared_female_count INTEGER;
  v_ready_female_trio_bundle_count INTEGER;
BEGIN
  SELECT
    team.round_id,
    round_row.market_code,
    team.activity_id,
    team.member_count,
    team.male_count,
    team.female_count
  INTO
    v_round_id,
    v_market_code,
    v_team_activity_id,
    v_declared_member_count,
    v_declared_male_count,
    v_declared_female_count
  FROM public.tonight_teams AS team
  JOIN public.tonight_rounds AS round_row
    ON round_row.id = team.round_id
  WHERE team.id = p_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE feature.gender_code = 'male')::INTEGER,
    COUNT(*) FILTER (WHERE feature.gender_code = 'female')::INTEGER
  INTO v_member_count, v_male_count, v_female_count
  FROM public.tonight_team_members AS member
  JOIN quantum_private.tonight_applicant_features AS feature
    ON feature.application_id = member.application_id
  WHERE member.team_id = p_team_id
    AND member.round_id = v_round_id;

  IF v_member_count NOT IN (5, 6) THEN
    RAISE EXCEPTION 'invalid_team_size';
  END IF;
  IF NOT (
    (v_member_count = 5 AND v_male_count = 3 AND v_female_count = 2)
    OR (v_member_count = 6 AND v_male_count = 3 AND v_female_count = 3)
  ) THEN
    RAISE EXCEPTION 'invalid_team_gender_mix';
  END IF;
  IF v_declared_member_count <> v_member_count
    OR v_declared_male_count <> v_male_count
    OR v_declared_female_count <> v_female_count THEN
    RAISE EXCEPTION 'team_count_snapshot_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tonight_team_members AS member
    WHERE member.team_id = p_team_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.tonight_market_memberships AS membership
        WHERE membership.market_code = v_market_code
          AND membership.user_id = member.user_id
          AND membership.revoked_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'tonight_market_membership_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tonight_team_members AS member
    WHERE member.team_id = p_team_id
    GROUP BY member.bundle_id
    HAVING COUNT(*) <> (
      SELECT COUNT(*)
      FROM public.tonight_friend_bundle_members AS bundle_member
      WHERE bundle_member.bundle_id = member.bundle_id
    )
  ) THEN
    RAISE EXCEPTION 'friend_bundle_split';
  END IF;

  IF v_member_count = 6 THEN
    SELECT COUNT(*)::INTEGER
    INTO v_ready_female_trio_bundle_count
    FROM (
      SELECT member.bundle_id
      FROM public.tonight_team_members AS member
      JOIN public.tonight_applications AS application_row
        ON application_row.id = member.application_id
        AND application_row.round_id = member.round_id
      JOIN public.tonight_friend_bundles AS bundle
        ON bundle.id = member.bundle_id
        AND bundle.round_id = member.round_id
      JOIN quantum_private.tonight_applicant_features AS feature
        ON feature.application_id = member.application_id
      WHERE member.team_id = p_team_id
        AND member.round_id = v_round_id
      GROUP BY member.bundle_id
      HAVING COUNT(*) = 3
        AND COUNT(*) FILTER (WHERE feature.gender_code = 'female') = 3
        AND COUNT(*) FILTER (
          WHERE application_row.status = 'allocated'
            AND EXISTS (
              SELECT 1
              FROM public.tonight_friend_bundle_members AS bundle_member
              WHERE bundle_member.bundle_id = member.bundle_id
                AND bundle_member.application_id = application_row.id
            )
            AND (
              bundle.created_by = application_row.user_id
              OR EXISTS (
                SELECT 1
                FROM public.tonight_friend_invites AS invite
                WHERE invite.round_id = v_round_id
                  AND invite.bundle_id = member.bundle_id
                  AND invite.status = 'accepted'
                  AND invite.claimed_by_user_id = application_row.user_id
              )
            )
        ) = 3
    ) AS bundle_member_ready;

    IF v_ready_female_trio_bundle_count <> 1 THEN
      RAISE EXCEPTION 'six_person_team_requires_female_trio_bundle';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tonight_team_members AS member
    WHERE member.team_id = p_team_id
      AND (
        SELECT COUNT(*)
        FROM public.tonight_application_choices AS choice
        WHERE choice.application_id = member.application_id
      ) <> 3
  ) THEN
    RAISE EXCEPTION 'application_choice_count_invalid';
  END IF;

  SELECT pg_catalog.array_agg(member.application_id ORDER BY member.seat_number)
  INTO v_member_application_ids
  FROM public.tonight_team_members AS member
  WHERE member.team_id = p_team_id
    AND member.round_id = v_round_id;

  PERFORM quantum_private.assert_tonight_ranked_activity_selection(
    v_round_id,
    v_member_application_ids,
    v_team_activity_id,
    FALSE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_get_tonight_dashboard(
  p_round_id UUID
)
RETURNS TABLE (
  venue_id UUID,
  venue_name TEXT,
  venue_snapshot_id UUID,
  activity_title TEXT,
  team_capacity SMALLINT,
  reserved_team_count SMALLINT,
  capacity_revision INTEGER,
  team_id UUID,
  team_code TEXT,
  team_status TEXT,
  team_revision INTEGER,
  paid_member_count INTEGER,
  arrived_member_count INTEGER,
  confirmed_attendee_count SMALLINT,
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
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    capacity.venue_id,
    snapshot.display_name,
    capacity.venue_snapshot_id,
    activity.title,
    capacity.team_capacity,
    capacity.reserved_team_count,
    capacity.revision,
    team.id,
    team.team_code,
    team.status,
    team.revision,
    LEAST(
      COALESCE((
        SELECT COUNT(*)::INTEGER
        FROM public.tonight_team_members AS member
        JOIN public.tonight_deposits AS deposit
          ON deposit.application_id = member.application_id
        WHERE member.team_id = team.id
          AND deposit.status IN ('paid', 'held')
      ), 0),
      COALESCE(team.member_count, 0)::INTEGER
    ),
    LEAST(
      COALESCE((
        SELECT COUNT(*)::INTEGER
        FROM public.tonight_attendance AS attendance
        WHERE attendance.team_id = team.id
          AND attendance.status = 'arrived'
      ), 0),
      COALESCE(team.member_count, 0)::INTEGER
    ),
    confirmation.confirmed_attendee_count,
    COALESCE(confirmation.revision, 0)
  FROM public.tonight_venue_capacities AS capacity
  JOIN public.venue_partner_memberships AS membership
    ON membership.venue_id = capacity.venue_id
    AND membership.user_id = v_caller
    AND membership.revoked_at IS NULL
  JOIN public.venue_snapshots AS snapshot
    ON snapshot.id = capacity.venue_snapshot_id
  JOIN public.tonight_round_activities AS activity
    ON activity.id = capacity.activity_id
  LEFT JOIN public.tonight_teams AS team
    ON team.venue_capacity_id = capacity.id
  LEFT JOIN public.tonight_partner_service_confirmations AS confirmation
    ON confirmation.team_id = team.id
  WHERE capacity.round_id = p_round_id
  ORDER BY snapshot.display_name, team.team_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_get_tonight_setup(
  p_round_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_round public.tonight_rounds%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT * INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'round', pg_catalog.jsonb_build_object(
      'id', v_round.id,
      'status', v_round.status,
      'capacity_lock_at', v_round.capacity_lock_at,
      'starts_at', v_round.starts_at
    ),
    'activities', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', activity.id,
          'slot', activity.slot,
          'title', activity.title,
          'kind', activity.activity_kind,
          'duration_minutes', activity.duration_minutes
        ) ORDER BY activity.slot
      )
      FROM public.tonight_round_activities AS activity
      WHERE activity.round_id = p_round_id
        AND EXISTS (
          SELECT 1
          FROM public.venue_partner_memberships AS membership
          JOIN LATERAL (
            SELECT snapshot_row.venue_category
            FROM public.venue_snapshots AS snapshot_row
            WHERE snapshot_row.venue_id = membership.venue_id
            ORDER BY snapshot_row.created_at DESC, snapshot_row.id DESC
            LIMIT 1
          ) AS snapshot ON TRUE
          WHERE membership.user_id = v_caller
            AND membership.revoked_at IS NULL
            AND snapshot.venue_category = ANY(activity.allowed_venue_categories)
        )
    ), '[]'::JSONB),
    'venues', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'venue_id', membership.venue_id,
          'membership_role', membership.role,
          'snapshot', pg_catalog.jsonb_build_object(
            'id', snapshot.id,
            'display_name', snapshot.display_name,
            'category', snapshot.venue_category,
            'area_label', snapshot.area_label,
            'address', snapshot.address,
            'address_evidence', snapshot.address_evidence,
            'address_verified_at', snapshot.address_verified_at,
            'latitude', snapshot.latitude,
            'longitude', snapshot.longitude,
            'coordinate_evidence', snapshot.coordinate_evidence,
            'coordinates_verified_at', snapshot.coordinates_verified_at,
            'naver_url', snapshot.naver_url,
            'kakao_url', snapshot.kakao_url
          ),
          'capacities', COALESCE((
            SELECT pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', COALESCE(capacity.id, activity.id),
                'activity_id', activity.id,
                'team_capacity', COALESCE(capacity.team_capacity, 0),
                'reserved_team_count', COALESCE(capacity.reserved_team_count, 0),
                'max_team_headcount', COALESCE(capacity.max_team_headcount, 5),
                'status', COALESCE(capacity.status, 'open'),
                'revision', COALESCE(capacity.revision, 0)
              ) ORDER BY activity.slot
            )
            FROM public.tonight_round_activities AS activity
            LEFT JOIN public.tonight_venue_capacities AS capacity
              ON capacity.round_id = p_round_id
              AND capacity.activity_id = activity.id
              AND capacity.venue_id = membership.venue_id
              AND capacity.venue_snapshot_id = snapshot.id
            WHERE activity.round_id = p_round_id
              AND snapshot.venue_category = ANY(activity.allowed_venue_categories)
          ), '[]'::JSONB)
        ) ORDER BY membership.venue_id
      )
      FROM public.venue_partner_memberships AS membership
      JOIN LATERAL (
        SELECT snapshot_row.*
        FROM public.venue_snapshots AS snapshot_row
        WHERE snapshot_row.venue_id = membership.venue_id
        ORDER BY snapshot_row.created_at DESC, snapshot_row.id DESC
        LIMIT 1
      ) AS snapshot ON TRUE
      WHERE membership.user_id = v_caller
        AND membership.revoked_at IS NULL
    ), '[]'::JSONB)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_confirm_tonight_service(
  p_team_id UUID,
  p_confirmed_attendee_count SMALLINT,
  p_service_completed_at TIMESTAMPTZ,
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
  v_team public.tonight_teams%ROWTYPE;
  v_round public.tonight_rounds%ROWTYPE;
  v_venue_id UUID;
  v_current_venue_id UUID;
  v_activity_duration_minutes SMALLINT;
  v_observed_arrived_count INTEGER;
  v_confirmation public.tonight_partner_service_confirmations%ROWTYPE;
  v_confirmation_id UUID;
  v_before JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
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
    pg_catalog.hashtextextended('venue-partner-venue:' || v_venue_id::TEXT, 0)
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

  SELECT * INTO v_team
  FROM public.tonight_teams AS team
  WHERE team.id = p_team_id
  FOR UPDATE OF team;
  IF NOT FOUND OR v_team.venue_capacity_id IS NULL THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;
  IF p_confirmed_attendee_count IS NULL
    OR p_confirmed_attendee_count < 0
    OR p_confirmed_attendee_count > v_team.member_count THEN
    RAISE EXCEPTION 'invalid_confirmed_attendee_count';
  END IF;

  SELECT capacity.venue_id
  INTO v_current_venue_id
  FROM public.tonight_venue_capacities AS capacity
  WHERE capacity.id = v_team.venue_capacity_id;
  IF NOT FOUND
    OR v_current_venue_id IS DISTINCT FROM v_venue_id
    OR NOT public.is_venue_partner(v_venue_id, v_caller) THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  SELECT * INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = v_team.round_id;
  SELECT activity.duration_minutes
  INTO v_activity_duration_minutes
  FROM public.tonight_round_activities AS activity
  WHERE activity.id = v_team.activity_id
    AND activity.round_id = v_team.round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_activity_not_found';
  END IF;
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

  SELECT COUNT(*)
  INTO v_observed_arrived_count
  FROM public.tonight_attendance AS attendance
  WHERE attendance.team_id = p_team_id
    AND attendance.status = 'arrived';

  IF p_confirmed_attendee_count <> v_observed_arrived_count THEN
    RAISE EXCEPTION 'attendance_reconciliation_required';
  END IF;

  SELECT *
  INTO v_confirmation
  FROM public.tonight_partner_service_confirmations AS confirmation
  WHERE confirmation.team_id = p_team_id
  FOR UPDATE OF confirmation;

  IF FOUND THEN
    IF v_confirmation.idempotency_key = p_idempotency_key THEN
      IF v_confirmation.confirmed_attendee_count <> p_confirmed_attendee_count
        OR v_confirmation.service_completed_at <> p_service_completed_at
        OR v_confirmation.confirmed_by <> v_caller THEN
        RAISE EXCEPTION 'idempotency_conflict';
      END IF;
      RETURN v_confirmation.id;
    END IF;
    IF v_confirmation.revision <> p_expected_revision THEN
      RAISE EXCEPTION 'stale_revision'
        USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || v_confirmation.revision;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.tonight_settlements AS settlement
      WHERE settlement.team_id = p_team_id
    ) THEN
      RAISE EXCEPTION 'settlement_already_finalized';
    END IF;
    v_before := pg_catalog.to_jsonb(v_confirmation);
    UPDATE public.tonight_partner_service_confirmations AS confirmation
    SET confirmed_attendee_count = p_confirmed_attendee_count,
        observed_arrived_count = v_observed_arrived_count,
        confirmed_by = v_caller,
        revision = confirmation.revision + 1,
        idempotency_key = p_idempotency_key,
        service_completed_at = p_service_completed_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE confirmation.id = v_confirmation.id
      AND confirmation.revision = p_expected_revision
    RETURNING confirmation.id INTO v_confirmation_id;
  ELSE
    IF p_expected_revision <> 0 THEN
      RAISE EXCEPTION 'stale_revision'
        USING DETAIL = 'expected=' || p_expected_revision || ';actual=0';
    END IF;
    INSERT INTO public.tonight_partner_service_confirmations (
      team_id,
      venue_capacity_id,
      venue_id,
      confirmed_attendee_count,
      observed_arrived_count,
      confirmed_by,
      idempotency_key,
      service_completed_at
    ) VALUES (
      p_team_id,
      v_team.venue_capacity_id,
      v_venue_id,
      p_confirmed_attendee_count,
      v_observed_arrived_count,
      v_caller,
      p_idempotency_key,
      p_service_completed_at
    )
    RETURNING id INTO v_confirmation_id;
  END IF;

  UPDATE public.tonight_teams AS team
  SET status = 'completed',
      revision = team.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE team.id = p_team_id;

  UPDATE public.tonight_attendance AS attendance
  SET status = 'no_show',
      revision = attendance.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE attendance.team_id = p_team_id
    AND attendance.status = 'pending';

  UPDATE public.tonight_rounds AS round_row
  SET status = CASE
        WHEN NOT EXISTS (
          SELECT 1
          FROM public.tonight_teams AS active_team
          WHERE active_team.round_id = v_team.round_id
            AND active_team.status NOT IN ('completed', 'cancelled')
        ) THEN 'completed'
        ELSE 'accepted'
      END,
      revision = round_row.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE round_row.id = v_team.round_id;

  PERFORM quantum_private.write_tonight_audit(
    'service_confirmation',
    v_confirmation_id,
    'partner_headcount_confirmed',
    v_before,
    pg_catalog.jsonb_build_object(
      'confirmed_attendee_count', p_confirmed_attendee_count,
      'observed_arrived_count', v_observed_arrived_count
    ),
    p_idempotency_key
  );
  RETURN v_confirmation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_swap_tonight_friend_bundles(
  p_team_a_id UUID,
  p_bundle_a_id UUID,
  p_expected_team_a_revision INTEGER,
  p_team_b_id UUID,
  p_bundle_b_id UUID,
  p_expected_team_b_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_team_a public.tonight_teams%ROWTYPE;
  v_team_b public.tonight_teams%ROWTYPE;
  v_round public.tonight_rounds%ROWTYPE;
  v_bundle_a_apps UUID[];
  v_bundle_b_apps UUID[];
  v_team_a_remaining UUID[];
  v_team_b_remaining UUID[];
  v_team_a_final UUID[];
  v_team_b_final UUID[];
  v_application_id UUID;
  v_seat INTEGER;
  v_male_count INTEGER;
  v_female_count INTEGER;
  v_audit_a quantum_private.tonight_audit_events%ROWTYPE;
  v_audit_b quantum_private.tonight_audit_events%ROWTYPE;
  v_has_audit_a BOOLEAN;
  v_has_audit_b BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_expected_team_a_revision IS NULL
    OR p_expected_team_b_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_team_a_id = p_team_b_id OR p_bundle_a_id = p_bundle_b_id THEN
    RAISE EXCEPTION 'swap_requires_distinct_teams_and_bundles';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-friend-bundle-swap-key:' || p_idempotency_key,
      0
    )
  );

  PERFORM team.id
  FROM public.tonight_teams AS team
  WHERE team.id IN (p_team_a_id, p_team_b_id)
  ORDER BY team.id
  FOR UPDATE;

  SELECT audit.* INTO v_audit_a
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'team'
    AND audit.idempotency_key = p_idempotency_key || ':team-a';
  v_has_audit_a := FOUND;
  SELECT audit.* INTO v_audit_b
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'team'
    AND audit.idempotency_key = p_idempotency_key || ':team-b';
  v_has_audit_b := FOUND;

  IF v_has_audit_a OR v_has_audit_b THEN
    IF NOT v_has_audit_a
      OR NOT v_has_audit_b
      OR v_audit_a.entity_id <> p_team_a_id
      OR v_audit_b.entity_id <> p_team_b_id
      OR v_audit_a.actor_user_id IS DISTINCT FROM v_caller
      OR v_audit_b.actor_user_id IS DISTINCT FROM v_caller
      OR v_audit_a.action <> 'friend_bundle_swap'
      OR v_audit_b.action <> 'friend_bundle_swap'
      OR v_audit_a.before_state IS DISTINCT FROM pg_catalog.jsonb_build_object(
        'bundle_id', p_bundle_a_id, 'revision', p_expected_team_a_revision
      )
      OR v_audit_a.after_state IS DISTINCT FROM pg_catalog.jsonb_build_object(
        'bundle_id', p_bundle_b_id, 'revision', p_expected_team_a_revision + 1
      )
      OR v_audit_b.before_state IS DISTINCT FROM pg_catalog.jsonb_build_object(
        'bundle_id', p_bundle_b_id, 'revision', p_expected_team_b_revision
      )
      OR v_audit_b.after_state IS DISTINCT FROM pg_catalog.jsonb_build_object(
        'bundle_id', p_bundle_a_id, 'revision', p_expected_team_b_revision + 1
      ) THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN TRUE;
  END IF;

  SELECT * INTO v_team_a
  FROM public.tonight_teams AS team
  WHERE team.id = p_team_a_id;
  SELECT * INTO v_team_b
  FROM public.tonight_teams AS team
  WHERE team.id = p_team_b_id;
  IF v_team_a.id IS NULL OR v_team_b.id IS NULL
    OR v_team_a.round_id <> v_team_b.round_id THEN
    RAISE EXCEPTION 'swap_teams_not_found';
  END IF;
  IF v_team_a.status <> 'deposit_pending' OR v_team_b.status <> 'deposit_pending' THEN
    RAISE EXCEPTION 'team_locked_for_swap';
  END IF;
  IF v_team_a.revision <> p_expected_team_a_revision
    OR v_team_b.revision <> p_expected_team_b_revision THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  SELECT * INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = v_team_a.round_id;
  IF CURRENT_TIMESTAMP >= v_round.deposit_due_at
    OR EXISTS (
      SELECT 1
      FROM public.tonight_team_members AS member
      JOIN public.tonight_deposits AS deposit
        ON deposit.application_id = member.application_id
      WHERE member.team_id IN (p_team_a_id, p_team_b_id)
    ) THEN
    RAISE EXCEPTION 'team_locked_for_swap';
  END IF;

  SELECT pg_catalog.array_agg(member.application_id ORDER BY member.seat_number)
  INTO v_bundle_a_apps
  FROM public.tonight_team_members AS member
  WHERE member.bundle_id = p_bundle_a_id
    AND member.team_id = p_team_a_id;
  SELECT pg_catalog.array_agg(member.application_id ORDER BY member.seat_number)
  INTO v_bundle_b_apps
  FROM public.tonight_team_members AS member
  WHERE member.bundle_id = p_bundle_b_id
    AND member.team_id = p_team_b_id;

  IF pg_catalog.cardinality(v_bundle_a_apps) IS NULL
    OR pg_catalog.cardinality(v_bundle_b_apps) IS NULL
    OR pg_catalog.cardinality(v_bundle_a_apps) <> pg_catalog.cardinality(v_bundle_b_apps) THEN
    RAISE EXCEPTION 'bundle_swap_size_mismatch';
  END IF;
  IF (
    SELECT COUNT(*)
    FROM public.tonight_friend_bundle_members AS member
    WHERE member.bundle_id = p_bundle_a_id
  ) <> pg_catalog.cardinality(v_bundle_a_apps)
    OR (
      SELECT COUNT(*)
      FROM public.tonight_friend_bundle_members AS member
      WHERE member.bundle_id = p_bundle_b_id
    ) <> pg_catalog.cardinality(v_bundle_b_apps) THEN
    RAISE EXCEPTION 'friend_bundle_split';
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(member.application_id ORDER BY member.seat_number),
    ARRAY[]::UUID[]
  )
  INTO v_team_a_remaining
  FROM public.tonight_team_members AS member
  WHERE member.team_id = p_team_a_id
    AND member.bundle_id <> p_bundle_a_id;
  SELECT COALESCE(
    pg_catalog.array_agg(member.application_id ORDER BY member.seat_number),
    ARRAY[]::UUID[]
  )
  INTO v_team_b_remaining
  FROM public.tonight_team_members AS member
  WHERE member.team_id = p_team_b_id
    AND member.bundle_id <> p_bundle_b_id;

  v_team_a_final := v_team_a_remaining || v_bundle_b_apps;
  v_team_b_final := v_team_b_remaining || v_bundle_a_apps;
  IF pg_catalog.cardinality(v_team_a_final) <> v_team_a.member_count
    OR pg_catalog.cardinality(v_team_b_final) <> v_team_b.member_count THEN
    RAISE EXCEPTION 'invalid_team_size';
  END IF;

  DELETE FROM public.tonight_team_members AS member
  WHERE member.team_id IN (p_team_a_id, p_team_b_id);

  v_seat := 0;
  FOREACH v_application_id IN ARRAY v_team_a_final LOOP
    v_seat := v_seat + 1;
    INSERT INTO public.tonight_team_members (
      team_id, round_id, application_id, user_id, bundle_id, seat_number
    )
    SELECT
      p_team_a_id, application_row.round_id, application_row.id,
      application_row.user_id, application_row.bundle_id, v_seat
    FROM public.tonight_applications AS application_row
    WHERE application_row.id = v_application_id;
  END LOOP;

  v_seat := 0;
  FOREACH v_application_id IN ARRAY v_team_b_final LOOP
    v_seat := v_seat + 1;
    INSERT INTO public.tonight_team_members (
      team_id, round_id, application_id, user_id, bundle_id, seat_number
    )
    SELECT
      p_team_b_id, application_row.round_id, application_row.id,
      application_row.user_id, application_row.bundle_id, v_seat
    FROM public.tonight_applications AS application_row
    WHERE application_row.id = v_application_id;
  END LOOP;

  SELECT
    COUNT(*) FILTER (WHERE feature.gender_code = 'male')::INTEGER,
    COUNT(*) FILTER (WHERE feature.gender_code = 'female')::INTEGER
  INTO v_male_count, v_female_count
  FROM public.tonight_team_members AS member
  JOIN quantum_private.tonight_applicant_features AS feature
    ON feature.application_id = member.application_id
  WHERE member.team_id = p_team_a_id;
  UPDATE public.tonight_teams AS team
  SET male_count = v_male_count,
      female_count = v_female_count,
      revision = team.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE team.id = p_team_a_id
    AND team.revision = p_expected_team_a_revision;

  SELECT
    COUNT(*) FILTER (WHERE feature.gender_code = 'male')::INTEGER,
    COUNT(*) FILTER (WHERE feature.gender_code = 'female')::INTEGER
  INTO v_male_count, v_female_count
  FROM public.tonight_team_members AS member
  JOIN quantum_private.tonight_applicant_features AS feature
    ON feature.application_id = member.application_id
  WHERE member.team_id = p_team_b_id;
  UPDATE public.tonight_teams AS team
  SET male_count = v_male_count,
      female_count = v_female_count,
      revision = team.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE team.id = p_team_b_id
    AND team.revision = p_expected_team_b_revision;

  PERFORM quantum_private.assert_tonight_team_integrity(p_team_a_id);
  PERFORM quantum_private.assert_tonight_team_integrity(p_team_b_id);

  PERFORM quantum_private.write_tonight_audit(
    'team', p_team_a_id, 'friend_bundle_swap',
    pg_catalog.jsonb_build_object('bundle_id', p_bundle_a_id, 'revision', v_team_a.revision),
    pg_catalog.jsonb_build_object('bundle_id', p_bundle_b_id, 'revision', v_team_a.revision + 1),
    p_idempotency_key || ':team-a'
  );
  PERFORM quantum_private.write_tonight_audit(
    'team', p_team_b_id, 'friend_bundle_swap',
    pg_catalog.jsonb_build_object('bundle_id', p_bundle_b_id, 'revision', v_team_b.revision),
    pg_catalog.jsonb_build_object('bundle_id', p_bundle_a_id, 'revision', v_team_b.revision + 1),
    p_idempotency_key || ':team-b'
  );
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_accept_tonight_team(
  p_team_id UUID,
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
  v_team public.tonight_teams%ROWTYPE;
  v_round public.tonight_rounds%ROWTYPE;
  v_capacity public.tonight_venue_capacities%ROWTYPE;
  v_venue_id UUID;
  v_snapshot public.venue_snapshots%ROWTYPE;
  v_acceptance public.tonight_partner_acceptances%ROWTYPE;
  v_acceptance_id UUID;
  v_member_count INTEGER;
  v_paid_count INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
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
    pg_catalog.hashtextextended('venue-partner-venue:' || v_venue_id::TEXT, 0)
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

  SELECT *
  INTO v_team
  FROM public.tonight_teams AS team
  WHERE team.id = p_team_id
  FOR UPDATE OF team;
  IF NOT FOUND OR v_team.venue_capacity_id IS NULL THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  SELECT *
  INTO v_capacity
  FROM public.tonight_venue_capacities AS capacity
  WHERE capacity.id = v_team.venue_capacity_id
  FOR UPDATE OF capacity;
  IF NOT FOUND
    OR v_capacity.venue_id IS DISTINCT FROM v_venue_id
    OR NOT public.is_venue_partner(v_venue_id, v_caller) THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  SELECT *
  INTO v_acceptance
  FROM public.tonight_partner_acceptances AS acceptance
  WHERE acceptance.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_acceptance.team_id <> p_team_id
      OR v_acceptance.accepted_by <> v_caller THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_acceptance.id;
  END IF;

  IF v_team.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision'
      USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || v_team.revision;
  END IF;

  SELECT *
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = v_team.round_id;
  IF CURRENT_TIMESTAMP >= v_round.partner_acceptance_due_at THEN
    RAISE EXCEPTION 'partner_acceptance_closed';
  END IF;
  IF v_team.status <> 'partner_pending' THEN
    RAISE EXCEPTION 'team_not_ready_for_partner_acceptance';
  END IF;

  SELECT *
  INTO v_snapshot
  FROM public.venue_snapshots AS snapshot
  WHERE snapshot.id = v_capacity.venue_snapshot_id
    AND snapshot.venue_id = v_venue_id;
  IF NOT FOUND OR v_snapshot.address IS NULL
    OR pg_catalog.btrim(v_snapshot.address) = ''
    OR v_snapshot.address_verified_at IS NULL
    OR v_snapshot.address_evidence NOT IN (
      'search-verified', 'provider-verified', 'operator-verified'
    )
    OR v_snapshot.latitude IS NULL
    OR v_snapshot.longitude IS NULL
    OR v_snapshot.coordinates_verified_at IS NULL
    OR v_snapshot.coordinate_evidence NOT IN (
      'geocoded-address', 'provider-verified', 'operator-verified'
    )
    OR v_snapshot.naver_url IS NULL
    OR v_snapshot.kakao_url IS NULL THEN
    RAISE EXCEPTION 'exact_venue_not_ready';
  END IF;

  PERFORM quantum_private.assert_tonight_team_integrity(p_team_id);

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE deposit.status IN ('paid', 'held'))::INTEGER
  INTO v_member_count, v_paid_count
  FROM public.tonight_team_members AS member
  LEFT JOIN public.tonight_deposits AS deposit
    ON deposit.application_id = member.application_id
  WHERE member.team_id = p_team_id;
  IF v_member_count <> v_team.member_count
    OR v_paid_count <> v_team.member_count THEN
    RAISE EXCEPTION 'deposit_gate_not_satisfied';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tonight_partner_acceptances AS acceptance
    WHERE acceptance.team_id = p_team_id
  ) THEN
    RAISE EXCEPTION 'team_already_accepted';
  END IF;

  INSERT INTO public.tonight_partner_acceptances (
    team_id,
    venue_capacity_id,
    venue_snapshot_id,
    accepted_by,
    accepted_headcount,
    accepted_team_revision,
    idempotency_key
  ) VALUES (
    p_team_id,
    v_capacity.id,
    v_capacity.venue_snapshot_id,
    v_caller,
    v_team.member_count,
    v_team.revision,
    p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_acceptance_id;

  IF v_acceptance_id IS NULL THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;

  UPDATE public.tonight_teams AS team
  SET status = 'accepted',
      revision = team.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE team.id = p_team_id
    AND team.revision = p_expected_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  INSERT INTO public.tonight_attendance (team_id, application_id, user_id)
  SELECT member.team_id, member.application_id, member.user_id
  FROM public.tonight_team_members AS member
  WHERE member.team_id = p_team_id
  ON CONFLICT (application_id) DO NOTHING;

  UPDATE public.tonight_rounds AS round_row
  SET status = CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.tonight_teams AS pending_team
          WHERE pending_team.round_id = v_team.round_id
            AND pending_team.status IN ('deposit_pending', 'partner_pending')
        ) THEN 'partner_confirmation'
        ELSE 'accepted'
      END,
      revision = round_row.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE round_row.id = v_team.round_id;

  PERFORM quantum_private.write_tonight_audit(
    'team',
    p_team_id,
    'partner_accepted',
    pg_catalog.to_jsonb(v_team),
    pg_catalog.jsonb_build_object(
      'status', 'accepted',
      'venue_snapshot_id', v_capacity.venue_snapshot_id,
      'accepted_headcount', v_team.member_count
    ),
    p_idempotency_key
  );
  RETURN v_acceptance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_expire_tonight_deposit_gate(
  p_round_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  round_row public.tonight_rounds%ROWTYPE;
  team_row public.tonight_teams%ROWTYPE;
  deposit_row public.tonight_deposits%ROWTYPE;
  audit_row quantum_private.tonight_audit_events%ROWTYPE;
  v_paid_count INTEGER;
  v_cancelled_team_count INTEGER := 0;
  v_queued_refund_count INTEGER := 0;
  v_recovered_waitlist_count INTEGER := 0;
  v_refund_id UUID;
  v_result JSONB;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tonight-round-transition:' || p_round_id::TEXT, 0)
  );

  SELECT audit.*
  INTO audit_row
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'round'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF audit_row.entity_id <> p_round_id
      OR audit_row.action <> 'deposit_gate_expired' THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN audit_row.after_state;
  END IF;

  SELECT round_value.*
  INTO round_row
  FROM public.tonight_rounds AS round_value
  WHERE round_value.id = p_round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;
  IF CURRENT_TIMESTAMP < round_row.deposit_due_at THEN
    RAISE EXCEPTION 'deposit_gate_not_due';
  END IF;
  IF round_row.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'round_not_expirable';
  END IF;

  IF round_row.status = 'open' THEN
    UPDATE public.tonight_applications AS application_row
    SET status = 'waitlisted',
        revision = application_row.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE application_row.round_id = p_round_id
      AND application_row.status = 'submitted';
    GET DIAGNOSTICS v_recovered_waitlist_count = ROW_COUNT;

    UPDATE public.tonight_friend_bundles AS bundle
    SET status = 'locked',
        revision = bundle.revision + 1
    WHERE bundle.round_id = p_round_id
      AND bundle.status = 'forming';

    UPDATE public.tonight_rounds AS round_value
    SET status = 'completed',
        revision = round_value.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE round_value.id = p_round_id
      AND round_value.status = 'open';

    v_result := pg_catalog.jsonb_build_object(
      'cancelled_team_count', 0,
      'queued_refund_count', 0,
      'allocation_recovered', TRUE,
      'waitlisted_application_count', v_recovered_waitlist_count
    );
    PERFORM quantum_private.write_tonight_audit(
      'round', p_round_id, 'deposit_gate_expired',
      pg_catalog.to_jsonb(round_row), v_result, p_idempotency_key
    );
    RETURN v_result;
  END IF;

  FOR team_row IN
    SELECT team.*
    FROM public.tonight_teams AS team
    WHERE team.round_id = p_round_id
      AND team.status = 'deposit_pending'
    ORDER BY team.team_number
  LOOP
    PERFORM team.id
    FROM public.tonight_teams AS team
    WHERE team.id = team_row.id
    FOR UPDATE;

    SELECT COUNT(*)
    INTO v_paid_count
    FROM public.tonight_team_members AS member
    JOIN public.tonight_deposits AS deposit
      ON deposit.application_id = member.application_id
    WHERE member.team_id = team_row.id
      AND deposit.status IN ('paid', 'held');

    IF v_paid_count = team_row.member_count THEN
      UPDATE public.tonight_teams AS team
      SET status = 'partner_pending',
          revision = team.revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE team.id = team_row.id;
      CONTINUE;
    END IF;

    FOR deposit_row IN
      SELECT deposit.*
      FROM public.tonight_team_members AS member
      JOIN public.tonight_deposits AS deposit
        ON deposit.application_id = member.application_id
      WHERE member.team_id = team_row.id
      FOR UPDATE OF deposit
    LOOP
      IF deposit_row.status IN ('paid', 'held', 'reconciliation_required') THEN
        UPDATE public.tonight_deposits AS deposit
        SET status = 'refund_requested',
            revision = deposit.revision + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE deposit.id = deposit_row.id;

        v_refund_id := NULL;
        INSERT INTO public.tonight_deposit_refund_requests (
          deposit_id, requested_by, idempotency_key
        ) VALUES (
          deposit_row.id,
          deposit_row.user_id,
          p_idempotency_key || ':refund:' || deposit_row.id::TEXT
        )
        ON CONFLICT (deposit_id) DO NOTHING
        RETURNING id INTO v_refund_id;
        IF v_refund_id IS NOT NULL THEN
          v_queued_refund_count := v_queued_refund_count + 1;
        END IF;
      ELSIF deposit_row.status = 'pending' THEN
        UPDATE public.tonight_deposits AS deposit
        SET status = 'cancelled',
            revision = deposit.revision + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE deposit.id = deposit_row.id;
      END IF;
    END LOOP;

    UPDATE public.tonight_team_members AS member
    SET member_status = 'cancelled'
    WHERE member.team_id = team_row.id;

    UPDATE public.tonight_applications AS application_row
    SET status = 'cancelled',
        revision = application_row.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE application_row.id IN (
      SELECT member.application_id
      FROM public.tonight_team_members AS member
      WHERE member.team_id = team_row.id
    );

    UPDATE public.tonight_venue_capacities AS capacity
    SET reserved_team_count = GREATEST(capacity.reserved_team_count - 1, 0),
        revision = capacity.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE capacity.id = team_row.venue_capacity_id;

    UPDATE public.tonight_teams AS team
    SET status = 'cancelled',
        revision = team.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE team.id = team_row.id;

    v_cancelled_team_count := v_cancelled_team_count + 1;
    PERFORM quantum_private.write_tonight_audit(
      'team',
      team_row.id,
      'underfunded_team_cancelled',
      pg_catalog.to_jsonb(team_row),
      pg_catalog.jsonb_build_object('status', 'cancelled', 'paid_count', v_paid_count),
      p_idempotency_key || ':team:' || team_row.id::TEXT
    );
  END LOOP;

  UPDATE public.tonight_rounds AS round_value
  SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.tonight_teams AS team
          WHERE team.round_id = p_round_id AND team.status = 'partner_pending'
        ) THEN 'partner_confirmation'
        WHEN EXISTS (
          SELECT 1 FROM public.tonight_teams AS team
          WHERE team.round_id = p_round_id
            AND team.status IN ('accepted', 'revealed', 'in_progress')
        ) THEN 'accepted'
        ELSE 'completed'
      END,
      revision = round_value.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE round_value.id = p_round_id;

  v_result := pg_catalog.jsonb_build_object(
    'cancelled_team_count', v_cancelled_team_count,
    'queued_refund_count', v_queued_refund_count
  );
  PERFORM quantum_private.write_tonight_audit(
    'round', p_round_id, 'deposit_gate_expired',
    pg_catalog.to_jsonb(round_row), v_result, p_idempotency_key
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_record_tonight_deposit_result(
  p_application_id UUID,
  p_user_id UUID,
  p_status TEXT,
  p_provider_order_id TEXT,
  p_provider_payment_key_hash TEXT,
  p_amount INTEGER,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  application_row public.tonight_applications%ROWTYPE;
  v_round public.tonight_rounds%ROWTYPE;
  v_deposit public.tonight_deposits%ROWTYPE;
  v_before public.tonight_deposits%ROWTYPE;
  v_team public.tonight_teams%ROWTYPE;
  v_event quantum_private.tonight_deposit_result_events%ROWTYPE;
  v_event_id BIGINT;
  v_deposit_id UUID;
  v_team_id UUID;
  v_paid_count INTEGER;
  v_queue_refund BOOLEAN := FALSE;
  v_refund_id UUID;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_status NOT IN ('paid', 'held', 'reconciliation_required', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_deposit_result';
  END IF;
  IF p_amount <> public.tonight_deposit_amount() THEN
    RAISE EXCEPTION 'invalid_deposit_amount';
  END IF;
  IF p_provider_order_id IS NULL OR pg_catalog.btrim(p_provider_order_id) = '' THEN
    RAISE EXCEPTION 'provider_reference_required';
  END IF;
  IF p_status IN ('paid', 'held', 'reconciliation_required')
    AND (
      p_provider_payment_key_hash IS NULL
      OR pg_catalog.btrim(p_provider_payment_key_hash) = ''
    ) THEN
    RAISE EXCEPTION 'provider_reference_required';
  END IF;

  SELECT event.*
  INTO v_event
  FROM quantum_private.tonight_deposit_result_events AS event
  WHERE event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_event.application_id <> p_application_id
      OR v_event.user_id <> p_user_id
      OR v_event.amount <> p_amount
      OR v_event.result_status <> p_status
      OR COALESCE(v_event.provider_order_id, '') <> COALESCE(p_provider_order_id, '')
      OR COALESCE(v_event.provider_payment_key_hash, '')
        <> COALESCE(p_provider_payment_key_hash, '') THEN
      RAISE EXCEPTION 'deposit_result_conflict';
    END IF;
    RETURN v_event.deposit_id;
  END IF;

  SELECT application_value.*
  INTO application_row
  FROM public.tonight_applications AS application_value
  WHERE application_value.id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_application_not_found';
  END IF;
  IF application_row.user_id <> p_user_id THEN
    RAISE EXCEPTION 'deposit_owner_mismatch';
  END IF;

  SELECT team.*
  INTO v_team
  FROM public.tonight_team_members AS member
  JOIN public.tonight_teams AS team ON team.id = member.team_id
  WHERE member.application_id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit_application_not_allocated';
  END IF;
  v_team_id := v_team.id;

  SELECT team.*
  INTO v_team
  FROM public.tonight_teams AS team
  WHERE team.id = v_team_id
  FOR UPDATE OF team;

  SELECT application_value.*
  INTO application_row
  FROM public.tonight_applications AS application_value
  WHERE application_value.id = p_application_id
  FOR UPDATE OF application_value;
  IF NOT FOUND OR application_row.user_id <> p_user_id
    OR NOT EXISTS (
      SELECT 1
      FROM public.tonight_team_members AS member
      WHERE member.team_id = v_team_id
        AND member.application_id = p_application_id
    ) THEN
    RAISE EXCEPTION 'deposit_application_not_allocated';
  END IF;

  SELECT *
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = application_row.round_id;

  SELECT deposit.*
  INTO v_deposit
  FROM public.tonight_deposits AS deposit
  WHERE deposit.application_id = p_application_id
  FOR UPDATE OF deposit;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit_not_prepared';
  END IF;
  IF v_deposit.user_id <> p_user_id OR v_deposit.amount <> p_amount
    OR COALESCE(v_deposit.provider_order_id, '')
      <> COALESCE(pg_catalog.btrim(p_provider_order_id), '')
    OR (
      v_deposit.provider_payment_key_hash IS NOT NULL
      AND COALESCE(v_deposit.provider_payment_key_hash, '')
        <> COALESCE(p_provider_payment_key_hash, '')
    ) THEN
    RAISE EXCEPTION 'deposit_result_conflict';
  END IF;
  v_deposit_id := v_deposit.id;
  v_before := v_deposit;

  IF v_deposit.status IN ('pending', 'reconciliation_required')
    AND p_status IN ('paid', 'held')
    AND v_team.status <> 'cancelled'
    AND application_row.status <> 'allocated' THEN
    RAISE EXCEPTION 'deposit_application_not_allocated';
  END IF;
  IF v_deposit.status IN ('pending', 'reconciliation_required')
    AND p_status IN ('paid', 'held')
    AND v_team.status <> 'cancelled'
    AND v_team.status <> 'deposit_pending' THEN
    RAISE EXCEPTION 'deposit_team_not_payable';
  END IF;
  IF v_deposit.status IN ('pending', 'reconciliation_required')
    AND p_status IN ('paid', 'held')
    AND v_team.status <> 'cancelled'
    AND CURRENT_TIMESTAMP >= v_round.deposit_due_at THEN
    RAISE EXCEPTION 'deposit_time_gate_closed';
  END IF;

  IF v_deposit.status = 'pending' THEN
    UPDATE public.tonight_deposits AS deposit
    SET status = p_status,
        provider_payment_key_hash = p_provider_payment_key_hash,
        revision = deposit.revision + 1,
        paid_at = CASE WHEN p_status IN ('paid', 'held') THEN CURRENT_TIMESTAMP ELSE NULL END,
        held_at = CASE WHEN p_status = 'held' THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
    WHERE deposit.id = v_deposit.id
    RETURNING * INTO v_deposit;
  ELSIF v_deposit.status = 'reconciliation_required'
    AND p_status IN ('paid', 'held') THEN
    UPDATE public.tonight_deposits AS deposit
    SET status = CASE WHEN v_team.status = 'cancelled' THEN 'refund_requested' ELSE p_status END,
        revision = deposit.revision + 1,
        paid_at = CURRENT_TIMESTAMP,
        held_at = CASE WHEN p_status = 'held' THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
    WHERE deposit.id = v_deposit.id
    RETURNING * INTO v_deposit;
    v_queue_refund := v_team.status = 'cancelled';
  ELSIF v_deposit.status IN ('paid', 'held')
    AND p_status IN (v_deposit.status, 'reconciliation_required') THEN
    NULL;
  ELSIF v_deposit.status IN ('cancelled', 'refund_requested')
    AND p_status IN ('paid', 'held', 'reconciliation_required') THEN
    IF p_status IN ('paid', 'held') THEN
      UPDATE public.tonight_deposits AS deposit
      SET status = 'refund_requested',
          provider_payment_key_hash = p_provider_payment_key_hash,
          revision = deposit.revision + 1,
          paid_at = CURRENT_TIMESTAMP,
          held_at = CASE WHEN p_status = 'held' THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE deposit.id = v_deposit.id
      RETURNING * INTO v_deposit;
      v_queue_refund := TRUE;
    ELSIF v_deposit.status = 'cancelled' THEN
      UPDATE public.tonight_deposits AS deposit
      SET status = 'reconciliation_required',
          provider_payment_key_hash = p_provider_payment_key_hash,
          revision = deposit.revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE deposit.id = v_deposit.id
      RETURNING * INTO v_deposit;
    END IF;
  ELSIF v_deposit.status = p_status THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'deposit_result_conflict';
  END IF;

  INSERT INTO quantum_private.tonight_deposit_result_events (
    deposit_id, application_id, user_id, result_status, provider_order_id,
    provider_payment_key_hash, amount, idempotency_key
  ) VALUES (
    v_deposit_id, p_application_id, p_user_id, p_status,
    pg_catalog.btrim(p_provider_order_id), p_provider_payment_key_hash,
    p_amount, p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;
  IF v_event_id IS NULL THEN
    SELECT event.*
    INTO v_event
    FROM quantum_private.tonight_deposit_result_events AS event
    WHERE event.idempotency_key = p_idempotency_key;
    IF NOT FOUND OR v_event.deposit_id <> v_deposit_id
      OR v_event.application_id <> p_application_id
      OR v_event.user_id <> p_user_id
      OR v_event.amount <> p_amount
      OR v_event.result_status <> p_status
      OR COALESCE(v_event.provider_order_id, '') <> COALESCE(p_provider_order_id, '')
      OR COALESCE(v_event.provider_payment_key_hash, '')
        <> COALESCE(p_provider_payment_key_hash, '') THEN
      RAISE EXCEPTION 'deposit_result_conflict';
    END IF;
  END IF;

  IF v_queue_refund THEN
    INSERT INTO public.tonight_deposit_refund_requests (
      deposit_id, requested_by, idempotency_key
    ) VALUES (
      v_deposit_id, p_user_id, p_idempotency_key || ':late-charge-refund'
    )
    ON CONFLICT (deposit_id) DO NOTHING
    RETURNING id INTO v_refund_id;
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'deposit',
    v_deposit_id,
    'provider_result_recorded',
    pg_catalog.to_jsonb(v_before),
    pg_catalog.jsonb_build_object(
      'application_id', p_application_id,
      'provider_result', p_status,
      'effective_status', v_deposit.status,
      'amount', p_amount
    ),
    p_idempotency_key
  );

  IF v_team_id IS NOT NULL AND v_deposit.status IN ('paid', 'held') THEN
    SELECT COUNT(*)
    INTO v_paid_count
    FROM public.tonight_team_members AS member
    JOIN public.tonight_deposits AS deposit
      ON deposit.application_id = member.application_id
    WHERE member.team_id = v_team_id
      AND deposit.status IN ('paid', 'held');

    IF v_paid_count = v_team.member_count THEN
      UPDATE public.tonight_teams AS team
      SET status = 'partner_pending',
          revision = team.revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE team.id = v_team_id
        AND team.status = 'deposit_pending';

      IF FOUND THEN
        PERFORM quantum_private.write_tonight_audit(
          'team',
          v_team_id,
          'deposit_gate_satisfied',
          pg_catalog.jsonb_build_object('status', 'deposit_pending'),
          pg_catalog.jsonb_build_object(
            'status', 'partner_pending',
            'paid_count', v_paid_count
          ),
          p_idempotency_key || ':team-ready'
        );
      END IF;
    END IF;
  END IF;
  RETURN v_deposit_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'deposit_result_conflict';
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_set_tonight_capacity_profile(
  p_round_id UUID,
  p_activity_id UUID,
  p_venue_snapshot_id UUID,
  p_team_capacity INTEGER,
  p_max_team_headcount SMALLINT,
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
  v_round public.tonight_rounds%ROWTYPE;
  v_venue_id UUID;
  v_venue_category TEXT;
  v_allowed_venue_categories TEXT[];
  v_capacity public.tonight_venue_capacities%ROWTYPE;
  audit_row quantum_private.tonight_audit_events%ROWTYPE;
  v_before JSONB;
  v_capacity_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_team_capacity IS NULL OR p_team_capacity < 0 OR p_team_capacity > 100 THEN
    RAISE EXCEPTION 'invalid_capacity';
  END IF;
  IF p_max_team_headcount IS NULL OR p_max_team_headcount NOT IN (5, 6) THEN
    RAISE EXCEPTION 'invalid_max_team_headcount';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  SELECT snapshot.venue_id, snapshot.venue_category
  INTO v_venue_id, v_venue_category
  FROM public.venue_snapshots AS snapshot
  WHERE snapshot.id = p_venue_snapshot_id
    AND snapshot.id = (
      SELECT latest_snapshot.id
      FROM public.venue_snapshots AS latest_snapshot
      WHERE latest_snapshot.venue_id = snapshot.venue_id
      ORDER BY latest_snapshot.created_at DESC, latest_snapshot.id DESC
      LIMIT 1
    );
  IF NOT FOUND OR NOT public.is_venue_partner(v_venue_id, v_caller) THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  SELECT *
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id
  FOR UPDATE OF round_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('venue-partner-venue:' || v_venue_id::TEXT, 0)
  );
  PERFORM active_partner.id
  FROM public.venue_partner_memberships AS active_partner
  WHERE active_partner.venue_id = v_venue_id
    AND active_partner.user_id = v_caller
    AND active_partner.revoked_at IS NULL
  FOR SHARE OF active_partner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  SELECT activity.allowed_venue_categories
  INTO v_allowed_venue_categories
  FROM public.tonight_round_activities AS activity
  WHERE activity.round_id = p_round_id
    AND activity.id = p_activity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activity_not_in_round';
  END IF;
  IF pg_catalog.cardinality(v_allowed_venue_categories) = 0
    OR NOT (v_venue_category = ANY(v_allowed_venue_categories)) THEN
    RAISE EXCEPTION 'venue_activity_category_incompatible';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-capacity-set-key:' || p_idempotency_key,
      0
    )
  );

  SELECT audit.* INTO audit_row
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'venue_capacity'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF audit_row.actor_user_id IS DISTINCT FROM v_caller
      OR audit_row.action <> 'capacity_set'
      OR audit_row.after_state ->> 'round_id' IS DISTINCT FROM p_round_id::TEXT
      OR audit_row.after_state ->> 'activity_id' IS DISTINCT FROM p_activity_id::TEXT
      OR audit_row.after_state ->> 'venue_snapshot_id' IS DISTINCT FROM p_venue_snapshot_id::TEXT
      OR audit_row.after_state ->> 'venue_id' IS DISTINCT FROM v_venue_id::TEXT
      OR (audit_row.after_state ->> 'team_capacity')::INTEGER IS DISTINCT FROM p_team_capacity
      OR (
        audit_row.after_state ? 'max_team_headcount'
        AND (audit_row.after_state ->> 'max_team_headcount')::SMALLINT
          IS DISTINCT FROM p_max_team_headcount
      )
      OR (
        NOT (audit_row.after_state ? 'max_team_headcount')
        AND p_max_team_headcount IS DISTINCT FROM 5::SMALLINT
      )
      OR audit_row.after_state ->> 'venue_category' IS DISTINCT FROM v_venue_category
      OR (audit_row.after_state ->> 'expected_revision')::INTEGER IS DISTINCT FROM p_expected_revision THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN audit_row.entity_id;
  END IF;

  IF v_round.status <> 'open' THEN
    RAISE EXCEPTION 'round_not_accepting_capacity';
  END IF;
  IF v_round.capacity_lock_at <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'capacity_locked';
  END IF;
  SELECT *
  INTO v_capacity
  FROM public.tonight_venue_capacities AS capacity
  WHERE capacity.round_id = p_round_id
    AND capacity.activity_id = p_activity_id
    AND capacity.venue_snapshot_id = p_venue_snapshot_id
  FOR UPDATE OF capacity;

  IF FOUND THEN
    IF v_capacity.revision <> p_expected_revision THEN
      RAISE EXCEPTION 'stale_revision'
        USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || v_capacity.revision;
    END IF;
    IF p_team_capacity < v_capacity.reserved_team_count THEN
      RAISE EXCEPTION 'capacity_below_reserved';
    END IF;
    v_before := pg_catalog.to_jsonb(v_capacity);
    UPDATE public.tonight_venue_capacities AS capacity
    SET team_capacity = p_team_capacity,
        max_team_headcount = p_max_team_headcount,
        status = 'open',
        revision = capacity.revision + 1,
        last_confirmed_by = v_caller,
        last_confirmed_at = CURRENT_TIMESTAMP,
        idempotency_key = p_idempotency_key,
        updated_at = CURRENT_TIMESTAMP
    WHERE capacity.id = v_capacity.id
    RETURNING capacity.id INTO v_capacity_id;
  ELSE
    IF p_expected_revision <> 0 THEN
      RAISE EXCEPTION 'stale_revision'
        USING DETAIL = 'expected=' || p_expected_revision || ';actual=0';
    END IF;
    INSERT INTO public.tonight_venue_capacities (
      round_id,
      activity_id,
      venue_id,
      venue_snapshot_id,
      team_capacity,
      max_team_headcount,
      last_confirmed_by,
      idempotency_key
    ) VALUES (
      p_round_id,
      p_activity_id,
      v_venue_id,
      p_venue_snapshot_id,
      p_team_capacity,
      p_max_team_headcount,
      v_caller,
      p_idempotency_key
    )
    RETURNING id INTO v_capacity_id;
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'venue_capacity',
    v_capacity_id,
    'capacity_set',
    v_before,
    pg_catalog.jsonb_build_object(
      'round_id', p_round_id,
      'activity_id', p_activity_id,
      'venue_snapshot_id', p_venue_snapshot_id,
      'team_capacity', p_team_capacity,
      'max_team_headcount', p_max_team_headcount,
      'venue_id', v_venue_id,
      'venue_category', v_venue_category,
      'expected_revision', p_expected_revision
    ),
    p_idempotency_key
  );
  RETURN v_capacity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_set_tonight_capacity(
  p_round_id UUID,
  p_activity_id UUID,
  p_venue_snapshot_id UUID,
  p_team_capacity SMALLINT,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.partner_set_tonight_capacity_profile(
    p_round_id,
    p_activity_id,
    p_venue_snapshot_id,
    p_team_capacity::INTEGER,
    5::SMALLINT,
    p_expected_revision,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.service_prepare_tonight_deposit(
  p_application_id UUID,
  p_user_id UUID,
  p_proposed_order_id TEXT,
  p_amount INTEGER,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  application_row public.tonight_applications%ROWTYPE;
  round_row public.tonight_rounds%ROWTYPE;
  team_row public.tonight_teams%ROWTYPE;
  deposit_row public.tonight_deposits%ROWTYPE;
  v_deposit_id UUID;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_proposed_order_id IS NULL OR pg_catalog.btrim(p_proposed_order_id) = '' THEN
    RAISE EXCEPTION 'provider_order_id_required';
  END IF;
  IF p_amount <> public.tonight_deposit_amount() THEN
    RAISE EXCEPTION 'invalid_deposit_amount';
  END IF;

  SELECT deposit.*
  INTO deposit_row
  FROM public.tonight_deposits AS deposit
  WHERE deposit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF deposit_row.application_id <> p_application_id
      OR deposit_row.user_id <> p_user_id
      OR deposit_row.amount <> p_amount
      OR deposit_row.provider_order_id <> pg_catalog.btrim(p_proposed_order_id) THEN
      RAISE EXCEPTION 'deposit_prepare_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'deposit_id', deposit_row.id,
      'provider_order_id', deposit_row.provider_order_id,
      'status', deposit_row.status,
      'revision', deposit_row.revision
    );
  END IF;

  SELECT application_value.*
  INTO application_row
  FROM public.tonight_applications AS application_value
  WHERE application_value.id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_application_not_found';
  END IF;
  IF application_row.user_id <> p_user_id THEN
    RAISE EXCEPTION 'deposit_owner_mismatch';
  END IF;
  IF application_row.status <> 'allocated' THEN
    RAISE EXCEPTION 'deposit_application_not_allocated';
  END IF;

  SELECT team.*
  INTO team_row
  FROM public.tonight_team_members AS member
  JOIN public.tonight_teams AS team ON team.id = member.team_id
  WHERE member.application_id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit_application_not_allocated';
  END IF;

  SELECT team.*
  INTO team_row
  FROM public.tonight_teams AS team
  WHERE team.id = team_row.id
  FOR UPDATE OF team;

  SELECT application_value.*
  INTO application_row
  FROM public.tonight_applications AS application_value
  WHERE application_value.id = p_application_id
  FOR UPDATE OF application_value;
  IF NOT FOUND OR application_row.user_id <> p_user_id
    OR application_row.status <> 'allocated'
    OR NOT EXISTS (
      SELECT 1
      FROM public.tonight_team_members AS member
      WHERE member.team_id = team_row.id
        AND member.application_id = p_application_id
    ) THEN
    RAISE EXCEPTION 'deposit_application_not_allocated';
  END IF;

  SELECT round_value.*
  INTO round_row
  FROM public.tonight_rounds AS round_value
  WHERE round_value.id = application_row.round_id;
  IF CURRENT_TIMESTAMP >= round_row.deposit_due_at THEN
    RAISE EXCEPTION 'deposit_time_gate_closed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tonight_market_memberships AS membership
    WHERE membership.market_code = round_row.market_code
      AND membership.user_id = p_user_id
      AND membership.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'tonight_market_membership_required';
  END IF;
  IF team_row.status <> 'deposit_pending' THEN
    RAISE EXCEPTION 'deposit_team_not_payable';
  END IF;

  SELECT deposit.*
  INTO deposit_row
  FROM public.tonight_deposits AS deposit
  WHERE deposit.application_id = p_application_id
  FOR UPDATE OF deposit;
  IF FOUND THEN
    IF deposit_row.user_id <> p_user_id OR deposit_row.amount <> p_amount THEN
      RAISE EXCEPTION 'deposit_prepare_conflict';
    END IF;
    IF deposit_row.status = 'pending' THEN
      RETURN pg_catalog.jsonb_build_object(
        'deposit_id', deposit_row.id,
        'provider_order_id', deposit_row.provider_order_id,
        'status', deposit_row.status,
        'revision', deposit_row.revision
      );
    END IF;
    RAISE EXCEPTION 'deposit_not_preparable';
  END IF;

  INSERT INTO public.tonight_deposits (
    application_id, user_id, amount, status, provider_order_id, idempotency_key
  ) VALUES (
    p_application_id,
    p_user_id,
    p_amount,
    'pending',
    pg_catalog.btrim(p_proposed_order_id),
    p_idempotency_key
  )
  ON CONFLICT (application_id) DO NOTHING
  RETURNING id INTO v_deposit_id;

  IF v_deposit_id IS NULL THEN
    SELECT deposit.*
    INTO deposit_row
    FROM public.tonight_deposits AS deposit
    WHERE deposit.application_id = p_application_id
    FOR UPDATE OF deposit;
    IF NOT FOUND OR deposit_row.user_id <> p_user_id
      OR deposit_row.amount <> p_amount OR deposit_row.status <> 'pending' THEN
      RAISE EXCEPTION 'deposit_prepare_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'deposit_id', deposit_row.id,
      'provider_order_id', deposit_row.provider_order_id,
      'status', deposit_row.status,
      'revision', deposit_row.revision
    );
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'deposit',
    v_deposit_id,
    'payment_order_prepared',
    NULL,
    pg_catalog.jsonb_build_object(
      'application_id', p_application_id,
      'status', 'pending',
      'amount', p_amount
    ),
    p_idempotency_key
  );
  RETURN pg_catalog.jsonb_build_object(
    'deposit_id', v_deposit_id,
    'provider_order_id', pg_catalog.btrim(p_proposed_order_id),
    'status', 'pending',
    'revision', 0
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'deposit_prepare_conflict';
END;
$$;

CREATE OR REPLACE FUNCTION quantum_private.publish_tonight_allocation_internal(
  p_round_id UUID,
  p_expected_revision INTEGER,
  p_team_assignments JSONB,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round public.tonight_rounds%ROWTYPE;
  v_round_before JSONB;
  v_team_index INTEGER;
  v_team_json JSONB;
  v_members JSONB;
  v_member_ids UUID[];
  v_expected_member_count INTEGER;
  v_activity_id UUID;
  v_capacity_id UUID;
  v_venue_id UUID;
  v_capacity public.tonight_venue_capacities%ROWTYPE;
  v_team_id UUID;
  v_team_number INTEGER;
  v_team_code TEXT;
  v_application_id UUID;
  v_seat INTEGER;
  v_male_count INTEGER;
  v_female_count INTEGER;
  v_valid_application_count INTEGER;
  v_ready_female_trio_bundle_count INTEGER;
  v_existing_assignment_payload JSONB;
  v_created_team_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_team_assignments IS NULL
    OR pg_catalog.jsonb_typeof(p_team_assignments) <> 'array' THEN
    RAISE EXCEPTION 'team_assignments_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tonight-round-transition:' || p_round_id::TEXT, 0)
  );

  SELECT audit.after_state -> 'assignments'
  INTO v_existing_assignment_payload
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'round'
    AND audit.entity_id = p_round_id
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing_assignment_payload IS NULL
      OR v_existing_assignment_payload <> p_team_assignments THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'team_id', team.id,
          'team_code', team.team_code,
          'team_number', team.team_number
        ) ORDER BY team.team_number
      )
      FROM public.tonight_teams AS team
      WHERE team.round_id = p_round_id
        AND team.allocation_idempotency_key = p_idempotency_key
    ), '[]'::JSONB);
  END IF;

  SELECT *
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;
  IF v_round.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision'
      USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || v_round.revision;
  END IF;
  IF v_round.status <> 'open' THEN
    RAISE EXCEPTION 'round_not_allocatable';
  END IF;
  IF CURRENT_TIMESTAMP < v_round.allocation_publish_at
    OR CURRENT_TIMESTAMP >= v_round.deposit_due_at THEN
    RAISE EXCEPTION 'allocation_time_gate_closed';
  END IF;
  IF (
    SELECT COUNT(*)
    FROM public.tonight_round_activities AS activity
    WHERE activity.round_id = p_round_id
  ) <> 3 THEN
    RAISE EXCEPTION 'round_activity_count_invalid';
  END IF;

  v_round_before := pg_catalog.to_jsonb(v_round);
  SELECT COALESCE(MAX(team.team_number), 0)
  INTO v_team_number
  FROM public.tonight_teams AS team
  WHERE team.round_id = p_round_id;

  IF pg_catalog.jsonb_array_length(p_team_assignments) > 0 THEN
  FOR v_team_index IN 0..pg_catalog.jsonb_array_length(p_team_assignments) - 1 LOOP
    v_team_json := p_team_assignments -> v_team_index;
    v_activity_id := (v_team_json ->> 'activity_id')::UUID;
    v_capacity_id := (v_team_json ->> 'venue_capacity_id')::UUID;
    v_members := v_team_json -> 'application_ids';

    IF pg_catalog.jsonb_typeof(v_members) <> 'array' THEN
      RAISE EXCEPTION 'invalid_team_size';
    END IF;
    v_expected_member_count := pg_catalog.jsonb_array_length(v_members);
    IF v_expected_member_count NOT IN (5, 6) THEN
      RAISE EXCEPTION 'invalid_team_size';
    END IF;
    SELECT pg_catalog.array_agg(selected.member_id::UUID ORDER BY selected.ordinality)
    INTO v_member_ids
    FROM pg_catalog.jsonb_array_elements_text(v_members)
      WITH ORDINALITY AS selected(member_id, ordinality);
    IF pg_catalog.array_position(v_member_ids, NULL::UUID) IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_team_member';
    END IF;
    IF (
      SELECT COUNT(DISTINCT selected.member_id)
      FROM pg_catalog.unnest(v_member_ids) AS selected(member_id)
    ) <> v_expected_member_count THEN
      RAISE EXCEPTION 'duplicate_team_member';
    END IF;

    SELECT capacity.venue_id
    INTO v_venue_id
    FROM public.tonight_venue_capacities AS capacity
    WHERE capacity.id = v_capacity_id
      AND capacity.round_id = p_round_id
      AND capacity.activity_id = v_activity_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'venue_capacity_unavailable';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('venue-partner-venue:' || v_venue_id::TEXT, 0)
    );
    PERFORM active_partner.id
    FROM public.venue_partner_memberships AS active_partner
    WHERE active_partner.venue_id = v_venue_id
      AND active_partner.revoked_at IS NULL
    ORDER BY active_partner.id
    LIMIT 1
    FOR SHARE OF active_partner;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'venue_capacity_without_active_partner';
    END IF;

    SELECT *
    INTO v_capacity
    FROM public.tonight_venue_capacities AS capacity
    WHERE capacity.id = v_capacity_id
      AND capacity.round_id = p_round_id
      AND capacity.activity_id = v_activity_id
      AND capacity.venue_id = v_venue_id
    FOR UPDATE;
    IF NOT FOUND OR v_capacity.status NOT IN ('open', 'locked') THEN
      RAISE EXCEPTION 'venue_capacity_unavailable';
    END IF;
    IF v_capacity.reserved_team_count >= v_capacity.team_capacity THEN
      RAISE EXCEPTION 'venue_capacity_exhausted';
    END IF;
    IF v_capacity.max_team_headcount < v_expected_member_count THEN
      RAISE EXCEPTION 'venue_capacity_headcount_exceeded';
    END IF;

    SELECT COUNT(*)
    INTO v_valid_application_count
    FROM public.tonight_applications AS application_row
    JOIN public.tonight_friend_bundle_members AS bundle_member
      ON bundle_member.application_id = application_row.id
      AND bundle_member.bundle_id = application_row.bundle_id
    JOIN public.tonight_friend_bundles AS bundle
      ON bundle.id = application_row.bundle_id
      AND bundle.round_id = application_row.round_id
    JOIN public.tonight_market_memberships AS membership
      ON membership.market_code = v_round.market_code
      AND membership.user_id = application_row.user_id
      AND membership.revoked_at IS NULL
    WHERE application_row.round_id = p_round_id
      AND application_row.status IN ('submitted', 'waitlisted')
      AND application_row.id = ANY(v_member_ids)
      AND (
        bundle.created_by = application_row.user_id
        OR EXISTS (
          SELECT 1
          FROM public.tonight_friend_invites AS invite
          WHERE invite.round_id = application_row.round_id
            AND invite.bundle_id = application_row.bundle_id
            AND invite.status = 'accepted'
            AND invite.claimed_by_user_id = application_row.user_id
        )
      );
    IF v_valid_application_count <> v_expected_member_count THEN
      RAISE EXCEPTION 'team_application_invalid';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tonight_applications AS bundled_application
      WHERE bundled_application.round_id = p_round_id
        AND bundled_application.id = ANY(v_member_ids)
      GROUP BY bundled_application.bundle_id
      HAVING COUNT(*) <> (
        SELECT COUNT(*)
        FROM public.tonight_friend_bundle_members AS bundle_member
        WHERE bundle_member.bundle_id = bundled_application.bundle_id
      )
    ) THEN
      RAISE EXCEPTION 'friend_bundle_split';
    END IF;

    SELECT
      COUNT(*) FILTER (WHERE feature.gender_code = 'male')::INTEGER,
      COUNT(*) FILTER (WHERE feature.gender_code = 'female')::INTEGER
    INTO v_male_count, v_female_count
    FROM quantum_private.tonight_applicant_features AS feature
    WHERE feature.application_id = ANY(v_member_ids);
    IF NOT (
      (v_expected_member_count = 5 AND v_male_count = 3 AND v_female_count = 2)
      OR (v_expected_member_count = 6 AND v_male_count = 3 AND v_female_count = 3)
    ) THEN
      RAISE EXCEPTION 'invalid_team_gender_mix';
    END IF;

    IF v_expected_member_count = 6 THEN
      SELECT COUNT(*)::INTEGER
      INTO v_ready_female_trio_bundle_count
      FROM (
        SELECT application_row.bundle_id
        FROM public.tonight_applications AS application_row
        JOIN public.tonight_friend_bundle_members AS bundle_member
          ON bundle_member.application_id = application_row.id
          AND bundle_member.bundle_id = application_row.bundle_id
        JOIN public.tonight_friend_bundles AS bundle
          ON bundle.id = application_row.bundle_id
          AND bundle.round_id = application_row.round_id
        JOIN quantum_private.tonight_applicant_features AS feature
          ON feature.application_id = application_row.id
        WHERE application_row.id = ANY(v_member_ids)
          AND application_row.round_id = p_round_id
        GROUP BY application_row.bundle_id
        HAVING COUNT(*) = 3
          AND COUNT(*) FILTER (WHERE feature.gender_code = 'female') = 3
          AND COUNT(*) FILTER (
            WHERE application_row.status IN ('submitted', 'waitlisted')
              AND (
                bundle.created_by = application_row.user_id
                OR EXISTS (
                  SELECT 1
                  FROM public.tonight_friend_invites AS invite
                  WHERE invite.round_id = application_row.round_id
                    AND invite.bundle_id = application_row.bundle_id
                    AND invite.status = 'accepted'
                    AND invite.claimed_by_user_id = application_row.user_id
                )
              )
          ) = 3
      ) AS bundle_member_ready;
      IF v_ready_female_trio_bundle_count <> 1 THEN
        RAISE EXCEPTION 'six_person_team_requires_female_trio_bundle';
      END IF;
    END IF;

    PERFORM quantum_private.assert_tonight_ranked_activity_selection(
      p_round_id,
      v_member_ids,
      v_activity_id,
      TRUE
    );

    v_team_number := v_team_number + 1;
    v_team_code := 'Q-' || v_round.market_code || '-'
      || pg_catalog.to_char(v_round.service_date, 'YYYYMMDD') || '-'
      || pg_catalog.lpad(
        v_team_number::TEXT,
        GREATEST(3, pg_catalog.length(v_team_number::TEXT)),
        '0'
      );

    BEGIN
      INSERT INTO public.tonight_teams (
        round_id,
        activity_id,
        venue_capacity_id,
        team_number,
        team_code,
        status,
        member_count,
        male_count,
        female_count,
        allocation_idempotency_key
      )
      VALUES (
        p_round_id,
        v_activity_id,
        v_capacity_id,
        v_team_number,
        v_team_code,
        'deposit_pending',
        v_expected_member_count,
        v_male_count,
        v_female_count,
        p_idempotency_key
      )
      RETURNING id INTO v_team_id;
    EXCEPTION
      WHEN UNIQUE_VIOLATION THEN
        RAISE EXCEPTION 'team_code_or_member_conflict';
    END;

    v_seat := 0;
    FOREACH v_application_id IN ARRAY v_member_ids LOOP
      v_seat := v_seat + 1;
      INSERT INTO public.tonight_team_members (
        team_id,
        round_id,
        application_id,
        user_id,
        bundle_id,
        seat_number
      )
      SELECT
        v_team_id,
        application_row.round_id,
        application_row.id,
        application_row.user_id,
        application_row.bundle_id,
        v_seat
      FROM public.tonight_applications AS application_row
      WHERE application_row.id = v_application_id;

      UPDATE public.tonight_applications
      SET status = 'allocated',
          revision = revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = v_application_id;
    END LOOP;

    UPDATE public.tonight_friend_bundles AS bundle
    SET status = 'locked',
        revision = bundle.revision + 1
    WHERE bundle.id IN (
      SELECT DISTINCT application_row.bundle_id
      FROM public.tonight_applications AS application_row
      WHERE application_row.id = ANY(v_member_ids)
    );

    UPDATE public.tonight_venue_capacities AS capacity
    SET reserved_team_count = capacity.reserved_team_count + 1,
        revision = capacity.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE capacity.id = v_capacity_id;

    PERFORM quantum_private.assert_tonight_team_integrity(v_team_id);
    v_created_team_ids := pg_catalog.array_append(v_created_team_ids, v_team_id);
  END LOOP;
  END IF;

  UPDATE public.tonight_applications AS application_row
  SET status = 'waitlisted',
      revision = application_row.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE application_row.round_id = p_round_id
    AND application_row.status = 'submitted'
    AND NOT EXISTS (
      SELECT 1
      FROM public.tonight_team_members AS assigned_member
      WHERE assigned_member.application_id = application_row.id
    );

  UPDATE public.tonight_friend_bundles AS bundle
  SET status = 'locked',
      revision = bundle.revision + 1
  WHERE bundle.round_id = p_round_id
    AND bundle.status = 'forming';

  UPDATE public.tonight_rounds AS round_row
  SET status = CASE
        WHEN pg_catalog.jsonb_array_length(p_team_assignments) = 0 THEN 'completed'
        ELSE 'awaiting_deposits'
      END,
      revision = round_row.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE round_row.id = p_round_id;

  PERFORM quantum_private.write_tonight_audit(
    'round',
    p_round_id,
    'allocation_published',
    v_round_before,
    pg_catalog.jsonb_build_object(
      'team_ids', pg_catalog.to_jsonb(v_created_team_ids),
      'team_count', pg_catalog.cardinality(v_created_team_ids),
      'assignments', p_team_assignments
    ),
    p_idempotency_key
  );

  RETURN COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'team_id', team.id,
        'team_code', team.team_code,
        'team_number', team.team_number
      ) ORDER BY team.team_number
    )
    FROM public.tonight_teams AS team
    WHERE team.id = ANY(v_created_team_ids)
  ), '[]'::JSONB);
END;
$$;

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
  IF p_reported_attendee_count IS NULL
    OR p_reported_attendee_count < 0
    OR p_reported_attendee_count > v_team.member_count THEN
    RAISE EXCEPTION 'invalid_confirmed_attendee_count';
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

CREATE OR REPLACE FUNCTION public.service_get_tonight_allocator_input(
  p_round_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round public.tonight_rounds%ROWTYPE;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  SELECT *
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;
  IF v_round.status <> 'open'
    OR CURRENT_TIMESTAMP < v_round.capacity_lock_at
    OR CURRENT_TIMESTAMP >= v_round.deposit_due_at THEN
    RAISE EXCEPTION 'allocator_input_time_gate_closed';
  END IF;
  IF (
    SELECT COUNT(*)
    FROM public.tonight_round_activities AS activity
    WHERE activity.round_id = p_round_id
  ) <> 3 THEN
    RAISE EXCEPTION 'round_activity_count_invalid';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.tonight_applications AS application_row
    WHERE application_row.round_id = p_round_id
      AND application_row.status IN ('submitted', 'waitlisted')
      AND (
        SELECT COUNT(*)
        FROM public.tonight_application_choices AS choice
        WHERE choice.application_id = application_row.id
      ) <> 3
  ) THEN
    RAISE EXCEPTION 'application_choice_count_invalid';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.tonight_applications AS application_row
    LEFT JOIN quantum_private.tonight_applicant_features AS feature
      ON feature.application_id = application_row.id
    WHERE application_row.round_id = p_round_id
      AND application_row.status IN ('submitted', 'waitlisted')
      AND feature.application_id IS NULL
  ) THEN
    RAISE EXCEPTION 'application_feature_snapshot_missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tonight_venue_capacities AS capacity
    WHERE capacity.round_id = p_round_id
      AND capacity.status IN ('open', 'locked')
      AND capacity.team_capacity > capacity.reserved_team_count
      AND NOT EXISTS (
        SELECT 1
        FROM public.venue_partner_memberships AS active_partner
        WHERE active_partner.venue_id = capacity.venue_id
          AND active_partner.revoked_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'venue_capacity_without_active_partner';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'round', pg_catalog.jsonb_build_object(
      'id', v_round.id,
      'revision', v_round.revision,
      'market_code', v_round.market_code,
      'service_date', v_round.service_date,
      'capacity_lock_at', v_round.capacity_lock_at,
      'allocation_publish_at', v_round.allocation_publish_at,
      'deposit_due_at', v_round.deposit_due_at
    ),
    'activities', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', activity.id,
          'slot', activity.slot,
          'kind', activity.activity_kind,
          'duration_minutes', activity.duration_minutes
        ) ORDER BY activity.slot
      )
      FROM public.tonight_round_activities AS activity
      WHERE activity.round_id = p_round_id
    ), '[]'::JSONB),
    'capacities', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', capacity.id,
          'activity_id', capacity.activity_id,
          'team_capacity', capacity.team_capacity,
          'reserved_team_count', capacity.reserved_team_count,
          'max_team_headcount', capacity.max_team_headcount,
          'revision', capacity.revision
        ) ORDER BY capacity.activity_id, capacity.id
      )
      FROM public.tonight_venue_capacities AS capacity
      WHERE capacity.round_id = p_round_id
        AND capacity.status IN ('open', 'locked')
        AND EXISTS (
          SELECT 1
          FROM public.venue_partner_memberships AS active_partner
          WHERE active_partner.venue_id = capacity.venue_id
            AND active_partner.revoked_at IS NULL
        )
    ), '[]'::JSONB),
    'applications', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'application_id', application_row.id,
          'bundle_id', application_row.bundle_id,
          'bundle_size', (
            SELECT COUNT(*)
            FROM public.tonight_friend_bundle_members AS bundle_member
            WHERE bundle_member.bundle_id = application_row.bundle_id
          ),
          'age_years', feature.age_years,
          'gender_code', feature.gender_code,
          'appearance_score', feature.appearance_score,
          'bundle_member_ready', (
            application_row.status IN ('submitted', 'waitlisted')
            AND EXISTS (
              SELECT 1
              FROM public.tonight_market_memberships AS membership
              WHERE membership.market_code = v_round.market_code
                AND membership.user_id = application_row.user_id
                AND membership.revoked_at IS NULL
            )
            AND EXISTS (
              SELECT 1
              FROM public.tonight_friend_bundle_members AS bundle_member
              WHERE bundle_member.bundle_id = application_row.bundle_id
                AND bundle_member.application_id = application_row.id
            )
            AND (
              bundle.created_by = application_row.user_id
              OR EXISTS (
                SELECT 1
                FROM public.tonight_friend_invites AS invite
                WHERE invite.round_id = application_row.round_id
                  AND invite.bundle_id = application_row.bundle_id
                  AND invite.status = 'accepted'
                  AND invite.claimed_by_user_id = application_row.user_id
              )
            )
          ),
          'choices', (
            SELECT pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'activity_id', choice.activity_id,
                'rank', choice.rank
              ) ORDER BY choice.rank
            )
            FROM public.tonight_application_choices AS choice
            WHERE choice.application_id = application_row.id
          )
        ) ORDER BY application_row.id
      )
      FROM public.tonight_applications AS application_row
      JOIN public.tonight_friend_bundles AS bundle
        ON bundle.id = application_row.bundle_id
        AND bundle.round_id = application_row.round_id
      JOIN quantum_private.tonight_applicant_features AS feature
        ON feature.application_id = application_row.id
      WHERE application_row.round_id = p_round_id
        AND application_row.status IN ('submitted', 'waitlisted')
    ), '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.assert_tonight_ranked_activity_selection(UUID, UUID[], UUID, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.assert_tonight_team_integrity(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.publish_tonight_allocation_internal(UUID, INTEGER, JSONB, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_get_tonight_allocator_input(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_prepare_tonight_deposit(UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_record_tonight_deposit_result(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_expire_tonight_deposit_gate(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_accept_tonight_team(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_swap_tonight_friend_bundles(UUID, UUID, INTEGER, UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_confirm_tonight_service(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_record_tonight_service_confirmation_attempt(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_get_tonight_dashboard(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_get_tonight_setup(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_set_tonight_capacity_profile(UUID, UUID, UUID, INTEGER, SMALLINT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_set_tonight_capacity(UUID, UUID, UUID, SMALLINT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.service_get_tonight_allocator_input(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_prepare_tonight_deposit(UUID, UUID, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_record_tonight_deposit_result(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_expire_tonight_deposit_gate(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_accept_tonight_team(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_swap_tonight_friend_bundles(UUID, UUID, INTEGER, UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_confirm_tonight_service(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_record_tonight_service_confirmation_attempt(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_tonight_dashboard(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_tonight_setup(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_set_tonight_capacity_profile(UUID, UUID, UUID, INTEGER, SMALLINT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_set_tonight_capacity(UUID, UUID, UUID, SMALLINT, INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION public.partner_set_tonight_capacity_profile(UUID, UUID, UUID, INTEGER, SMALLINT, INTEGER, TEXT) IS
  'Live-membership-scoped partner capacity with an atomic 5-or-6-person roster profile.';
COMMENT ON FUNCTION public.partner_set_tonight_capacity(UUID, UUID, UUID, SMALLINT, INTEGER, TEXT) IS
  'Backward-compatible five-person capacity profile.';

COMMIT;
