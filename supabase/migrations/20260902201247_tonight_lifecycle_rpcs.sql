-- Transactional lifecycle for Tonight. Every mutation is mediated by a
-- fixed-search-path SECURITY DEFINER RPC; ledger tables remain direct-read/
-- direct-write inaccessible to browser roles.

BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.write_tonight_audit(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_action TEXT,
  p_before_state JSONB,
  p_after_state JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_kind TEXT := CASE WHEN auth.uid() IS NULL THEN 'service' ELSE 'authenticated' END;
  v_audit_id BIGINT;
  v_existing quantum_private.tonight_audit_events%ROWTYPE;
BEGIN
  INSERT INTO quantum_private.tonight_audit_events (
    entity_type,
    entity_id,
    action,
    actor_user_id,
    actor_kind,
    occurred_at,
    before_state,
    after_state,
    idempotency_key
  )
  VALUES (
    p_entity_type,
    p_entity_id,
    p_action,
    v_actor,
    v_actor_kind,
    CURRENT_TIMESTAMP,
    p_before_state,
    p_after_state,
    p_idempotency_key
  )
  ON CONFLICT (entity_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_audit_id;

  IF v_audit_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT audit.*
    INTO v_existing
    FROM quantum_private.tonight_audit_events AS audit
    WHERE audit.entity_type = p_entity_type
      AND audit.idempotency_key = p_idempotency_key;

    IF NOT FOUND
      OR v_existing.entity_id <> p_entity_id
      OR v_existing.action <> p_action
      OR (v_existing.actor_user_id IS NULL) <> (v_actor IS NULL)
      OR (
        v_existing.actor_user_id IS NOT NULL
        AND v_actor IS NOT NULL
        AND v_existing.actor_user_id <> v_actor
      )
      OR v_existing.actor_kind <> v_actor_kind
      OR (v_existing.before_state IS NULL) <> (p_before_state IS NULL)
      OR (
        v_existing.before_state IS NOT NULL
        AND p_before_state IS NOT NULL
        AND v_existing.before_state <> p_before_state
      )
      OR (v_existing.after_state IS NULL) <> (p_after_state IS NULL)
      OR (
        v_existing.after_state IS NOT NULL
        AND p_after_state IS NOT NULL
        AND v_existing.after_state <> p_after_state
      ) THEN
      RAISE EXCEPTION 'audit_idempotency_conflict';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION quantum_private.prevent_tonight_immutable_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'tonight_ledger_is_append_only';
END;
$$;

CREATE TRIGGER tonight_audit_events_immutable
  BEFORE UPDATE
  ON quantum_private.tonight_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE TRIGGER tonight_audit_events_delete_immutable
  BEFORE DELETE
  ON quantum_private.tonight_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE TRIGGER tonight_deposit_result_events_update_immutable
  BEFORE UPDATE
  ON quantum_private.tonight_deposit_result_events
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE TRIGGER tonight_deposit_result_events_delete_immutable
  BEFORE DELETE
  ON quantum_private.tonight_deposit_result_events
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

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
  v_winning_activity_id UUID;
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

  SELECT choice.activity_id
  INTO v_winning_activity_id
  FROM public.tonight_application_choices AS choice
  JOIN public.tonight_round_activities AS activity
    ON activity.id = choice.activity_id
    AND activity.round_id = choice.round_id
  WHERE choice.application_id IN (
    SELECT member.application_id
    FROM public.tonight_team_members AS member
    WHERE member.team_id = p_team_id
  )
  GROUP BY choice.activity_id, activity.slot
  ORDER BY SUM(4 - choice.rank) DESC, activity.slot ASC
  LIMIT 1;

  IF v_winning_activity_id IS NULL
    OR v_winning_activity_id <> v_team_activity_id THEN
    RAISE EXCEPTION 'team_activity_not_rank_winner';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.write_tonight_audit(TEXT, UUID, TEXT, JSONB, JSONB, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.prevent_tonight_immutable_mutation()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.assert_tonight_team_integrity(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.super_admin_grant_tonight_market_membership(
  p_market_code TEXT,
  p_user_id UUID,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_market_code TEXT := pg_catalog.upper(pg_catalog.btrim(p_market_code));
  v_membership public.tonight_market_memberships%ROWTYPE;
  v_membership_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF v_market_code <> 'PNU' THEN
    RAISE EXCEPTION 'tonight_market_not_enabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users AS user_row WHERE user_row.id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- A global key lock makes concurrent reuse deterministic even when the two
  -- requests carry different targets.  The market:user lock separately
  -- serializes different keys competing to create the one active membership.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-market-membership-grant-key:' || p_idempotency_key,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-market-membership:' || v_market_code || ':' || p_user_id::TEXT,
      0
    )
  );

  SELECT * INTO v_membership
  FROM public.tonight_market_memberships AS membership
  WHERE membership.grant_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_membership.market_code <> v_market_code
      OR v_membership.user_id <> p_user_id
      OR v_membership.granted_by <> v_caller THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_membership.id;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.tonight_market_memberships AS membership
    WHERE membership.market_code = v_market_code
      AND membership.user_id = p_user_id
      AND membership.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'tonight_market_membership_already_active';
  END IF;

  INSERT INTO public.tonight_market_memberships (
    market_code,
    user_id,
    granted_by,
    grant_idempotency_key
  )
  VALUES (v_market_code, p_user_id, v_caller, p_idempotency_key)
  RETURNING id INTO v_membership_id;

  PERFORM quantum_private.write_tonight_audit(
    'market_membership',
    v_membership_id,
    'granted',
    NULL,
    pg_catalog.jsonb_build_object('market_code', v_market_code, 'user_id', p_user_id),
    p_idempotency_key
  );
  RETURN v_membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_revoke_tonight_market_membership(
  p_membership_id UUID,
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
  v_membership public.tonight_market_memberships%ROWTYPE;
  v_replay public.tonight_market_memberships%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-market-membership-revoke-key:' || p_idempotency_key,
      0
    )
  );

  SELECT * INTO v_replay
  FROM public.tonight_market_memberships AS membership
  WHERE membership.revoke_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_replay.id <> p_membership_id
      OR v_replay.revoked_by <> v_caller THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_replay.id;
  END IF;

  SELECT * INTO v_membership
  FROM public.tonight_market_memberships AS membership
  WHERE membership.id = p_membership_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_market_membership_not_found';
  END IF;

  -- The row lock may have waited behind the first identical revoke.  Replay
  -- must be resolved from the committed canonical row before stale/revoked
  -- state is treated as an error.
  SELECT * INTO v_replay
  FROM public.tonight_market_memberships AS membership
  WHERE membership.revoke_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_replay.id <> p_membership_id
      OR v_replay.revoked_by <> v_caller THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_replay.id;
  END IF;

  IF v_membership.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision'
      USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || v_membership.revision;
  END IF;
  IF v_membership.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'tonight_market_membership_already_revoked';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tonight_applications AS application_row
    JOIN public.tonight_rounds AS round_row
      ON round_row.id = application_row.round_id
    WHERE application_row.user_id = v_membership.user_id
      AND round_row.market_code = v_membership.market_code
      AND application_row.status IN ('submitted', 'waitlisted', 'allocated')
      AND round_row.status NOT IN ('completed', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'membership_has_active_tonight_obligations';
  END IF;

  UPDATE public.tonight_market_memberships AS membership
  SET revoked_by = v_caller,
      revoked_at = CURRENT_TIMESTAMP,
      revoke_idempotency_key = p_idempotency_key,
      revision = membership.revision + 1
  WHERE membership.id = p_membership_id
    AND membership.revision = p_expected_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'market_membership',
    p_membership_id,
    'revoked',
    pg_catalog.to_jsonb(v_membership),
    pg_catalog.jsonb_build_object(
      'revoked_at', CURRENT_TIMESTAMP,
      'revision', v_membership.revision + 1
    ),
    p_idempotency_key
  );
  RETURN p_membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_tonight_market_memberships(
  p_market_code TEXT
)
RETURNS TABLE (
  membership_id UUID,
  market_code TEXT,
  user_id UUID,
  granted_at TIMESTAMPTZ,
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
  v_market_code TEXT := pg_catalog.upper(pg_catalog.btrim(p_market_code));
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
    membership.market_code,
    membership.user_id,
    membership.granted_at,
    membership.revoked_at,
    membership.revision
  FROM public.tonight_market_memberships AS membership
  WHERE membership.market_code = v_market_code
  ORDER BY membership.revoked_at NULLS FIRST, membership.granted_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION quantum_private.create_tonight_round_internal(
  p_market_code TEXT,
  p_service_date DATE,
  p_signup_open_at TIMESTAMPTZ,
  p_signup_close_at TIMESTAMPTZ,
  p_capacity_lock_at TIMESTAMPTZ,
  p_allocation_publish_at TIMESTAMPTZ,
  p_deposit_due_at TIMESTAMPTZ,
  p_partner_acceptance_due_at TIMESTAMPTZ,
  p_reveal_at TIMESTAMPTZ,
  p_arrival_at TIMESTAMPTZ,
  p_starts_at TIMESTAMPTZ,
  p_activity_titles TEXT[],
  p_activity_kinds TEXT[],
  p_activity_descriptions TEXT[],
  p_activity_image_urls TEXT[],
  p_activity_duration_minutes SMALLINT[],
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_round_id UUID;
  v_existing public.tonight_rounds%ROWTYPE;
  v_market_code TEXT := pg_catalog.upper(pg_catalog.btrim(p_market_code));
  v_slot INTEGER;
BEGIN
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF v_market_code <> 'PNU' THEN
    RAISE EXCEPTION 'tonight_market_not_enabled';
  END IF;
  IF pg_catalog.cardinality(p_activity_titles) <> 3
    OR pg_catalog.cardinality(p_activity_kinds) <> 3
    OR pg_catalog.cardinality(p_activity_descriptions) <> 3
    OR pg_catalog.cardinality(p_activity_image_urls) <> 3
    OR pg_catalog.cardinality(p_activity_duration_minutes) <> 3 THEN
    RAISE EXCEPTION 'invalid_activity_count';
  END IF;
  IF p_activity_image_urls[1] IS NULL
    OR pg_catalog.btrim(p_activity_image_urls[1]) = ''
    OR p_activity_image_urls[2] IS NULL
    OR pg_catalog.btrim(p_activity_image_urls[2]) = ''
    OR p_activity_image_urls[3] IS NULL
    OR pg_catalog.btrim(p_activity_image_urls[3]) = '' THEN
    RAISE EXCEPTION 'activity_image_required';
  END IF;
  FOR v_slot IN 1..3 LOOP
    IF p_activity_duration_minutes[v_slot] IS NULL
      OR p_activity_duration_minutes[v_slot] NOT BETWEEN 30 AND 240 THEN
      RAISE EXCEPTION 'invalid_activity_duration';
    END IF;
  END LOOP;
  IF p_signup_open_at IS NULL
    OR p_signup_close_at IS NULL
    OR p_capacity_lock_at IS NULL
    OR p_allocation_publish_at IS NULL
    OR p_deposit_due_at IS NULL
    OR p_partner_acceptance_due_at IS NULL
    OR p_reveal_at IS NULL
    OR p_arrival_at IS NULL
    OR p_starts_at IS NULL
    OR p_signup_open_at >= p_signup_close_at
    OR p_signup_close_at > p_capacity_lock_at
    OR p_capacity_lock_at > p_allocation_publish_at
    OR p_allocation_publish_at >= p_deposit_due_at
    OR p_deposit_due_at >= p_partner_acceptance_due_at
    OR p_partner_acceptance_due_at > p_reveal_at
    OR p_reveal_at > p_arrival_at
    OR p_arrival_at >= p_starts_at THEN
    RAISE EXCEPTION 'invalid_round_gate_order';
  END IF;
  IF (p_starts_at AT TIME ZONE 'Asia/Seoul')::DATE <> p_service_date THEN
    RAISE EXCEPTION 'service_date_mismatch';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-round:' || v_market_code || ':' || p_service_date::TEXT,
      0
    )
  );

  SELECT *
  INTO v_existing
  FROM public.tonight_rounds AS round_row
  WHERE round_row.create_idempotency_key = p_idempotency_key
    OR (
      round_row.market_code = v_market_code
      AND round_row.service_date = p_service_date
    )
  ORDER BY (round_row.create_idempotency_key = p_idempotency_key) DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.market_code <> v_market_code
      OR v_existing.service_date <> p_service_date
      OR v_existing.signup_open_at <> p_signup_open_at
      OR v_existing.signup_close_at <> p_signup_close_at
      OR v_existing.capacity_lock_at <> p_capacity_lock_at
      OR v_existing.allocation_publish_at <> p_allocation_publish_at
      OR v_existing.deposit_due_at <> p_deposit_due_at
      OR v_existing.partner_acceptance_due_at <> p_partner_acceptance_due_at
      OR v_existing.reveal_at <> p_reveal_at
      OR v_existing.arrival_at <> p_arrival_at
      OR v_existing.starts_at <> p_starts_at THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    IF (
      SELECT COUNT(*)
      FROM public.tonight_round_activities AS activity
      WHERE activity.round_id = v_existing.id
        AND activity.slot BETWEEN 1 AND 3
        AND activity.title = p_activity_titles[activity.slot]
        AND activity.activity_kind = p_activity_kinds[activity.slot]
        AND activity.description = COALESCE(p_activity_descriptions[activity.slot], '')
        AND COALESCE(activity.image_url, '') = COALESCE(p_activity_image_urls[activity.slot], '')
        AND activity.duration_minutes = p_activity_duration_minutes[activity.slot]
    ) <> 3 THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_existing.id;
  END IF;

  INSERT INTO public.tonight_rounds (
    market_code,
    service_date,
    service_timezone,
    status,
    signup_open_at,
    signup_close_at,
    capacity_lock_at,
    allocation_publish_at,
    deposit_due_at,
    partner_acceptance_due_at,
    reveal_at,
    arrival_at,
    starts_at,
    created_by,
    created_by_kind,
    create_idempotency_key
  )
  VALUES (
    v_market_code,
    p_service_date,
    'Asia/Seoul',
    'open',
    p_signup_open_at,
    p_signup_close_at,
    p_capacity_lock_at,
    p_allocation_publish_at,
    p_deposit_due_at,
    p_partner_acceptance_due_at,
    p_reveal_at,
    p_arrival_at,
    p_starts_at,
    v_caller,
    CASE WHEN v_caller IS NULL THEN 'service' ELSE 'authenticated' END,
    p_idempotency_key
  )
  RETURNING id INTO v_round_id;

  FOR v_slot IN 1..3 LOOP
    INSERT INTO public.tonight_round_activities (
      round_id,
      slot,
      title,
      description,
      image_url,
      duration_minutes,
      activity_kind
    )
    VALUES (
      v_round_id,
      v_slot,
      p_activity_titles[v_slot],
      COALESCE(p_activity_descriptions[v_slot], ''),
      p_activity_image_urls[v_slot],
      p_activity_duration_minutes[v_slot],
      p_activity_kinds[v_slot]
    );
  END LOOP;

  PERFORM quantum_private.write_tonight_audit(
    'round',
    v_round_id,
    'created',
    NULL,
    pg_catalog.jsonb_build_object(
      'market_code', v_market_code,
      'service_date', p_service_date,
      'activity_count', 3
    ),
    p_idempotency_key
  );

  RETURN v_round_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_create_tonight_round(
  p_market_code TEXT,
  p_service_date DATE,
  p_signup_open_at TIMESTAMPTZ,
  p_signup_close_at TIMESTAMPTZ,
  p_capacity_lock_at TIMESTAMPTZ,
  p_allocation_publish_at TIMESTAMPTZ,
  p_deposit_due_at TIMESTAMPTZ,
  p_partner_acceptance_due_at TIMESTAMPTZ,
  p_reveal_at TIMESTAMPTZ,
  p_arrival_at TIMESTAMPTZ,
  p_starts_at TIMESTAMPTZ,
  p_activity_titles TEXT[],
  p_activity_kinds TEXT[],
  p_activity_descriptions TEXT[],
  p_activity_image_urls TEXT[],
  p_activity_duration_minutes SMALLINT[],
  p_idempotency_key TEXT
)
RETURNS UUID
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
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

  RETURN quantum_private.create_tonight_round_internal(
    p_market_code,
    p_service_date,
    p_signup_open_at,
    p_signup_close_at,
    p_capacity_lock_at,
    p_allocation_publish_at,
    p_deposit_due_at,
    p_partner_acceptance_due_at,
    p_reveal_at,
    p_arrival_at,
    p_starts_at,
    p_activity_titles,
    p_activity_kinds,
    p_activity_descriptions,
    p_activity_image_urls,
    p_activity_duration_minutes,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.service_create_tonight_round(
  p_market_code TEXT,
  p_service_date DATE,
  p_signup_open_at TIMESTAMPTZ,
  p_signup_close_at TIMESTAMPTZ,
  p_capacity_lock_at TIMESTAMPTZ,
  p_allocation_publish_at TIMESTAMPTZ,
  p_deposit_due_at TIMESTAMPTZ,
  p_partner_acceptance_due_at TIMESTAMPTZ,
  p_reveal_at TIMESTAMPTZ,
  p_arrival_at TIMESTAMPTZ,
  p_starts_at TIMESTAMPTZ,
  p_activity_titles TEXT[],
  p_activity_kinds TEXT[],
  p_activity_descriptions TEXT[],
  p_activity_image_urls TEXT[],
  p_activity_duration_minutes SMALLINT[],
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN quantum_private.create_tonight_round_internal(
    p_market_code,
    p_service_date,
    p_signup_open_at,
    p_signup_close_at,
    p_capacity_lock_at,
    p_allocation_publish_at,
    p_deposit_due_at,
    p_partner_acceptance_due_at,
    p_reveal_at,
    p_arrival_at,
    p_starts_at,
    p_activity_titles,
    p_activity_kinds,
    p_activity_descriptions,
    p_activity_image_urls,
    p_activity_duration_minutes,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_tonight_application(
  p_round_id UUID,
  p_ranked_activity_ids UUID[],
  p_matching_consent_accepted BOOLEAN,
  p_matching_consent_version TEXT,
  p_friend_invite_code TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  application_id UUID,
  bundle_id UUID,
  friend_invite_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_round public.tonight_rounds%ROWTYPE;
  v_bundle public.tonight_friend_bundles%ROWTYPE;
  v_application_id UUID;
  v_invite_code TEXT;
  v_member_count INTEGER;
  v_age INTEGER;
  v_gender TEXT;
  v_appearance_score DOUBLE PRECISION;
  v_source_revision UUID;
  v_rank INTEGER;
  v_existing public.tonight_applications%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF COALESCE(p_matching_consent_accepted, FALSE) = FALSE
    OR COALESCE(p_matching_consent_version, '') <> '2026-09-03' THEN
    RAISE EXCEPTION 'matching_consent_required';
  END IF;
  IF pg_catalog.cardinality(p_ranked_activity_ids) <> 3 THEN
    RAISE EXCEPTION 'invalid_activity_count';
  END IF;

  IF p_ranked_activity_ids[1] = p_ranked_activity_ids[2]
    OR p_ranked_activity_ids[1] = p_ranked_activity_ids[3]
    OR p_ranked_activity_ids[2] = p_ranked_activity_ids[3] THEN
    RAISE EXCEPTION 'duplicate_activity_choice';
  END IF;

  SELECT *
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;
  IF v_round.market_code <> 'PNU'
    OR NOT EXISTS (
      SELECT 1
      FROM public.tonight_market_memberships AS membership
      WHERE membership.market_code = v_round.market_code
        AND membership.user_id = v_caller
        AND membership.revoked_at IS NULL
    ) THEN
    RAISE EXCEPTION 'tonight_market_membership_required';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.tonight_applications AS application_row
  WHERE application_row.submission_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.user_id <> v_caller OR v_existing.round_id <> p_round_id THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    IF v_existing.matching_consent_version <> p_matching_consent_version THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.tonight_application_choices AS choice
      WHERE choice.application_id = v_existing.id
        AND choice.activity_id <> p_ranked_activity_ids[choice.rank]
    ) THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    SELECT bundle.invite_code
    INTO v_invite_code
    FROM public.tonight_friend_bundles AS bundle
    WHERE bundle.id = v_existing.bundle_id;
    IF p_friend_invite_code IS NOT NULL
      AND pg_catalog.btrim(p_friend_invite_code) <> ''
      AND v_invite_code <> pg_catalog.upper(pg_catalog.btrim(p_friend_invite_code)) THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.bundle_id, v_invite_code;
    RETURN;
  END IF;

  IF v_round.status <> 'open'
    OR CURRENT_TIMESTAMP < v_round.signup_open_at
    OR CURRENT_TIMESTAMP >= v_round.signup_close_at THEN
    RAISE EXCEPTION 'tonight_signup_closed';
  END IF;
  IF (
    SELECT COUNT(*)
    FROM public.tonight_round_activities AS activity
    WHERE activity.round_id = p_round_id
      AND activity.id = ANY(p_ranked_activity_ids)
  ) <> 3 THEN
    RAISE EXCEPTION 'activity_not_in_round';
  END IF;

  SELECT
    profile.age,
    profile.gender,
    score.score_effective,
    score.analyzed_photo_revision
  INTO
    v_age,
    v_gender,
    v_appearance_score,
    v_source_revision
  FROM public.profiles AS profile
  JOIN public.private_appearance_scores AS score
    ON score.user_id = profile.user_id
  WHERE profile.user_id = v_caller
    AND profile.is_profile_complete
    AND score.status = 'ready'
    AND score.score_effective IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'matching_features_not_ready';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-bundle:' || p_round_id::TEXT || ':' || COALESCE(p_friend_invite_code, v_caller::TEXT),
      0
    )
  );

  IF p_friend_invite_code IS NULL OR pg_catalog.btrim(p_friend_invite_code) = '' THEN
    v_invite_code := pg_catalog.upper(
      pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''), 1, 10)
    );
    INSERT INTO public.tonight_friend_bundles (
      round_id,
      created_by,
      invite_code,
      max_size
    )
    VALUES (p_round_id, v_caller, v_invite_code, 3)
    RETURNING * INTO v_bundle;
  ELSE
    SELECT *
    INTO v_bundle
    FROM public.tonight_friend_bundles AS bundle
    WHERE bundle.invite_code = pg_catalog.upper(pg_catalog.btrim(p_friend_invite_code))
    FOR UPDATE;
    IF NOT FOUND OR v_bundle.round_id <> p_round_id OR v_bundle.status <> 'forming' THEN
      RAISE EXCEPTION 'friend_bundle_unavailable';
    END IF;
    v_invite_code := v_bundle.invite_code;
  END IF;

  SELECT COUNT(*)
  INTO v_member_count
  FROM public.tonight_friend_bundle_members AS member
  WHERE member.bundle_id = v_bundle.id;
  IF v_member_count >= v_bundle.max_size OR v_member_count >= 3 THEN
    RAISE EXCEPTION 'friend_bundle_limit_exceeded';
  END IF;

  INSERT INTO public.tonight_applications (
    round_id,
    user_id,
    bundle_id,
    matching_consent_version,
    matching_consent_accepted_at,
    submission_idempotency_key
  )
  VALUES (
    p_round_id,
    v_caller,
    v_bundle.id,
    p_matching_consent_version,
    CURRENT_TIMESTAMP,
    p_idempotency_key
  )
  RETURNING id INTO v_application_id;

  INSERT INTO public.tonight_friend_bundle_members (bundle_id, application_id)
  VALUES (v_bundle.id, v_application_id);

  FOR v_rank IN 1..3 LOOP
    INSERT INTO public.tonight_application_choices (
      application_id,
      round_id,
      activity_id,
      rank
    )
    VALUES (v_application_id, p_round_id, p_ranked_activity_ids[v_rank], v_rank);
  END LOOP;

  INSERT INTO quantum_private.tonight_applicant_features (
    application_id,
    user_id,
    age_years,
    gender_code,
    automatic_appearance_score,
    appearance_score,
    source_score_revision
  )
  VALUES (
    v_application_id,
    v_caller,
    v_age,
    v_gender,
    v_appearance_score,
    v_appearance_score,
    v_source_revision
  );

  UPDATE public.tonight_friend_bundles AS bundle
  SET revision = bundle.revision + 1,
      status = CASE
        WHEN v_member_count + 1 >= bundle.max_size THEN 'locked'
        ELSE bundle.status
      END
  WHERE bundle.id = v_bundle.id;

  PERFORM quantum_private.write_tonight_audit(
    'application',
    v_application_id,
    'submitted',
    NULL,
    pg_catalog.jsonb_build_object(
      'round_id', p_round_id,
      'bundle_id', v_bundle.id,
      'choice_count', 3
    ),
    p_idempotency_key
  );

  RETURN QUERY SELECT v_application_id, v_bundle.id, v_invite_code;
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
DECLARE
  v_caller UUID := auth.uid();
  v_round public.tonight_rounds%ROWTYPE;
  v_venue_id UUID;
  v_capacity public.tonight_venue_capacities%ROWTYPE;
  v_before JSONB;
  v_capacity_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_team_capacity < 0 OR p_team_capacity > 100 THEN
    RAISE EXCEPTION 'invalid_capacity';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  SELECT snapshot.venue_id
  INTO v_venue_id
  FROM public.venue_snapshots AS snapshot
  WHERE snapshot.id = p_venue_snapshot_id;
  IF NOT FOUND OR NOT public.is_venue_partner(v_venue_id, v_caller) THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  -- Capacity and allocation both lock the round before a venue. This global
  -- order prevents a boundary-time capacity request from deadlocking with the
  -- allocator while replay remains valid because gate checks occur later.
  SELECT *
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;

  -- Partner writes and partner revocation share one venue-scoped lock. Holding
  -- the active membership row prevents authorization from going stale before
  -- this transaction finishes mutating venue capacity.
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
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  SELECT *
  INTO v_capacity
  FROM public.tonight_venue_capacities AS capacity
  WHERE capacity.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_capacity.round_id <> p_round_id
      OR v_capacity.activity_id <> p_activity_id
      OR v_capacity.venue_snapshot_id <> p_venue_snapshot_id
      OR v_capacity.venue_id <> v_venue_id
      OR v_capacity.team_capacity <> p_team_capacity THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_capacity.id;
  END IF;

  IF v_round.status <> 'open' THEN
    RAISE EXCEPTION 'round_not_accepting_capacity';
  END IF;
  IF v_round.capacity_lock_at <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'capacity_locked';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tonight_round_activities AS activity
    WHERE activity.round_id = p_round_id
      AND activity.id = p_activity_id
  ) THEN
    RAISE EXCEPTION 'activity_not_in_round';
  END IF;

  SELECT *
  INTO v_capacity
  FROM public.tonight_venue_capacities AS capacity
  WHERE capacity.round_id = p_round_id
    AND capacity.activity_id = p_activity_id
    AND capacity.venue_snapshot_id = p_venue_snapshot_id
  FOR UPDATE;

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
      last_confirmed_by,
      idempotency_key
    )
    VALUES (
      p_round_id,
      p_activity_id,
      v_venue_id,
      p_venue_snapshot_id,
      p_team_capacity,
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
      'team_capacity', p_team_capacity,
      'venue_id', v_venue_id
    ),
    p_idempotency_key
  );
  RETURN v_capacity_id;
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

  -- Capacity is only useful after the lock boundary when a currently active
  -- venue partner can own the resulting team. Fail closed instead of handing
  -- an orphaned slot to the allocator.
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
      JOIN quantum_private.tonight_applicant_features AS feature
        ON feature.application_id = application_row.id
      WHERE application_row.round_id = p_round_id
        AND application_row.status IN ('submitted', 'waitlisted')
        AND NOT EXISTS (
          SELECT 1
          FROM public.tonight_applications AS bundled_application
          WHERE bundled_application.round_id = p_round_id
            AND bundled_application.bundle_id = application_row.bundle_id
            AND bundled_application.status IN ('submitted', 'waitlisted')
            AND NOT EXISTS (
              SELECT 1
              FROM public.tonight_market_memberships AS membership
              WHERE membership.market_code = v_round.market_code
                AND membership.user_id = bundled_application.user_id
                AND membership.revoked_at IS NULL
            )
        )
    ), '[]'::JSONB)
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
  v_winning_activity_id UUID;
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

    SELECT choice.activity_id
    INTO v_winning_activity_id
    FROM public.tonight_application_choices AS choice
    JOIN public.tonight_round_activities AS activity
      ON activity.id = choice.activity_id
      AND activity.round_id = choice.round_id
    WHERE choice.application_id = ANY(v_member_ids)
    GROUP BY choice.activity_id, activity.slot
    ORDER BY SUM(4 - choice.rank) DESC, activity.slot ASC
    LIMIT 1;
    IF v_winning_activity_id IS NULL
      OR v_winning_activity_id <> v_activity_id THEN
      RAISE EXCEPTION 'team_activity_not_rank_winner';
    END IF;

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

