-- Align database publication with the deterministic TypeScript ranked-activity
-- allocator. A team may fall back from its Borda winner only after every
-- higher-ranked activity has no usable capacity left in this round.
BEGIN;

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
  IF p_application_ids IS NULL
    OR pg_catalog.cardinality(p_application_ids) <> 5 THEN
    RAISE EXCEPTION 'invalid_team_size';
  END IF;
  IF p_application_ids[1] = ANY(p_application_ids[2:5])
    OR p_application_ids[2] = ANY(p_application_ids[3:5])
    OR p_application_ids[3] = ANY(p_application_ids[4:5])
    OR p_application_ids[4] = p_application_ids[5] THEN
    RAISE EXCEPTION 'duplicate_team_member';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_application_count
  FROM public.tonight_applications AS application_row
  WHERE application_row.round_id = p_round_id
    AND application_row.id = ANY(p_application_ids);
  IF v_application_count <> 5 THEN
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
  IF v_choice_count <> 15 THEN
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

  v_selected_position :=
    pg_catalog.array_position(v_ranked_activity_ids, p_selected_activity_id);
  IF v_selected_position IS NULL THEN
    RAISE EXCEPTION 'team_activity_rank_invalid';
  END IF;

  IF p_enforce_capacity AND v_selected_position > 1 AND EXISTS (
    SELECT 1
    FROM public.tonight_venue_capacities AS capacity
    WHERE capacity.round_id = p_round_id
      AND capacity.activity_id = ANY(
        v_ranked_activity_ids[1:v_selected_position - 1]
      )
      AND capacity.status IN ('open', 'locked')
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

  IF v_member_count <> 5 THEN
    RAISE EXCEPTION 'invalid_team_size';
  END IF;
  IF NOT (
    (v_male_count = 2 AND v_female_count = 3)
    OR (v_male_count = 3 AND v_female_count = 2)
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
      FROM public.tonight_applications AS bundled_application
      WHERE bundled_application.bundle_id = member.bundle_id
        AND bundled_application.round_id = v_round_id
        AND bundled_application.status = 'allocated'
    )
  ) THEN
    RAISE EXCEPTION 'friend_bundle_split';
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

  -- Every round phase transition takes the same transaction-scoped lock.
  -- This prevents the deposit deadline worker from completing an open round
  -- while allocation is publishing teams for that same round.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-round-transition:' || p_round_id::TEXT,
      0
    )
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
        )
        ORDER BY team.team_number
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

    IF pg_catalog.jsonb_typeof(v_members) <> 'array'
      OR pg_catalog.jsonb_array_length(v_members) <> 5 THEN
      RAISE EXCEPTION 'invalid_team_size';
    END IF;
    v_member_ids := ARRAY[
      (v_members ->> 0)::UUID,
      (v_members ->> 1)::UUID,
      (v_members ->> 2)::UUID,
      (v_members ->> 3)::UUID,
      (v_members ->> 4)::UUID
    ];
    IF pg_catalog.array_position(v_member_ids, NULL::UUID) IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_team_member';
    END IF;
    IF v_member_ids[1] = ANY(v_member_ids[2:5])
      OR v_member_ids[2] = ANY(v_member_ids[3:5])
      OR v_member_ids[3] = ANY(v_member_ids[4:5])
      OR v_member_ids[4] = v_member_ids[5] THEN
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

    -- Serialize with partner revocation before locking or consuming capacity.
    -- The shared membership lock keeps at least one responsible partner live
    -- until every team write in this transaction commits.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'venue-partner-venue:' || v_venue_id::TEXT,
        0
      )
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

    SELECT COUNT(*)
    INTO v_valid_application_count
    FROM public.tonight_applications AS application_row
    JOIN public.tonight_market_memberships AS membership
      ON membership.market_code = v_round.market_code
      AND membership.user_id = application_row.user_id
      AND membership.revoked_at IS NULL
    WHERE application_row.round_id = p_round_id
      AND application_row.status IN ('submitted', 'waitlisted')
      AND application_row.id = ANY(v_member_ids);
    IF v_valid_application_count <> 5 THEN
      RAISE EXCEPTION 'team_application_invalid';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tonight_applications AS bundled_application
      WHERE bundled_application.round_id = p_round_id
        AND bundled_application.status IN ('submitted', 'waitlisted')
        AND bundled_application.bundle_id IN (
          SELECT application_row.bundle_id
          FROM public.tonight_applications AS application_row
          WHERE application_row.id = ANY(v_member_ids)
        )
      GROUP BY bundled_application.bundle_id
      HAVING COUNT(*) <> COUNT(*) FILTER (
        WHERE bundled_application.id = ANY(v_member_ids)
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
      (v_male_count = 2 AND v_female_count = 3)
      OR (v_male_count = 3 AND v_female_count = 2)
    ) THEN
      RAISE EXCEPTION 'invalid_team_gender_mix';
    END IF;

    PERFORM quantum_private.assert_tonight_ranked_activity_selection(
      p_round_id,
      v_member_ids,
      v_activity_id,
      TRUE
    );

    v_team_number := v_team_number + 1;
    -- Team code shape: Q-PNU-20260903-001 (round-global, never venue-local Q-1).
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
        5,
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
      )
      ORDER BY team.team_number
    )
    FROM public.tonight_teams AS team
    WHERE team.id = ANY(v_created_team_ids)
  ), '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.assert_tonight_ranked_activity_selection(UUID, UUID[], UUID, BOOLEAN)
  FROM /* explicit internal boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.assert_tonight_team_integrity(UUID)
  FROM /* explicit internal boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.publish_tonight_allocation_internal(UUID, INTEGER, JSONB, TEXT)
  FROM /* explicit internal boundary */ PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION quantum_private.assert_tonight_ranked_activity_selection(UUID, UUID[], UUID, BOOLEAN) IS
  'Fail-closed 5-member ballot validation with deterministic Borda/first/second/slot ranking; capacity fallback is enforced only at immutable publication time.';
COMMENT ON FUNCTION quantum_private.assert_tonight_team_integrity(UUID) IS
  'Revalidates team size, composition, friend bundles, eligibility, ballot shape, and capacity-safe ranked activity fallback.';
COMMENT ON FUNCTION quantum_private.publish_tonight_allocation_internal(UUID, INTEGER, JSONB, TEXT) IS
  'Publishes exact teams atomically and permits ranked activity fallback only after every higher-ranked activity is exhausted.';

COMMIT;