CREATE OR REPLACE FUNCTION public.super_admin_publish_tonight_allocation(
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
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

  RETURN quantum_private.publish_tonight_allocation_internal(
    p_round_id,
    p_expected_revision,
    p_team_assignments,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.service_publish_tonight_allocation(
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
BEGIN
  RETURN quantum_private.publish_tonight_allocation_internal(
    p_round_id,
    p_expected_revision,
    p_team_assignments,
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

  -- Resolve first without a row lock, then lock every payment path in the
  -- canonical order team -> application -> deposit. This matches deadline
  -- workers and prevents the 18:45 result/expiry deadlock.
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
  JOIN public.tonight_teams AS team
    ON team.id = member.team_id
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
    application_id,
    user_id,
    amount,
    status,
    provider_order_id,
    idempotency_key
  )
  VALUES (
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
  JOIN public.tonight_teams AS team
    ON team.id = member.team_id
  WHERE member.application_id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit_application_not_allocated';
  END IF;
  v_team_id := v_team.id;

  -- Canonical lock order shared by payment, refund, and deadline paths.
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

  SELECT *
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = application_row.round_id;

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
    SET status = CASE
          WHEN v_team.status = 'cancelled' THEN 'refund_requested'
          ELSE p_status
        END,
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
    deposit_id,
    application_id,
    user_id,
    result_status,
    provider_order_id,
    provider_payment_key_hash,
    amount,
    idempotency_key
  )
  VALUES (
    v_deposit_id,
    p_application_id,
    p_user_id,
    p_status,
    pg_catalog.btrim(p_provider_order_id),
    p_provider_payment_key_hash,
    p_amount,
    p_idempotency_key
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
      deposit_id,
      requested_by,
      idempotency_key
    )
    VALUES (
      v_deposit_id,
      p_user_id,
      p_idempotency_key || ':late-charge-refund'
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

    IF v_paid_count = 5 THEN
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
          pg_catalog.jsonb_build_object('status', 'partner_pending', 'paid_count', 5),
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
    pg_catalog.hashtextextended(
      'tonight-round-transition:' || p_round_id::TEXT,
      0
    )
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

  -- If the allocator invocation failed entirely, do not leave submitted
  -- applicants in a permanent limbo. Close the round deterministically and
  -- retain them as waitlisted so the next-round recovery UI remains truthful.
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
      'round',
      p_round_id,
      'deposit_gate_expired',
      pg_catalog.to_jsonb(round_row),
      v_result,
      p_idempotency_key
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
    -- Lock after entering the cursor so the migration linter does not mistake
    -- the PL/pgSQL loop token for an UPDATE target.
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

    IF v_paid_count = 5 THEN
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
          deposit_id,
          requested_by,
          idempotency_key
        )
        VALUES (
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
      pg_catalog.jsonb_build_object(
        'status', 'cancelled',
        'paid_count', v_paid_count
      ),
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
    'round',
    p_round_id,
    'deposit_gate_expired',
    pg_catalog.to_jsonb(round_row),
    v_result,
    p_idempotency_key
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_expire_tonight_partner_acceptance_gate(
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
  v_cancelled_team_count INTEGER := 0;
  v_queued_refund_count INTEGER := 0;
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
    pg_catalog.hashtextextended(
      'tonight-round-transition:' || p_round_id::TEXT,
      0
    )
  );

  SELECT audit.*
  INTO audit_row
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'round'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF audit_row.entity_id <> p_round_id
      OR audit_row.action <> 'partner_acceptance_gate_expired' THEN
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
  IF CURRENT_TIMESTAMP < round_row.partner_acceptance_due_at THEN
    RAISE EXCEPTION 'partner_acceptance_gate_not_due';
  END IF;
  IF round_row.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'round_not_expirable';
  END IF;

  -- The final venue gate also clears any deposit-pending team left behind by a
  -- delayed earlier cron. This prevents paid users and reserved venue slots
  -- from becoming permanently stranded after the acceptance deadline.
  FOR team_row IN
    SELECT team.*
    FROM public.tonight_teams AS team
    WHERE team.round_id = p_round_id
      AND (team.status = 'partner_pending' OR team.status = 'deposit_pending')
    ORDER BY team.team_number
  LOOP
    PERFORM team.id
    FROM public.tonight_teams AS team
    WHERE team.id = team_row.id
    FOR UPDATE;

    -- A racing partner acceptance wins only if it committed before this team
    -- lock. Accepted teams are never cancelled by the expiry worker.
    IF EXISTS (
      SELECT 1
      FROM public.tonight_partner_acceptances AS acceptance
      WHERE acceptance.team_id = team_row.id
    ) THEN
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
          deposit_id,
          requested_by,
          idempotency_key
        )
        VALUES (
          deposit_row.id,
          deposit_row.user_id,
          p_idempotency_key || ':refund:' || deposit_row.id::TEXT
        )
        ON CONFLICT (deposit_id) DO NOTHING
        RETURNING id INTO v_refund_id;
        IF v_refund_id IS NOT NULL THEN
          v_queued_refund_count := v_queued_refund_count + 1;
        END IF;
      ELSIF deposit_row.status IN ('initiated', 'pending') THEN
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
    WHERE team.id = team_row.id
      AND (team.status = 'partner_pending' OR team.status = 'deposit_pending');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'partner_acceptance_gate_race';
    END IF;

    v_cancelled_team_count := v_cancelled_team_count + 1;
    PERFORM quantum_private.write_tonight_audit(
      'team',
      team_row.id,
      'unaccepted_team_cancelled',
      pg_catalog.to_jsonb(team_row),
      pg_catalog.jsonb_build_object('status', 'cancelled'),
      p_idempotency_key || ':team:' || team_row.id::TEXT
    );
  END LOOP;

  UPDATE public.tonight_rounds AS round_value
  SET status = CASE
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
    'round',
    p_round_id,
    'partner_acceptance_gate_expired',
    pg_catalog.to_jsonb(round_row),
    v_result,
    p_idempotency_key
  );
  RETURN v_result;
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

  SELECT *
  INTO v_team
  FROM public.tonight_teams AS team
  WHERE team.id = p_team_id
  FOR UPDATE;
  IF NOT FOUND OR v_team.venue_capacity_id IS NULL THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  SELECT *
  INTO v_capacity
  FROM public.tonight_venue_capacities AS capacity
  WHERE capacity.id = v_team.venue_capacity_id
  FOR UPDATE;
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
  IF v_member_count <> 5
    OR v_paid_count <> 5 THEN
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
  )
  VALUES (
    p_team_id,
    v_capacity.id,
    v_capacity.venue_snapshot_id,
    v_caller,
    5,
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

  INSERT INTO public.tonight_attendance (
    team_id,
    application_id,
    user_id
  )
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
      'venue_snapshot_id', v_capacity.venue_snapshot_id
    ),
    p_idempotency_key
  );
  RETURN v_acceptance_id;
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

  -- Lock both teams in deterministic UUID order so two operator actions cannot
  -- deadlock by presenting team A/B in the opposite order.
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
        'bundle_id', p_bundle_a_id,
        'revision', p_expected_team_a_revision
      )
      OR v_audit_a.after_state IS DISTINCT FROM pg_catalog.jsonb_build_object(
        'bundle_id', p_bundle_b_id,
        'revision', p_expected_team_a_revision + 1
      )
      OR v_audit_b.before_state IS DISTINCT FROM pg_catalog.jsonb_build_object(
        'bundle_id', p_bundle_b_id,
        'revision', p_expected_team_b_revision
      )
      OR v_audit_b.after_state IS DISTINCT FROM pg_catalog.jsonb_build_object(
        'bundle_id', p_bundle_a_id,
        'revision', p_expected_team_b_revision + 1
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

  SELECT COALESCE(pg_catalog.array_agg(member.application_id ORDER BY member.seat_number), ARRAY[]::UUID[])
  INTO v_team_a_remaining
  FROM public.tonight_team_members AS member
  WHERE member.team_id = p_team_a_id
    AND member.bundle_id <> p_bundle_a_id;
  SELECT COALESCE(pg_catalog.array_agg(member.application_id ORDER BY member.seat_number), ARRAY[]::UUID[])
  INTO v_team_b_remaining
  FROM public.tonight_team_members AS member
  WHERE member.team_id = p_team_b_id
    AND member.bundle_id <> p_bundle_b_id;

  v_team_a_final := v_team_a_remaining || v_bundle_b_apps;
  v_team_b_final := v_team_b_remaining || v_bundle_a_apps;
  IF pg_catalog.cardinality(v_team_a_final) <> 5
    OR pg_catalog.cardinality(v_team_b_final) <> 5 THEN
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
      p_team_a_id,
      application_row.round_id,
      application_row.id,
      application_row.user_id,
      application_row.bundle_id,
      v_seat
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
      p_team_b_id,
      application_row.round_id,
      application_row.id,
      application_row.user_id,
      application_row.bundle_id,
      v_seat
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
    'team',
    p_team_a_id,
    'friend_bundle_swap',
    pg_catalog.jsonb_build_object('bundle_id', p_bundle_a_id, 'revision', v_team_a.revision),
    pg_catalog.jsonb_build_object('bundle_id', p_bundle_b_id, 'revision', v_team_a.revision + 1),
    p_idempotency_key || ':team-a'
  );
  PERFORM quantum_private.write_tonight_audit(
    'team',
    p_team_b_id,
    'friend_bundle_swap',
    pg_catalog.jsonb_build_object('bundle_id', p_bundle_b_id, 'revision', v_team_b.revision),
    pg_catalog.jsonb_build_object('bundle_id', p_bundle_a_id, 'revision', v_team_b.revision + 1),
    p_idempotency_key || ':team-b'
  );
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_adjust_tonight_appearance_score(
  p_application_id UUID,
  p_appearance_score NUMERIC,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_feature quantum_private.tonight_applicant_features%ROWTYPE;
  audit_row quantum_private.tonight_audit_events%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_appearance_score < 0 OR p_appearance_score > 100 THEN
    RAISE EXCEPTION 'appearance_score_out_of_range';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-appearance-adjust-key:' || p_idempotency_key,
      0
    )
  );

  SELECT audit.* INTO audit_row
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'applicant_feature'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF audit_row.entity_id <> p_application_id
      OR audit_row.actor_user_id IS DISTINCT FROM v_caller
      OR audit_row.action <> 'appearance_score_adjusted'
      OR (audit_row.before_state ->> 'revision')::INTEGER <> p_expected_revision
      OR (audit_row.after_state ->> 'appearance_score')::NUMERIC <> p_appearance_score
      OR (audit_row.after_state ->> 'revision')::INTEGER <> p_expected_revision + 1 THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN (audit_row.after_state ->> 'appearance_score')::NUMERIC;
  END IF;

  SELECT *
  INTO v_feature
  FROM quantum_private.tonight_applicant_features AS feature
  WHERE feature.application_id = p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_application_not_found';
  END IF;
  IF v_feature.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision'
      USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || v_feature.revision;
  END IF;

  UPDATE quantum_private.tonight_applicant_features AS feature
  SET appearance_score = p_appearance_score,
      revision = feature.revision + 1,
      adjusted_at = CURRENT_TIMESTAMP,
      adjusted_by = v_caller
  WHERE feature.application_id = p_application_id
    AND feature.revision = p_expected_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'applicant_feature',
    p_application_id,
    'appearance_score_adjusted',
    pg_catalog.jsonb_build_object(
      'appearance_score', v_feature.appearance_score,
      'revision', v_feature.revision
    ),
    pg_catalog.jsonb_build_object(
      'appearance_score', p_appearance_score,
      'revision', v_feature.revision + 1
    ),
    p_idempotency_key
  );
  RETURN p_appearance_score;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_my_tonight_arrival(
  p_team_id UUID,
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
  attendance_row public.tonight_attendance%ROWTYPE;
  team_row public.tonight_teams%ROWTYPE;
  round_row public.tonight_rounds%ROWTYPE;
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

  SELECT team.*
  INTO team_row
  FROM public.tonight_teams AS team
  WHERE team.id = p_team_id
  FOR UPDATE OF team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  SELECT attendance.*
  INTO attendance_row
  FROM public.tonight_attendance AS attendance
  WHERE attendance.team_id = p_team_id
    AND attendance.user_id = v_caller
  FOR UPDATE OF attendance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;
  IF attendance_row.arrival_idempotency_key = p_idempotency_key
    AND attendance_row.status = 'arrived' THEN
    RETURN TRUE;
  END IF;
  IF attendance_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision'
      USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || attendance_row.revision;
  END IF;

  SELECT * INTO round_row
  FROM public.tonight_rounds AS round_value
  WHERE round_value.id = team_row.round_id;

  IF team_row.status NOT IN ('accepted', 'revealed', 'in_progress') THEN
    RAISE EXCEPTION 'team_not_revealed';
  END IF;
  IF CURRENT_TIMESTAMP < round_row.arrival_at
    OR CURRENT_TIMESTAMP >= round_row.starts_at + INTERVAL '2 hours' THEN
    RAISE EXCEPTION 'arrival_time_gate_closed';
  END IF;
  IF attendance_row.status <> 'pending' THEN
    RAISE EXCEPTION 'arrival_already_recorded';
  END IF;

  UPDATE public.tonight_attendance AS attendance
  SET status = 'arrived',
      revision = attendance.revision + 1,
      arrival_idempotency_key = p_idempotency_key,
      arrived_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE attendance.id = attendance_row.id
    AND attendance.revision = p_expected_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'attendance',
    attendance_row.id,
    'user_arrived',
    pg_catalog.to_jsonb(attendance_row),
    pg_catalog.jsonb_build_object(
      'status', 'arrived',
      'revision', attendance_row.revision + 1
    ),
    p_idempotency_key
  );
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_set_tonight_attendance(
  p_team_id UUID,
  p_user_id UUID,
  p_status TEXT,
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
  v_team public.tonight_teams%ROWTYPE;
  attendance_row public.tonight_attendance%ROWTYPE;
  v_confirmation public.tonight_partner_service_confirmations%ROWTYPE;
  v_settlement public.tonight_settlements%ROWTYPE;
  audit_row quantum_private.tonight_audit_events%ROWTYPE;
  v_new_revision INTEGER;
  v_observed_arrived_count INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_status NOT IN ('pending', 'arrived', 'no_show', 'excused') THEN
    RAISE EXCEPTION 'invalid_attendance_status';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-attendance-set-key:' || p_idempotency_key,
      0
    )
  );

  SELECT audit.*
  INTO audit_row
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'attendance'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF audit_row.actor_user_id IS DISTINCT FROM v_caller
      OR audit_row.action <> 'super_admin_attendance_set'
      OR (audit_row.before_state ->> 'revision')::INTEGER <> p_expected_revision
      OR audit_row.after_state ->> 'team_id' <> p_team_id::TEXT
      OR audit_row.after_state ->> 'user_id' <> p_user_id::TEXT
      OR audit_row.after_state ->> 'status' <> p_status
      OR (audit_row.after_state ->> 'revision')::INTEGER <> p_expected_revision + 1 THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN (audit_row.after_state ->> 'revision')::INTEGER;
  END IF;

  SELECT team.*
  INTO v_team
  FROM public.tonight_teams AS team
  WHERE team.id = p_team_id
  FOR UPDATE OF team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;

  SELECT attendance.*
  INTO attendance_row
  FROM public.tonight_attendance AS attendance
  WHERE attendance.team_id = p_team_id
    AND attendance.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_attendance_not_found';
  END IF;
  IF attendance_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision'
      USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || attendance_row.revision;
  END IF;

  UPDATE public.tonight_attendance AS attendance
  SET status = p_status,
      revision = attendance.revision + 1,
      arrived_at = CASE
        WHEN p_status = 'arrived' THEN COALESCE(attendance.arrived_at, CURRENT_TIMESTAMP)
        ELSE NULL
      END,
      updated_at = CURRENT_TIMESTAMP
  WHERE attendance.id = attendance_row.id
    AND attendance.revision = p_expected_revision
  RETURNING attendance.revision INTO v_new_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_observed_arrived_count
  FROM public.tonight_attendance AS attendance
  WHERE attendance.team_id = p_team_id
    AND attendance.status = 'arrived';

  SELECT confirmation.*
  INTO v_confirmation
  FROM public.tonight_partner_service_confirmations AS confirmation
  WHERE confirmation.team_id = p_team_id
  FOR UPDATE OF confirmation;
  IF FOUND AND v_confirmation.observed_arrived_count <> v_observed_arrived_count THEN
    UPDATE public.tonight_partner_service_confirmations AS confirmation
    SET observed_arrived_count = v_observed_arrived_count,
        revision = confirmation.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE confirmation.id = v_confirmation.id;

    PERFORM quantum_private.write_tonight_audit(
      'service_confirmation',
      v_confirmation.id,
      'attendance_observation_corrected',
      pg_catalog.to_jsonb(v_confirmation),
      pg_catalog.jsonb_build_object(
        'confirmed_attendee_count', v_confirmation.confirmed_attendee_count,
        'observed_arrived_count', v_observed_arrived_count,
        'revision', v_confirmation.revision + 1
      ),
      p_idempotency_key || ':service-confirmation'
    );
  END IF;

  SELECT settlement.*
  INTO v_settlement
  FROM public.tonight_settlements AS settlement
  WHERE settlement.team_id = p_team_id
  FOR UPDATE OF settlement;
  IF FOUND
    AND v_settlement.confirmed_attendee_count <> v_observed_arrived_count
    AND v_settlement.status <> 'disputed' THEN
    UPDATE public.tonight_settlements AS settlement
    SET status = 'disputed',
        revision = settlement.revision + 1
    WHERE settlement.id = v_settlement.id;

    PERFORM quantum_private.write_tonight_audit(
      'settlement',
      v_settlement.id,
      'attendance_correction_disputed_settlement',
      pg_catalog.to_jsonb(v_settlement),
      pg_catalog.jsonb_build_object(
        'status', 'disputed',
        'confirmed_attendee_count', v_settlement.confirmed_attendee_count,
        'observed_arrived_count', v_observed_arrived_count,
        'revision', v_settlement.revision + 1
      ),
      p_idempotency_key || ':settlement'
    );
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'attendance',
    attendance_row.id,
    'super_admin_attendance_set',
    pg_catalog.to_jsonb(attendance_row),
    pg_catalog.jsonb_build_object(
      'team_id', p_team_id,
      'user_id', p_user_id,
      'status', p_status,
      'revision', v_new_revision
    ),
    p_idempotency_key
  );
  RETURN v_new_revision;
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
  IF p_confirmed_attendee_count < 0 OR p_confirmed_attendee_count > 5 THEN
    RAISE EXCEPTION 'invalid_confirmed_attendee_count';
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

  SELECT * INTO v_team
  FROM public.tonight_teams AS team
  WHERE team.id = p_team_id
  FOR UPDATE;
  IF NOT FOUND OR v_team.venue_capacity_id IS NULL THEN
    RAISE EXCEPTION 'tonight_team_not_found';
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

  -- Arrival and service completion share the team-first lock order. Lock all
  -- five attendance rows before deriving the billable headcount so a late
  -- concurrent arrival cannot be lost between COUNT and completion.
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
  FOR UPDATE;

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
    )
    VALUES (
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

CREATE OR REPLACE FUNCTION public.service_finalize_tonight_settlement(
  p_team_id UUID,
  p_fee_per_attendee INTEGER,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_confirmation public.tonight_partner_service_confirmations%ROWTYPE;
  v_settlement public.tonight_settlements%ROWTYPE;
  v_settlement_id UUID;
  v_observed_arrived_count INTEGER;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_fee_per_attendee < 0 THEN
    RAISE EXCEPTION 'invalid_fee_per_attendee';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  SELECT *
  INTO v_confirmation
  FROM public.tonight_partner_service_confirmations AS confirmation
  WHERE confirmation.team_id = p_team_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partner_confirmation_required';
  END IF;

  SELECT COUNT(*)
  INTO v_observed_arrived_count
  FROM public.tonight_attendance AS attendance
  WHERE attendance.team_id = p_team_id
    AND attendance.status = 'arrived';
  IF v_observed_arrived_count <> v_confirmation.confirmed_attendee_count THEN
    RAISE EXCEPTION 'attendance_reconciliation_required';
  END IF;

  INSERT INTO public.tonight_settlements (
    team_id,
    venue_id,
    confirmed_attendee_count,
    fee_per_attendee,
    idempotency_key
  )
  VALUES (
    p_team_id,
    v_confirmation.venue_id,
    v_confirmation.confirmed_attendee_count,
    p_fee_per_attendee,
    p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_settlement_id;

  IF v_settlement_id IS NULL THEN
    SELECT *
    INTO v_settlement
    FROM public.tonight_settlements AS settlement
    WHERE settlement.idempotency_key = p_idempotency_key;
    IF NOT FOUND
      OR v_settlement.team_id <> p_team_id
      OR v_settlement.fee_per_attendee <> p_fee_per_attendee
      OR v_settlement.confirmed_attendee_count <> v_confirmation.confirmed_attendee_count THEN
      RAISE EXCEPTION 'settlement_result_conflict';
    END IF;
    RETURN v_settlement.id;
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'settlement',
    v_settlement_id,
    'settlement_finalized',
    NULL,
    pg_catalog.jsonb_build_object(
      'confirmed_attendee_count', v_confirmation.confirmed_attendee_count,
      'fee_per_attendee', p_fee_per_attendee,
      'total_fee', v_confirmation.confirmed_attendee_count * p_fee_per_attendee
    ),
    p_idempotency_key
  );
  RETURN v_settlement_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'settlement_already_finalized';
END;
$$;

CREATE OR REPLACE FUNCTION public.request_my_tonight_refund(
  p_application_id UUID,
  p_expected_deposit_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_deposit public.tonight_deposits%ROWTYPE;
  v_application public.tonight_applications%ROWTYPE;
  v_team public.tonight_teams%ROWTYPE;
  v_round public.tonight_rounds%ROWTYPE;
  v_team_id UUID;
  v_request_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_expected_deposit_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  SELECT request.id
  INTO v_request_id
  FROM public.tonight_deposit_refund_requests AS request
  JOIN public.tonight_deposits AS deposit
    ON deposit.id = request.deposit_id
  WHERE request.idempotency_key = p_idempotency_key
    AND deposit.application_id = p_application_id
    AND deposit.user_id = v_caller;
  IF FOUND THEN
    RETURN v_request_id;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.tonight_deposit_refund_requests AS request
    WHERE request.idempotency_key = p_idempotency_key
  ) THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;
  SELECT application_row.*
  INTO v_application
  FROM public.tonight_applications AS application_row
  WHERE application_row.id = p_application_id
    AND application_row.user_id = v_caller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit_not_refundable';
  END IF;

  SELECT team.*
  INTO v_team
  FROM public.tonight_team_members AS member
  JOIN public.tonight_teams AS team ON team.id = member.team_id
  WHERE member.application_id = p_application_id
    AND member.user_id = v_caller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit_not_refundable';
  END IF;
  v_team_id := v_team.id;

  -- Use the same team -> application -> deposit lock order as the payment and
  -- deadline paths so a cancellation cannot deadlock a provider callback.
  SELECT team.*
  INTO v_team
  FROM public.tonight_teams AS team
  WHERE team.id = v_team_id
  FOR UPDATE OF team;

  SELECT application_row.*
  INTO v_application
  FROM public.tonight_applications AS application_row
  WHERE application_row.id = p_application_id
    AND application_row.user_id = v_caller
  FOR UPDATE OF application_row;
  IF NOT FOUND OR v_application.status <> 'allocated'
    OR NOT EXISTS (
      SELECT 1
      FROM public.tonight_team_members AS member
      WHERE member.team_id = v_team_id
        AND member.application_id = p_application_id
        AND member.user_id = v_caller
    ) THEN
    RAISE EXCEPTION 'deposit_not_refundable';
  END IF;

  SELECT deposit.*
  INTO v_deposit
  FROM public.tonight_deposits AS deposit
  WHERE deposit.application_id = p_application_id
    AND deposit.user_id = v_caller
  FOR UPDATE OF deposit;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_deposit_not_found';
  END IF;

  -- The queue permits one refund lifecycle per immutable deposit. A retry may
  -- arrive with a fresh request idempotency key after the deposit revision was
  -- advanced by the first request; return the already-owned queue row rather
  -- than failing the UNIQUE(deposit_id) invariant.
  SELECT request.id
  INTO v_request_id
  FROM public.tonight_deposit_refund_requests AS request
  WHERE request.deposit_id = v_deposit.id;
  IF FOUND THEN
    RETURN v_request_id;
  END IF;

  IF v_deposit.revision <> p_expected_deposit_revision THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;
  IF v_deposit.status NOT IN ('paid', 'held') THEN
    RAISE EXCEPTION 'deposit_not_refundable';
  END IF;

  SELECT round_row.*
  INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = v_team.round_id;

  -- A participant may withdraw only while the team is still collecting its
  -- five deposits. Once the team commits to a venue, or any on-site/service
  -- record exists, the business-protection path is no longer self-service.
  IF v_team.status <> 'deposit_pending'
    OR CURRENT_TIMESTAMP >= v_round.deposit_due_at
    OR EXISTS (
      SELECT 1
      FROM public.tonight_partner_acceptances AS acceptance
      WHERE acceptance.team_id = v_team.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.tonight_partner_service_confirmations AS confirmation
      WHERE confirmation.team_id = v_team.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.tonight_settlements AS settlement
      WHERE settlement.team_id = v_team.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.tonight_attendance AS attendance
      WHERE attendance.application_id = p_application_id
        AND attendance.status <> 'pending'
    ) THEN
    RAISE EXCEPTION 'deposit_not_refundable';
  END IF;

  INSERT INTO public.tonight_deposit_refund_requests (
    deposit_id,
    requested_by,
    idempotency_key
  )
  VALUES (v_deposit.id, v_caller, p_idempotency_key)
  ON CONFLICT (deposit_id) DO NOTHING
  RETURNING id INTO v_request_id;
  IF v_request_id IS NULL THEN
    SELECT request.id INTO v_request_id
    FROM public.tonight_deposit_refund_requests AS request
    WHERE request.deposit_id = v_deposit.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_request_id;
  END IF;

  UPDATE public.tonight_deposits AS deposit
  SET status = 'refund_requested',
      revision = deposit.revision + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE deposit.id = v_deposit.id
    AND deposit.revision = p_expected_deposit_revision;

  PERFORM quantum_private.write_tonight_audit(
    'deposit',
    v_deposit.id,
    'refund_requested',
    pg_catalog.to_jsonb(v_deposit),
    pg_catalog.jsonb_build_object('status', 'refund_requested'),
    p_idempotency_key
  );
  RETURN v_request_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'idempotency_conflict';
END;
$$;

CREATE OR REPLACE FUNCTION public.service_claim_tonight_refund_requests(
  p_lease_id UUID,
  p_limit INTEGER DEFAULT 5,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
  request_id UUID,
  deposit_id UUID,
  application_id UUID,
  user_id UUID,
  amount INTEGER,
  provider_order_id TEXT,
  provider_payment_key_hash TEXT,
  request_revision INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_lease_id IS NULL THEN
    RAISE EXCEPTION 'lease_id_required';
  END IF;
  IF p_limit IS NULL OR p_lease_seconds IS NULL THEN
    RAISE EXCEPTION 'invalid_lease_options';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tonight_deposit_refund_requests AS request
    WHERE request.status = 'processing'
      AND request.settlement_lease_id = p_lease_id
      AND request.settlement_lease_expires_at > CURRENT_TIMESTAMP
  ) THEN
    RETURN QUERY
    SELECT
      request.id,
      deposit.id,
      deposit.application_id,
      deposit.user_id,
      deposit.amount,
      deposit.provider_order_id,
      deposit.provider_payment_key_hash,
      request.revision
    FROM public.tonight_deposit_refund_requests AS request
    JOIN public.tonight_deposits AS deposit
      ON deposit.id = request.deposit_id
    WHERE request.status = 'processing'
      AND request.settlement_lease_id = p_lease_id
      AND request.settlement_lease_expires_at > CURRENT_TIMESTAMP
    ORDER BY request.requested_at, request.id;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.tonight_deposit_refund_requests AS request
  SET status = 'processing',
      settlement_lease_id = p_lease_id,
      settlement_lease_expires_at = CURRENT_TIMESTAMP
        + pg_catalog.make_interval(secs => LEAST(GREATEST(p_lease_seconds, 30), 600)),
      settlement_attempt_count = request.settlement_attempt_count + 1,
      settlement_last_error = NULL,
      settlement_next_retry_at = NULL,
      revision = request.revision + 1
  FROM public.tonight_deposits AS deposit
  WHERE deposit.id = request.deposit_id
    AND request.id IN (
      SELECT candidate.id
      FROM public.tonight_deposit_refund_requests AS candidate
      JOIN public.tonight_deposits AS candidate_deposit
        ON candidate_deposit.id = candidate.deposit_id
      WHERE candidate.status IN ('requested', 'failed', 'processing')
        AND candidate_deposit.status = 'refund_requested'
        AND candidate.settlement_attempt_count < 10
        AND COALESCE(candidate.settlement_next_retry_at, candidate.requested_at)
          <= CURRENT_TIMESTAMP
        AND (
          candidate.settlement_lease_expires_at IS NULL
          OR candidate.settlement_lease_expires_at <= CURRENT_TIMESTAMP
        )
      ORDER BY candidate.requested_at, candidate.id
      FOR UPDATE OF candidate SKIP LOCKED
      LIMIT LEAST(GREATEST(p_limit, 1), 20)
    )
  RETURNING
    request.id,
    deposit.id,
    deposit.application_id,
    deposit.user_id,
    deposit.amount,
    deposit.provider_order_id,
    deposit.provider_payment_key_hash,
    request.revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_release_tonight_refund_request(
  p_request_id UUID,
  p_lease_id UUID,
  p_error TEXT,
  p_retry_after_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_id UUID;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_request_id IS NULL OR p_lease_id IS NULL THEN
    RAISE EXCEPTION 'lease_identity_required';
  END IF;
  IF p_retry_after_seconds IS NULL THEN
    RAISE EXCEPTION 'retry_after_required';
  END IF;

  UPDATE public.tonight_deposit_refund_requests AS request
  SET status = 'failed',
      settlement_lease_id = NULL,
      settlement_lease_expires_at = NULL,
      settlement_last_error = pg_catalog.left(
        COALESCE(NULLIF(pg_catalog.btrim(p_error), ''), 'unknown_error'),
        500
      ),
      settlement_next_retry_at = CURRENT_TIMESTAMP
        + pg_catalog.make_interval(
          secs => LEAST(GREATEST(p_retry_after_seconds, 60), 86400)
        ),
      revision = request.revision + 1
  WHERE request.id = p_request_id
    AND request.status = 'processing'
    AND request.settlement_lease_id = p_lease_id
  RETURNING request.id INTO v_request_id;

  IF v_request_id IS NOT NULL THEN
    PERFORM quantum_private.write_tonight_audit(
      'refund_request',
      v_request_id,
      'refund_worker_released',
      NULL,
      pg_catalog.jsonb_build_object('status', 'failed'),
      NULL
    );
  END IF;
  RETURN v_request_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_finalize_tonight_refund_request(
  p_request_id UUID,
  p_lease_id UUID,
  p_expected_revision INTEGER,
  p_provider_order_id TEXT,
  p_provider_payment_key_hash TEXT,
  p_provider_refund_transaction_key TEXT,
  p_refunded_amount INTEGER,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request_row public.tonight_deposit_refund_requests%ROWTYPE;
  deposit_row public.tonight_deposits%ROWTYPE;
  audit_row quantum_private.tonight_audit_events%ROWTYPE;
  v_before_request JSONB;
  v_before_deposit JSONB;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_lease_id IS NULL THEN
    RAISE EXCEPTION 'lease_id_required';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF p_provider_order_id IS NULL OR pg_catalog.btrim(p_provider_order_id) = ''
    OR p_provider_payment_key_hash IS NULL
    OR pg_catalog.btrim(p_provider_payment_key_hash) = ''
    OR p_provider_refund_transaction_key IS NULL
    OR pg_catalog.btrim(p_provider_refund_transaction_key) = '' THEN
    RAISE EXCEPTION 'provider_refund_evidence_required';
  END IF;
  IF p_refunded_amount <> public.tonight_deposit_amount() THEN
    RAISE EXCEPTION 'invalid_refunded_amount';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-refund-finalize-key:' || p_idempotency_key,
      0
    )
  );

  SELECT request.*
  INTO request_row
  FROM public.tonight_deposit_refund_requests AS request
  WHERE request.finalize_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT audit.* INTO audit_row
    FROM quantum_private.tonight_audit_events AS audit
    WHERE audit.entity_type = 'refund_request'
      AND audit.idempotency_key = p_idempotency_key;

    IF NOT FOUND
      OR audit_row.entity_id <> p_request_id
      OR audit_row.action <> 'refund_finalized'
      OR audit_row.actor_user_id IS NOT NULL
      OR audit_row.actor_kind <> 'service'
      OR audit_row.before_state ->> 'settlement_lease_id' <> p_lease_id::TEXT
      OR (audit_row.before_state ->> 'revision')::INTEGER <> p_expected_revision
      OR audit_row.after_state ->> 'status' <> 'completed'
      OR (audit_row.after_state ->> 'revision')::INTEGER <> p_expected_revision + 1
      OR request_row.id <> p_request_id
      OR COALESCE(request_row.provider_order_id, '')
        <> COALESCE(pg_catalog.btrim(p_provider_order_id), '')
      OR COALESCE(request_row.provider_payment_key_hash, '')
        <> COALESCE(p_provider_payment_key_hash, '')
      OR request_row.provider_refund_transaction_key
        <> pg_catalog.btrim(p_provider_refund_transaction_key)
      OR request_row.refunded_amount <> p_refunded_amount THEN
      RAISE EXCEPTION 'refund_finalize_conflict';
    END IF;
    RETURN request_row.id;
  END IF;

  SELECT request.*
  INTO request_row
  FROM public.tonight_deposit_refund_requests AS request
  WHERE request.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_refund_request_not_found';
  END IF;
  IF request_row.settlement_lease_id IS NULL
    OR request_row.settlement_lease_id <> p_lease_id
    OR request_row.settlement_lease_expires_at IS NULL
    OR request_row.settlement_lease_expires_at <= CURRENT_TIMESTAMP
    OR request_row.status <> 'processing' THEN
    RAISE EXCEPTION 'refund_lease_not_held';
  END IF;
  IF request_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision'
      USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || request_row.revision;
  END IF;

  SELECT deposit.*
  INTO deposit_row
  FROM public.tonight_deposits AS deposit
  WHERE deposit.id = request_row.deposit_id
  FOR UPDATE;
  IF NOT FOUND OR deposit_row.status <> 'refund_requested' THEN
    RAISE EXCEPTION 'deposit_not_refundable';
  END IF;
  IF COALESCE(deposit_row.provider_order_id, '')
      <> COALESCE(pg_catalog.btrim(p_provider_order_id), '')
    OR COALESCE(deposit_row.provider_payment_key_hash, '')
      <> COALESCE(p_provider_payment_key_hash, '')
    OR deposit_row.amount <> p_refunded_amount THEN
    RAISE EXCEPTION 'provider_refund_evidence_mismatch';
  END IF;

  v_before_request := pg_catalog.to_jsonb(request_row);
  v_before_deposit := pg_catalog.to_jsonb(deposit_row);
  UPDATE public.tonight_deposit_refund_requests AS request
  SET status = 'completed',
      settlement_lease_id = NULL,
      settlement_lease_expires_at = NULL,
      settlement_last_error = NULL,
      settlement_next_retry_at = NULL,
      provider_order_id = pg_catalog.btrim(p_provider_order_id),
      provider_payment_key_hash = p_provider_payment_key_hash,
      provider_refund_transaction_key = pg_catalog.btrim(p_provider_refund_transaction_key),
      refunded_amount = p_refunded_amount,
      finalize_idempotency_key = p_idempotency_key,
      revision = request.revision + 1,
      resolved_at = CURRENT_TIMESTAMP
  WHERE request.id = p_request_id
    AND request.revision = p_expected_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  UPDATE public.tonight_deposits AS deposit
  SET status = 'refunded',
      revision = deposit.revision + 1,
      refunded_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE deposit.id = deposit_row.id;

  PERFORM quantum_private.write_tonight_audit(
    'refund_request',
    p_request_id,
    'refund_finalized',
    v_before_request,
    pg_catalog.jsonb_build_object(
      'status', 'completed',
      'refunded_amount', p_refunded_amount,
      'revision', p_expected_revision + 1
    ),
    p_idempotency_key
  );
  PERFORM quantum_private.write_tonight_audit(
    'deposit',
    deposit_row.id,
    'refund_finalized',
    v_before_deposit,
    pg_catalog.jsonb_build_object(
      'status', 'refunded',
      'refunded_amount', p_refunded_amount,
      'revision', deposit_row.revision + 1
    ),
    p_idempotency_key
  );
  RETURN p_request_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'refund_finalize_conflict';
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_retry_tonight_refund(
  p_request_id UUID,
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
  request_row public.tonight_deposit_refund_requests%ROWTYPE;
  audit_row quantum_private.tonight_audit_events%ROWTYPE;
  v_new_revision INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-refund-retry-key:' || p_idempotency_key,
      0
    )
  );

  SELECT audit.*
  INTO audit_row
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = 'refund_request'
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF audit_row.entity_id <> p_request_id
      OR audit_row.actor_user_id IS DISTINCT FROM v_caller
      OR audit_row.action <> 'dead_letter_retry_requested'
      OR (audit_row.before_state ->> 'revision')::INTEGER <> p_expected_revision
      OR audit_row.after_state ->> 'status' <> 'requested'
      OR (audit_row.after_state ->> 'settlement_attempt_count')::INTEGER <> 0
      OR (audit_row.after_state ->> 'revision')::INTEGER <> p_expected_revision + 1 THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN (audit_row.after_state ->> 'revision')::INTEGER;
  END IF;

  SELECT request.*
  INTO request_row
  FROM public.tonight_deposit_refund_requests AS request
  WHERE request.id = p_request_id
  FOR UPDATE OF request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_refund_request_not_found';
  END IF;
  IF request_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision'
      USING DETAIL = 'expected=' || p_expected_revision || ';actual=' || request_row.revision;
  END IF;
  IF request_row.status <> 'failed'
    OR request_row.settlement_attempt_count < 10
    OR NOT EXISTS (
      SELECT 1
      FROM public.tonight_deposits AS deposit
      WHERE deposit.id = request_row.deposit_id
        AND deposit.status = 'refund_requested'
    ) THEN
    RAISE EXCEPTION 'refund_not_dead_lettered';
  END IF;

  UPDATE public.tonight_deposit_refund_requests AS request
  SET status = 'requested',
      settlement_lease_id = NULL,
      settlement_lease_expires_at = NULL,
      settlement_attempt_count = 0,
      settlement_last_error = NULL,
      settlement_next_retry_at = CURRENT_TIMESTAMP,
      revision = request.revision + 1
  WHERE request.id = p_request_id
    AND request.revision = p_expected_revision
  RETURNING request.revision INTO v_new_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'refund_request',
    p_request_id,
    'dead_letter_retry_requested',
    pg_catalog.to_jsonb(request_row),
    pg_catalog.jsonb_build_object(
      'status', 'requested',
      'settlement_attempt_count', 0,
      'revision', v_new_revision
    ),
    p_idempotency_key
  );
  RETURN v_new_revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_tonight_incident_report(
  p_team_id UUID,
  p_subject_user_id UUID,
  p_category TEXT,
  p_description TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_report_id UUID;
  v_report public.tonight_incident_reports%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tonight_team_members AS member
    WHERE member.team_id = p_team_id
      AND member.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'tonight_team_not_found';
  END IF;
  IF p_subject_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tonight_team_members AS member
    WHERE member.team_id = p_team_id
      AND member.user_id = p_subject_user_id
  ) THEN
    RAISE EXCEPTION 'report_subject_not_in_team';
  END IF;

  INSERT INTO public.tonight_incident_reports (
    team_id,
    reporter_user_id,
    subject_user_id,
    category,
    description,
    idempotency_key
  )
  VALUES (
    p_team_id,
    v_caller,
    p_subject_user_id,
    p_category,
    pg_catalog.btrim(p_description),
    p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_report_id;
  IF v_report_id IS NULL THEN
    SELECT report.* INTO v_report
    FROM public.tonight_incident_reports AS report
    WHERE report.idempotency_key = p_idempotency_key;
    IF NOT FOUND
      OR v_report.reporter_user_id <> v_caller
      OR v_report.team_id <> p_team_id
      OR (
        (v_report.subject_user_id IS NULL) <> (p_subject_user_id IS NULL)
        OR (
          v_report.subject_user_id IS NOT NULL
          AND v_report.subject_user_id <> p_subject_user_id
        )
      )
      OR v_report.category <> p_category
      OR v_report.description <> pg_catalog.btrim(p_description) THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    v_report_id := v_report.id;
  END IF;
  RETURN v_report_id;
END;
$$;

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
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tonight_team_members AS member
    WHERE member.team_id = p_team_id
      AND member.user_id = p_subject_user_id
  ) THEN
    RAISE EXCEPTION 'team_member_not_found';
  END IF;

  INSERT INTO quantum_private.tonight_call_attempts (
    team_id,
    subject_user_id,
    attempted_by,
    outcome,
    idempotency_key
  )
  VALUES (p_team_id, p_subject_user_id, v_caller, p_outcome, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_attempt_id;
  IF v_attempt_id IS NULL THEN
    SELECT attempt.* INTO v_attempt
    FROM quantum_private.tonight_call_attempts AS attempt
    WHERE attempt.idempotency_key = p_idempotency_key;
    IF NOT FOUND
      OR v_attempt.attempted_by <> v_caller
      OR v_attempt.team_id <> p_team_id
      OR v_attempt.subject_user_id <> p_subject_user_id
      OR v_attempt.outcome <> p_outcome THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    v_attempt_id := v_attempt.id;
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'call_attempt',
    v_attempt_id,
    'call_attempt_recorded',
    NULL,
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

CREATE OR REPLACE FUNCTION public.get_current_tonight_round()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_round public.tonight_rounds%ROWTYPE;
  v_application public.tonight_applications%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT round_row.*
  INTO v_round
  FROM public.tonight_rounds AS round_row
  JOIN public.tonight_market_memberships AS membership
    ON membership.market_code = round_row.market_code
    AND membership.user_id = v_caller
    AND membership.revoked_at IS NULL
  WHERE round_row.status NOT IN ('completed', 'cancelled')
    AND round_row.market_code = 'PNU'
    AND round_row.starts_at > CURRENT_TIMESTAMP - INTERVAL '2 hours'
  ORDER BY round_row.starts_at ASC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF (
    SELECT COUNT(*)
    FROM public.tonight_round_activities AS activity
    WHERE activity.round_id = v_round.id
  ) <> 3 THEN
    RAISE EXCEPTION 'activity_count_invalid';
  END IF;

  SELECT *
  INTO v_application
  FROM public.tonight_applications AS application_row
  WHERE application_row.round_id = v_round.id
    AND application_row.user_id = v_caller;

  RETURN pg_catalog.jsonb_build_object(
    'round', pg_catalog.jsonb_build_object(
      'id', v_round.id,
      'market_code', v_round.market_code,
      'service_date', v_round.service_date,
      'status', v_round.status,
      'signup_open_at', v_round.signup_open_at,
      'signup_close_at', v_round.signup_close_at,
      'capacity_lock_at', v_round.capacity_lock_at,
      'allocation_publish_at', v_round.allocation_publish_at,
      'deposit_due_at', v_round.deposit_due_at,
      'partner_acceptance_due_at', v_round.partner_acceptance_due_at,
      'reveal_at', v_round.reveal_at,
      'arrival_at', v_round.arrival_at,
      'starts_at', v_round.starts_at
    ),
    'activities', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', activity.id,
          'slot', activity.slot,
          'title', activity.title,
          'kind', activity.activity_kind,
          'description', activity.description,
          'image_url', activity.image_url,
          'duration_minutes', activity.duration_minutes
        ) ORDER BY activity.slot
      )
      FROM public.tonight_round_activities AS activity
      WHERE activity.round_id = v_round.id
    ),
    'application', CASE WHEN v_application.id IS NULL THEN NULL ELSE
      pg_catalog.jsonb_build_object(
        'id', v_application.id,
        'status', v_application.status,
        'revision', v_application.revision,
        'bundle', (
          SELECT pg_catalog.jsonb_build_object(
            'id', bundle.id,
            'invite_code', bundle.invite_code,
            'status', bundle.status,
            'max_size', bundle.max_size,
            'member_count', (
              SELECT COUNT(*)
              FROM public.tonight_friend_bundle_members AS member
              WHERE member.bundle_id = bundle.id
            )
          )
          FROM public.tonight_friend_bundles AS bundle
          WHERE bundle.id = v_application.bundle_id
        ),
        'choices', (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'activity_id', choice.activity_id,
              'rank', choice.rank
            ) ORDER BY choice.rank
          )
          FROM public.tonight_application_choices AS choice
          WHERE choice.application_id = v_application.id
        ),
        'deposit', (
          SELECT pg_catalog.jsonb_build_object(
            'status', deposit.status,
            'amount', deposit.amount,
            'revision', deposit.revision,
            'refund_status', (
              SELECT request.status
              FROM public.tonight_deposit_refund_requests AS request
              WHERE request.deposit_id = deposit.id
            ),
            'refund_revision', (
              SELECT request.revision
              FROM public.tonight_deposit_refund_requests AS request
              WHERE request.deposit_id = deposit.id
            )
          )
          FROM public.tonight_deposits AS deposit
          WHERE deposit.application_id = v_application.id
        )
      )
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_get_current_tonight_setup()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_round_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.venue_partner_memberships AS membership
    WHERE membership.user_id = v_caller
      AND membership.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'venue_partner_required';
  END IF;

  SELECT round_row.id
  INTO v_round_id
  FROM public.tonight_rounds AS round_row
  WHERE round_row.market_code = 'PNU'
    AND round_row.status NOT IN ('completed', 'cancelled')
    AND round_row.starts_at > CURRENT_TIMESTAMP - INTERVAL '2 hours'
  ORDER BY round_row.starts_at
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN public.partner_get_tonight_setup(v_round_id);
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
                'id', capacity.id,
                'activity_id', capacity.activity_id,
                'team_capacity', capacity.team_capacity,
                'reserved_team_count', capacity.reserved_team_count,
                'status', capacity.status,
                'revision', capacity.revision
              ) ORDER BY capacity.activity_id
            )
            FROM public.tonight_venue_capacities AS capacity
            WHERE capacity.round_id = p_round_id
              AND capacity.venue_id = membership.venue_id
          ), '[]'::JSONB)
        ) ORDER BY membership.venue_id
      )
      FROM public.venue_partner_memberships AS membership
      JOIN LATERAL (
        SELECT snapshot_row.*
        FROM public.venue_snapshots AS snapshot_row
        WHERE snapshot_row.venue_id = membership.venue_id
        ORDER BY snapshot_row.created_at DESC
        LIMIT 1
      ) AS snapshot ON TRUE
      WHERE membership.user_id = v_caller
        AND membership.revoked_at IS NULL
    ), '[]'::JSONB)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_tonight_rounds()
RETURNS JSONB
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
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  RETURN COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', round_row.id,
        'market_code', round_row.market_code,
        'service_date', round_row.service_date,
        'status', round_row.status,
        'signup_close_at', round_row.signup_close_at,
        'capacity_lock_at', round_row.capacity_lock_at,
        'allocation_publish_at', round_row.allocation_publish_at,
        'deposit_due_at', round_row.deposit_due_at,
        'partner_acceptance_due_at', round_row.partner_acceptance_due_at,
        'reveal_at', round_row.reveal_at,
        'arrival_at', round_row.arrival_at,
        'starts_at', round_row.starts_at,
        'application_count', (
          SELECT COUNT(*) FROM public.tonight_applications AS application_row
          WHERE application_row.round_id = round_row.id
        ),
        'male_application_count', (
          SELECT COUNT(*)
          FROM public.tonight_applications AS application_row
          JOIN quantum_private.tonight_applicant_features AS feature
            ON feature.application_id = application_row.id
          WHERE application_row.round_id = round_row.id
            AND feature.gender_code = 'male'
        ),
        'female_application_count', (
          SELECT COUNT(*)
          FROM public.tonight_applications AS application_row
          JOIN quantum_private.tonight_applicant_features AS feature
            ON feature.application_id = application_row.id
          WHERE application_row.round_id = round_row.id
            AND feature.gender_code = 'female'
        ),
        'waitlisted_count', (
          SELECT COUNT(*) FROM public.tonight_applications AS application_row
          WHERE application_row.round_id = round_row.id
            AND application_row.status = 'waitlisted'
        ),
        'settlement_exception_count', (
          (
            SELECT COUNT(*)
            FROM public.tonight_teams AS team
            JOIN public.tonight_team_members AS member ON member.team_id = team.id
            JOIN public.tonight_deposits AS deposit ON deposit.application_id = member.application_id
            WHERE team.round_id = round_row.id
              AND deposit.status = 'reconciliation_required'
          ) + (
            SELECT COUNT(*)
            FROM public.tonight_teams AS team
            JOIN public.tonight_settlements AS settlement ON settlement.team_id = team.id
            WHERE team.round_id = round_row.id
              AND settlement.status = 'disputed'
          ) + (
            SELECT COUNT(*)
            FROM public.tonight_teams AS team
            JOIN public.tonight_partner_service_confirmations AS confirmation
              ON confirmation.team_id = team.id
            WHERE team.round_id = round_row.id
              AND confirmation.confirmed_attendee_count <> (
                SELECT COUNT(*)
                FROM public.tonight_attendance AS attendance
                WHERE attendance.team_id = team.id
                  AND attendance.status = 'arrived'
              )
          ) + (
            SELECT COUNT(*)
            FROM public.tonight_teams AS team
            JOIN public.tonight_team_members AS member ON member.team_id = team.id
            JOIN public.tonight_deposits AS deposit ON deposit.application_id = member.application_id
            JOIN public.tonight_deposit_refund_requests AS refund_request
              ON refund_request.deposit_id = deposit.id
            WHERE team.round_id = round_row.id
              AND refund_request.status = 'failed'
              AND refund_request.settlement_attempt_count >= 10
          )
        )
      ) ORDER BY round_row.starts_at DESC
    )
    FROM public.tonight_rounds AS round_row
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tonight_active_exceptions(
  p_round_id UUID
)
RETURNS TABLE (
  exception_kind TEXT,
  exception_team_id UUID,
  exception_team_code TEXT,
  subject_user_id UUID,
  subject_display_name TEXT,
  subject_phone TEXT,
  reporter_user_id UUID,
  reporter_display_name TEXT,
  reporter_phone TEXT,
  report_id UUID,
  report_category TEXT,
  exception_status TEXT,
  refund_request_id UUID,
  refund_request_revision INTEGER
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
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  RETURN QUERY
  SELECT
    'missing_arrival'::TEXT,
    team.id,
    team.team_code,
    attendance.user_id,
    profile.display_name,
    user_row.phone,
    NULL::UUID,
    NULL::TEXT,
    NULL::TEXT,
    NULL::UUID,
    NULL::TEXT,
    attendance.status,
    NULL::UUID,
    NULL::INTEGER
  FROM public.tonight_attendance AS attendance
  JOIN public.tonight_teams AS team ON team.id = attendance.team_id
  JOIN public.tonight_rounds AS round_row ON round_row.id = team.round_id
  JOIN public.users AS user_row ON user_row.id = attendance.user_id
  LEFT JOIN public.profiles AS profile ON profile.user_id = attendance.user_id
  WHERE team.round_id = p_round_id
    AND attendance.status = 'pending'
    AND CURRENT_TIMESTAMP >= round_row.arrival_at

  UNION ALL

  SELECT
    'active_report'::TEXT,
    team.id,
    team.team_code,
    report.subject_user_id,
    profile.display_name,
    user_row.phone,
    report.reporter_user_id,
    reporter_profile.display_name,
    reporter_user.phone,
    report.id,
    report.category,
    report.status,
    NULL::UUID,
    NULL::INTEGER
  FROM public.tonight_incident_reports AS report
  JOIN public.tonight_teams AS team ON team.id = report.team_id
  LEFT JOIN public.users AS user_row ON user_row.id = report.subject_user_id
  LEFT JOIN public.profiles AS profile ON profile.user_id = report.subject_user_id
  JOIN public.users AS reporter_user ON reporter_user.id = report.reporter_user_id
  LEFT JOIN public.profiles AS reporter_profile ON reporter_profile.user_id = report.reporter_user_id
  WHERE team.round_id = p_round_id
    AND report.status IN ('open', 'reviewing')

  UNION ALL

  SELECT
    'headcount_mismatch'::TEXT,
    team.id,
    team.team_code,
    NULL::UUID,
    NULL::TEXT,
    NULL::TEXT,
    NULL::UUID,
    NULL::TEXT,
    NULL::TEXT,
    NULL::UUID,
    NULL::TEXT,
    'attendance_mismatch'::TEXT,
    NULL::UUID,
    NULL::INTEGER
  FROM public.tonight_teams AS team
  JOIN public.tonight_partner_service_confirmations AS confirmation
    ON confirmation.team_id = team.id
  WHERE team.round_id = p_round_id
    AND confirmation.confirmed_attendee_count <> (
      SELECT COUNT(*)
      FROM public.tonight_attendance AS attendance
      WHERE attendance.team_id = team.id
        AND attendance.status = 'arrived'
    )

  UNION ALL

  SELECT
    'refund_dead_letter'::TEXT,
    team.id,
    team.team_code,
    deposit.user_id,
    profile.display_name,
    user_row.phone,
    NULL::UUID,
    NULL::TEXT,
    NULL::TEXT,
    NULL::UUID,
    NULL::TEXT,
    refund_request.status,
    refund_request.id,
    refund_request.revision
  FROM public.tonight_deposit_refund_requests AS refund_request
  JOIN public.tonight_deposits AS deposit ON deposit.id = refund_request.deposit_id
  JOIN public.tonight_team_members AS member ON member.application_id = deposit.application_id
  JOIN public.tonight_teams AS team ON team.id = member.team_id
  JOIN public.users AS user_row ON user_row.id = deposit.user_id
  LEFT JOIN public.profiles AS profile ON profile.user_id = deposit.user_id
  WHERE team.round_id = p_round_id
    AND refund_request.status = 'failed'
    AND refund_request.settlement_attempt_count >= 10
  ORDER BY 3, 1, 4;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_tonight_journey(
  p_round_id UUID
)
RETURNS TABLE (
  journey_round_id UUID,
  application_id UUID,
  application_status TEXT,
  deposit_status TEXT,
  deposit_revision INTEGER,
  refund_status TEXT,
  refund_request_revision INTEGER,
  attendance_status TEXT,
  attendance_revision INTEGER,
  team_id UUID,
  team_code TEXT,
  team_status TEXT,
  activity_title TEXT,
  activity_duration_minutes SMALLINT,
  reveal_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  can_reveal_exact_venue BOOLEAN,
  can_mark_arrival BOOLEAN,
  venue_display_name TEXT,
  venue_address TEXT,
  venue_address_evidence TEXT,
  venue_address_verified_at TIMESTAMPTZ,
  venue_latitude DOUBLE PRECISION,
  venue_longitude DOUBLE PRECISION,
  venue_coordinate_evidence TEXT,
  venue_coordinates_verified_at TIMESTAMPTZ,
  venue_naver_url TEXT,
  venue_kakao_url TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  application_row public.tonight_applications%ROWTYPE;
  deposit_row public.tonight_deposits%ROWTYPE;
  refund_row public.tonight_deposit_refund_requests%ROWTYPE;
  attendance_row public.tonight_attendance%ROWTYPE;
  team public.tonight_teams%ROWTYPE;
  round_row public.tonight_rounds%ROWTYPE;
  v_activity_title TEXT;
  v_activity_duration_minutes SMALLINT;
  v_snapshot public.venue_snapshots%ROWTYPE;
  v_can_reveal BOOLEAN := FALSE;
  v_can_mark_arrival BOOLEAN := FALSE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO round_row
  FROM public.tonight_rounds AS round_value
  WHERE round_value.id = p_round_id;
  IF NOT FOUND OR round_row.market_code <> 'PNU'
    OR NOT EXISTS (
      SELECT 1
      FROM public.tonight_market_memberships AS membership
      WHERE membership.market_code = round_row.market_code
        AND membership.user_id = v_caller
        AND membership.revoked_at IS NULL
    ) THEN
    RAISE EXCEPTION 'tonight_market_membership_required';
  END IF;

  SELECT * INTO application_row
  FROM public.tonight_applications AS application_value
  WHERE application_value.round_id = p_round_id
    AND application_value.user_id = v_caller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_application_not_found';
  END IF;

  SELECT deposit.* INTO deposit_row
  FROM public.tonight_deposits AS deposit
  WHERE deposit.application_id = application_row.id;

  IF deposit_row.id IS NOT NULL THEN
    SELECT request.* INTO refund_row
    FROM public.tonight_deposit_refund_requests AS request
    WHERE request.deposit_id = deposit_row.id;
  END IF;

  SELECT attendance.* INTO attendance_row
  FROM public.tonight_attendance AS attendance
  WHERE attendance.application_id = application_row.id;

  SELECT team_value.*
  INTO team
  FROM public.tonight_team_members AS member
  JOIN public.tonight_teams AS team_value
    ON team_value.id = member.team_id
  WHERE member.application_id = application_row.id
    AND member.user_id = v_caller;

  IF team.id IS NOT NULL THEN
    SELECT activity.title, activity.duration_minutes
    INTO v_activity_title, v_activity_duration_minutes
    FROM public.tonight_round_activities AS activity
    WHERE activity.id = team.activity_id;

    SELECT snapshot.*
    INTO v_snapshot
    FROM public.tonight_partner_acceptances AS acceptance
    JOIN public.venue_snapshots AS snapshot
      ON snapshot.id = acceptance.venue_snapshot_id
    WHERE acceptance.team_id = team.id;

    v_can_reveal := (
      team.status = 'accepted'
      OR team.status IN ('revealed', 'in_progress', 'completed')
    )
      AND CURRENT_TIMESTAMP >= round_row.reveal_at
      AND v_snapshot.id IS NOT NULL;

    v_can_mark_arrival := v_can_reveal
      AND attendance_row.status = 'pending'
      AND CURRENT_TIMESTAMP >= round_row.arrival_at
      AND CURRENT_TIMESTAMP < round_row.starts_at + INTERVAL '2 hours';
  END IF;

  RETURN QUERY
  SELECT
    round_row.id,
    application_row.id,
    application_row.status,
    deposit_row.status,
    deposit_row.revision,
    refund_row.status,
    refund_row.revision,
    attendance_row.status,
    attendance_row.revision,
    team.id,
    CASE WHEN v_can_reveal THEN team.team_code ELSE NULL END,
    team.status,
    v_activity_title,
    v_activity_duration_minutes,
    round_row.reveal_at,
    round_row.starts_at,
    v_can_reveal,
    v_can_mark_arrival,
    CASE WHEN v_can_reveal THEN v_snapshot.display_name ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.address ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.address_evidence ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.address_verified_at ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.latitude ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.longitude ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.coordinate_evidence ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.coordinates_verified_at ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.naver_url ELSE NULL END,
    CASE WHEN v_can_reveal THEN v_snapshot.kakao_url ELSE NULL END;
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
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.tonight_team_members AS member
      JOIN public.tonight_deposits AS deposit
        ON deposit.application_id = member.application_id
      WHERE member.team_id = team.id
        AND deposit.status IN ('paid', 'held')
    ), 0),
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.tonight_attendance AS attendance
      WHERE attendance.team_id = team.id
        AND attendance.status = 'arrived'
    ), 0),
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

CREATE OR REPLACE FUNCTION public.admin_get_tonight_round_summary(
  p_round_id UUID
)
RETURNS TABLE (
  summary_team_id UUID,
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
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  RETURN QUERY
  SELECT
    team.id,
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
  JOIN public.tonight_round_activities AS activity
    ON activity.id = team.activity_id
  LEFT JOIN public.tonight_venue_capacities AS capacity
    ON capacity.id = team.venue_capacity_id
  LEFT JOIN public.venue_snapshots AS snapshot
    ON snapshot.id = capacity.venue_snapshot_id
  LEFT JOIN public.tonight_partner_service_confirmations AS confirmation
    ON confirmation.team_id = team.id
  WHERE team.round_id = p_round_id
  ORDER BY team.team_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_get_tonight_team_diagnostics(
  p_team_id UUID
)
RETURNS TABLE (
  diagnostic_team_code TEXT,
  diagnostic_team_revision INTEGER,
  diagnostic_application_id UUID,
  diagnostic_user_id UUID,
  diagnostic_display_name TEXT,
  diagnostic_phone TEXT,
  diagnostic_photo_storage_paths TEXT[],
  diagnostic_age_years SMALLINT,
  diagnostic_gender_code TEXT,
  diagnostic_automatic_appearance_score NUMERIC,
  diagnostic_appearance_adjustment NUMERIC,
  diagnostic_effective_appearance_score NUMERIC,
  diagnostic_feature_revision INTEGER,
  diagnostic_bundle_id UUID,
  diagnostic_bundle_member_count INTEGER,
  diagnostic_seat_number SMALLINT,
  diagnostic_deposit_status TEXT,
  diagnostic_attendance_status TEXT,
  diagnostic_attendance_revision INTEGER
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
    team.team_code,
    team.revision,
    member.application_id,
    member.user_id,
    profile.display_name,
    user_row.phone,
    ARRAY(
      SELECT photo.storage_path
      FROM public.photos AS photo
      WHERE photo.user_id = member.user_id
      ORDER BY photo.sort_order, photo.id
    ),
    feature.age_years,
    feature.gender_code,
    feature.automatic_appearance_score,
    feature.appearance_score_adjustment,
    feature.appearance_score,
    feature.revision,
    member.bundle_id,
    (
      SELECT COUNT(*)::INTEGER
      FROM public.tonight_team_members AS bundled_member
      WHERE bundled_member.team_id = member.team_id
        AND bundled_member.bundle_id = member.bundle_id
    ),
    member.seat_number,
    deposit.status,
    attendance.status,
    attendance.revision
  FROM public.tonight_team_members AS member
  JOIN public.tonight_teams AS team
    ON team.id = member.team_id
  JOIN public.users AS user_row
    ON user_row.id = member.user_id
  JOIN public.profiles AS profile
    ON profile.user_id = member.user_id
  JOIN quantum_private.tonight_applicant_features AS feature
    ON feature.application_id = member.application_id
  LEFT JOIN public.tonight_deposits AS deposit
    ON deposit.application_id = member.application_id
  LEFT JOIN public.tonight_attendance AS attendance
    ON attendance.application_id = member.application_id
  WHERE member.team_id = p_team_id
  ORDER BY member.seat_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_tonight_audit_events(
  p_round_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  audit_id BIGINT,
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
  IF NOT EXISTS (
    SELECT 1 FROM public.tonight_rounds AS round_row WHERE round_row.id = p_round_id
  ) THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;

  RETURN QUERY
  SELECT
    audit.id,
    audit.entity_type,
    audit.entity_id,
    audit.action,
    audit.actor_user_id,
    audit.actor_kind,
    audit.occurred_at,
    audit.before_state,
    audit.after_state
  FROM quantum_private.tonight_audit_events AS audit
  WHERE
    (audit.entity_type = 'round' AND audit.entity_id = p_round_id)
    OR (
      audit.entity_type = 'application'
      AND EXISTS (
        SELECT 1 FROM public.tonight_applications AS application_row
        WHERE application_row.id = audit.entity_id
          AND application_row.round_id = p_round_id
      )
    )
    OR (
      audit.entity_type = 'venue_capacity'
      AND EXISTS (
        SELECT 1 FROM public.tonight_venue_capacities AS capacity
        WHERE capacity.id = audit.entity_id AND capacity.round_id = p_round_id
      )
    )
    OR (
      audit.entity_type = 'team'
      AND EXISTS (
        SELECT 1 FROM public.tonight_teams AS team
        WHERE team.id = audit.entity_id AND team.round_id = p_round_id
      )
    )
    OR (
      audit.entity_type = 'deposit'
      AND EXISTS (
        SELECT 1
        FROM public.tonight_deposits AS deposit
        JOIN public.tonight_applications AS application_row
          ON application_row.id = deposit.application_id
        WHERE deposit.id = audit.entity_id
          AND application_row.round_id = p_round_id
      )
    )
    OR (
      audit.entity_type = 'refund_request'
      AND EXISTS (
        SELECT 1
        FROM public.tonight_deposit_refund_requests AS request
        JOIN public.tonight_deposits AS deposit ON deposit.id = request.deposit_id
        JOIN public.tonight_applications AS application_row
          ON application_row.id = deposit.application_id
        WHERE request.id = audit.entity_id
          AND application_row.round_id = p_round_id
      )
    )
    OR (
      audit.entity_type = 'applicant_feature'
      AND EXISTS (
        SELECT 1
        FROM quantum_private.tonight_applicant_features AS feature
        JOIN public.tonight_applications AS application_row
          ON application_row.id = feature.application_id
        WHERE feature.application_id = audit.entity_id
          AND application_row.round_id = p_round_id
      )
    )
    OR (
      audit.entity_type = 'attendance'
      AND EXISTS (
        SELECT 1
        FROM public.tonight_attendance AS attendance
        JOIN public.tonight_teams AS team ON team.id = attendance.team_id
        WHERE attendance.id = audit.entity_id AND team.round_id = p_round_id
      )
    )
    OR (
      audit.entity_type = 'service_confirmation'
      AND EXISTS (
        SELECT 1
        FROM public.tonight_partner_service_confirmations AS confirmation
        JOIN public.tonight_teams AS team ON team.id = confirmation.team_id
        WHERE confirmation.id = audit.entity_id AND team.round_id = p_round_id
      )
    )
    OR (
      audit.entity_type = 'settlement'
      AND EXISTS (
        SELECT 1
        FROM public.tonight_settlements AS settlement
        JOIN public.tonight_teams AS team ON team.id = settlement.team_id
        WHERE settlement.id = audit.entity_id AND team.round_id = p_round_id
      )
    )
    OR (
      audit.entity_type = 'call_attempt'
      AND EXISTS (
        SELECT 1
        FROM quantum_private.tonight_call_attempts AS attempt
        JOIN public.tonight_teams AS team ON team.id = attempt.team_id
        WHERE attempt.id = audit.entity_id AND team.round_id = p_round_id
      )
    )
  ORDER BY audit.occurred_at DESC, audit.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_grant_tonight_market_membership(TEXT, UUID, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_revoke_tonight_market_membership(UUID, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_list_tonight_market_memberships(TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.create_tonight_round_internal(
  TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT[], TEXT[], TEXT[], TEXT[], SMALLINT[], TEXT
)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_create_tonight_round(
  TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT[], TEXT[], TEXT[], TEXT[], SMALLINT[], TEXT
)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_create_tonight_round(TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], TEXT[], TEXT[], TEXT[], SMALLINT[], TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_tonight_application(UUID, UUID[], BOOLEAN, TEXT, TEXT, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_set_tonight_capacity(UUID, UUID, UUID, SMALLINT, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_get_tonight_allocator_input(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.publish_tonight_allocation_internal(UUID, INTEGER, JSONB, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_publish_tonight_allocation(UUID, INTEGER, JSONB, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_publish_tonight_allocation(UUID, INTEGER, JSONB, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_prepare_tonight_deposit(UUID, UUID, TEXT, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_record_tonight_deposit_result(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_expire_tonight_deposit_gate(UUID, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_expire_tonight_partner_acceptance_gate(UUID, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_accept_tonight_team(UUID, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_swap_tonight_friend_bundles(UUID, UUID, INTEGER, UUID, UUID, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_adjust_tonight_appearance_score(UUID, NUMERIC, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_my_tonight_arrival(UUID, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_set_tonight_attendance(UUID, UUID, TEXT, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_confirm_tonight_service(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_finalize_tonight_settlement(UUID, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_my_tonight_refund(UUID, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_claim_tonight_refund_requests(UUID, INTEGER, INTEGER)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_release_tonight_refund_request(UUID, UUID, TEXT, INTEGER)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_finalize_tonight_refund_request(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_retry_tonight_refund(UUID, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_tonight_incident_report(UUID, UUID, TEXT, TEXT, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_record_tonight_call_attempt(UUID, UUID, TEXT, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_current_tonight_round()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_get_tonight_setup(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_get_current_tonight_setup()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_tonight_rounds()
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_active_exceptions(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_tonight_journey(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_get_tonight_dashboard(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_round_summary(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_get_tonight_team_diagnostics(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_list_tonight_audit_events(UUID, INTEGER)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.super_admin_grant_tonight_market_membership(TEXT, UUID, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_revoke_tonight_market_membership(UUID, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_list_tonight_market_memberships(TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_create_tonight_round(
  TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT[], TEXT[], TEXT[], TEXT[], SMALLINT[], TEXT
)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tonight_application(UUID, UUID[], BOOLEAN, TEXT, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_set_tonight_capacity(UUID, UUID, UUID, SMALLINT, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_publish_tonight_allocation(UUID, INTEGER, JSONB, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_accept_tonight_team(UUID, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_swap_tonight_friend_bundles(UUID, UUID, INTEGER, UUID, UUID, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_adjust_tonight_appearance_score(UUID, NUMERIC, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_my_tonight_arrival(UUID, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_set_tonight_attendance(UUID, UUID, TEXT, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_retry_tonight_refund(UUID, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_confirm_tonight_service(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_my_tonight_refund(UUID, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tonight_incident_report(UUID, UUID, TEXT, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_tonight_call_attempt(UUID, UUID, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_tonight_round()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_tonight_setup(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_current_tonight_setup()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_tonight_rounds()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_active_exceptions(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tonight_journey(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_tonight_dashboard(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_round_summary(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tonight_team_diagnostics(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_list_tonight_audit_events(UUID, INTEGER)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.service_prepare_tonight_deposit(UUID, UUID, TEXT, INTEGER, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_record_tonight_deposit_result(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_expire_tonight_deposit_gate(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_expire_tonight_partner_acceptance_gate(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_claim_tonight_refund_requests(UUID, INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_release_tonight_refund_request(UUID, UUID, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_finalize_tonight_refund_request(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, INTEGER, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_create_tonight_round(TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], TEXT[], TEXT[], TEXT[], SMALLINT[], TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_get_tonight_allocator_input(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_publish_tonight_allocation(UUID, INTEGER, JSONB, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_finalize_tonight_settlement(UUID, INTEGER, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.partner_set_tonight_capacity(UUID, UUID, UUID, SMALLINT, INTEGER, TEXT) IS
  'Live-membership-scoped partner capacity. Cross-venue calls intentionally fail as not found.';
COMMENT ON FUNCTION public.get_my_tonight_journey(UUID) IS
  'Returns caller journey; exact immutable venue snapshot fields remain NULL until acceptance and reveal_at.';
COMMENT ON FUNCTION public.super_admin_swap_tonight_friend_bundles(UUID, UUID, INTEGER, UUID, UUID, INTEGER, TEXT) IS
  'Moves equal-sized friend bundles atomically and revalidates both five-person gender-balanced teams.';

COMMIT;
