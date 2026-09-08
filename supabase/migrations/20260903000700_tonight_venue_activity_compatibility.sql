-- Freeze the catalog-approved venue categories on each Tonight round activity.
-- Unknown legacy activities intentionally keep an empty allowlist, so they
-- cannot accept partner capacity until an exact prepare retry finalizes them.
BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.tonight_activity_venue_categories_valid(
  p_categories TEXT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_categories IS NULL THEN
    RETURN FALSE;
  END IF;
  IF COALESCE(pg_catalog.array_ndims(p_categories), 0) NOT IN (0, 1) THEN
    RETURN FALSE;
  END IF;
  IF pg_catalog.cardinality(p_categories) > 6
    OR pg_catalog.array_position(p_categories, NULL::TEXT) IS NOT NULL
    OR NOT (p_categories <@ ARRAY[
      'cafe', 'restaurant', 'bar', 'activity', 'public-meeting-point', 'other'
    ]::TEXT[])
    OR pg_catalog.cardinality(pg_catalog.array_positions(p_categories, 'cafe')) > 1
    OR pg_catalog.cardinality(pg_catalog.array_positions(p_categories, 'restaurant')) > 1
    OR pg_catalog.cardinality(pg_catalog.array_positions(p_categories, 'bar')) > 1
    OR pg_catalog.cardinality(pg_catalog.array_positions(p_categories, 'activity')) > 1
    OR pg_catalog.cardinality(pg_catalog.array_positions(p_categories, 'public-meeting-point')) > 1
    OR pg_catalog.cardinality(pg_catalog.array_positions(p_categories, 'other')) > 1 THEN
    RETURN FALSE;
  END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION quantum_private.parse_tonight_venue_categories(
  p_categories JSONB
)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_categories TEXT[];
BEGIN
  IF p_categories IS NULL
    OR pg_catalog.jsonb_typeof(p_categories) <> 'array' THEN
    RAISE EXCEPTION 'invalid_activity_venue_categories';
  END IF;
  IF pg_catalog.jsonb_array_length(p_categories) < 1
    OR pg_catalog.jsonb_array_length(p_categories) > 6 THEN
    RAISE EXCEPTION 'invalid_activity_venue_categories';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_categories) AS item(value)
    WHERE pg_catalog.jsonb_typeof(item.value) <> 'string'
  ) THEN
    RAISE EXCEPTION 'invalid_activity_venue_categories';
  END IF;

  SELECT pg_catalog.array_agg(item.value ORDER BY item.position)
  INTO v_categories
  FROM pg_catalog.jsonb_array_elements_text(p_categories)
    WITH ORDINALITY AS item(value, position);

  IF NOT quantum_private.tonight_activity_venue_categories_valid(v_categories)
    OR pg_catalog.cardinality(v_categories) = 0 THEN
    RAISE EXCEPTION 'invalid_activity_venue_categories';
  END IF;
  RETURN v_categories;
END;
$$;

ALTER TABLE public.tonight_round_activities
  ADD COLUMN allowed_venue_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.tonight_round_activities
  ADD CONSTRAINT tonight_activity_venue_categories_valid CHECK (
    quantum_private.tonight_activity_venue_categories_valid(allowed_venue_categories)
  );

-- Backfill only exact catalog fingerprints. Activity kind alone is ambiguous
-- (for example, `experience` can mean a bar or an activity venue), so every
-- unknown or edited legacy row remains an empty, fail-closed allowlist.
UPDATE public.tonight_round_activities AS activity
SET allowed_venue_categories = CASE
  WHEN activity.title = '부산대 숨은 안주 월드컵'
    AND activity.activity_kind = 'bar'
    AND activity.description = '다섯 명이 대표 안주를 함께 맛보고 토너먼트로 오늘의 원픽을 정해요.'
    AND activity.image_url = '/images/match/events/event-drinks.webp'
    AND activity.duration_minutes = 75
    THEN ARRAY['bar']::TEXT[]
  WHEN activity.title = '다트 팀 배틀 한 판'
    AND activity.activity_kind = 'experience'
    AND activity.description = '간단한 연습 뒤 팀을 나눠 다트 세 라운드를 겨루며 자연스럽게 친해져요.'
    AND activity.image_url = '/images/match/events/event-drinks.webp'
    AND activity.duration_minutes = 70
    THEN ARRAY['bar', 'activity']::TEXT[]
  WHEN activity.title = '보드게임 팀전 3종'
    AND activity.activity_kind = 'board_game'
    AND activity.description = '설명하기 쉬운 협동·추리·순발력 게임을 한 판씩 하며 팀 호흡을 맞춰요.'
    AND activity.image_url = '/images/match/events/event-board-game.webp'
    AND activity.duration_minutes = 80
    THEN ARRAY['activity']::TEXT[]
  WHEN activity.title = '테이블 미니게임 리그'
    AND activity.activity_kind = 'experience'
    AND activity.description = '순발력 카드게임과 밸런스 게임을 짧게 돌며 다섯 명 모두 대화에 참여해요.'
    AND activity.image_url = '/images/match/events/event-board-game.webp'
    AND activity.duration_minutes = 65
    THEN ARRAY['activity']::TEXT[]
  WHEN activity.title = '디저트 원픽 테이스팅'
    AND activity.activity_kind = 'cafe'
    AND activity.description = '서로 다른 디저트를 나눠 맛보고 취향표를 완성해 오늘의 원픽을 골라요.'
    AND activity.image_url = '/images/match/events/event-dinner.webp'
    AND activity.duration_minutes = 70
    THEN ARRAY['cafe']::TEXT[]
  WHEN activity.title = '오늘의 야식 메뉴 토너먼트'
    AND activity.activity_kind = 'cafe'
    AND activity.description = '후보 메뉴를 함께 비교하고 한 테이블에서 최종 우승 메뉴를 직접 맛봐요.'
    AND activity.image_url = '/images/match/events/event-dinner.webp'
    AND activity.duration_minutes = 75
    THEN ARRAY['restaurant', 'cafe']::TEXT[]
  ELSE ARRAY[]::TEXT[]
END;

-- A legacy capacity that cannot be proven compatible must not be available to
-- the allocator. Existing published teams stay attached to their ledger row.
UPDATE public.tonight_venue_capacities AS capacity
SET status = 'closed',
    revision = capacity.revision + 1,
    updated_at = CURRENT_TIMESTAMP
FROM public.tonight_round_activities AS activity,
     public.venue_snapshots AS snapshot
WHERE activity.id = capacity.activity_id
  AND activity.round_id = capacity.round_id
  AND snapshot.id = capacity.venue_snapshot_id
  AND snapshot.venue_id = capacity.venue_id
  AND NOT (snapshot.venue_category = ANY(activity.allowed_venue_categories))
  AND capacity.status <> 'closed';

CREATE OR REPLACE FUNCTION quantum_private.prevent_tonight_activity_category_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Empty is the explicit legacy/unfinalized state. The new prepare overload
  -- may finalize it once in the same transaction; a finalized list is fixed.
  IF pg_catalog.cardinality(OLD.allowed_venue_categories) > 0
    AND NEW.allowed_venue_categories IS DISTINCT FROM OLD.allowed_venue_categories THEN
    RAISE EXCEPTION 'tonight_activity_venue_categories_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tonight_round_activity_category_snapshot_immutable
  BEFORE UPDATE OF allowed_venue_categories ON public.tonight_round_activities
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_tonight_activity_category_snapshot_mutation();

-- This overload validates the three category arrays before delegating the
-- existing round/idempotency contract, then atomically finalizes each snapshot.
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
  p_activity_allowed_venue_categories JSONB,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round_id UUID;
  v_slot INTEGER;
  v_activity_id UUID;
  v_allowed_venue_categories TEXT[];
BEGIN
  IF p_activity_allowed_venue_categories IS NULL
    OR pg_catalog.jsonb_typeof(p_activity_allowed_venue_categories) <> 'array' THEN
    RAISE EXCEPTION 'invalid_activity_venue_category_count';
  END IF;
  IF pg_catalog.jsonb_array_length(p_activity_allowed_venue_categories) <> 3 THEN
    RAISE EXCEPTION 'invalid_activity_venue_category_count';
  END IF;

  -- Parse all slots before creating anything, so malformed/duplicate values
  -- fail before the legacy creation helper is entered.
  FOR v_slot IN 1..3 LOOP
    v_allowed_venue_categories := quantum_private.parse_tonight_venue_categories(
      p_activity_allowed_venue_categories -> (v_slot - 1)
    );
  END LOOP;

  v_round_id := quantum_private.create_tonight_round_internal(
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

  FOR v_slot IN 1..3 LOOP
    v_allowed_venue_categories := quantum_private.parse_tonight_venue_categories(
      p_activity_allowed_venue_categories -> (v_slot - 1)
    );
    v_activity_id := NULL;
    UPDATE public.tonight_round_activities AS activity
    SET allowed_venue_categories = v_allowed_venue_categories
    WHERE activity.round_id = v_round_id
      AND activity.slot = v_slot
      AND (
        pg_catalog.cardinality(activity.allowed_venue_categories) = 0
        OR activity.allowed_venue_categories = v_allowed_venue_categories
      )
    RETURNING activity.id INTO v_activity_id;
    IF NOT FOUND OR v_activity_id IS NULL THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
  END LOOP;

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
  p_activity_allowed_venue_categories JSONB,
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
    p_activity_allowed_venue_categories,
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
  p_activity_allowed_venue_categories JSONB,
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
    p_activity_allowed_venue_categories,
    p_idempotency_key
  );
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

  -- Use the same venue lock as membership revoke and retain a shared lock on
  -- the caller's active membership until the capacity write commits.
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

  -- Authorization and immutable category compatibility precede replay, so an
  -- incompatible legacy idempotency key cannot bypass the new contract.
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
      OR (audit_row.after_state ->> 'team_capacity')::SMALLINT IS DISTINCT FROM p_team_capacity
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
      'round_id', p_round_id,
      'activity_id', p_activity_id,
      'venue_snapshot_id', p_venue_snapshot_id,
      'team_capacity', p_team_capacity,
      'venue_id', v_venue_id,
      'venue_category', v_venue_category,
      'expected_revision', p_expected_revision
    ),
    p_idempotency_key
  );
  RETURN v_capacity_id;
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

REVOKE ALL ON FUNCTION quantum_private.tonight_activity_venue_categories_valid(TEXT[])
  FROM /* explicit internal boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.parse_tonight_venue_categories(JSONB)
  FROM /* explicit internal boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION quantum_private.prevent_tonight_activity_category_snapshot_mutation()
  FROM /* explicit internal boundary */ PUBLIC, anon, authenticated, service_role;

-- Retire the legacy create entry points that cannot carry category snapshots.
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
REVOKE ALL ON FUNCTION public.service_create_tonight_round(
  TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT[], TEXT[], TEXT[], TEXT[], SMALLINT[], TEXT
)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION quantum_private.create_tonight_round_internal(
  TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT[], TEXT[], TEXT[], TEXT[], SMALLINT[], JSONB, TEXT
)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_create_tonight_round(
  TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT[], TEXT[], TEXT[], TEXT[], SMALLINT[], JSONB, TEXT
)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_create_tonight_round(
  TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT[], TEXT[], TEXT[], TEXT[], SMALLINT[], JSONB, TEXT
)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_set_tonight_capacity(UUID, UUID, UUID, SMALLINT, INTEGER, TEXT)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_get_tonight_setup(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.super_admin_create_tonight_round(
  TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT[], TEXT[], TEXT[], TEXT[], SMALLINT[], JSONB, TEXT
)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.service_create_tonight_round(
  TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT[], TEXT[], TEXT[], TEXT[], SMALLINT[], JSONB, TEXT
)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_set_tonight_capacity(UUID, UUID, UUID, SMALLINT, INTEGER, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_tonight_setup(UUID)
  TO authenticated;

COMMENT ON COLUMN public.tonight_round_activities.allowed_venue_categories IS
  'Immutable catalog allowlist snapshot. Empty is reserved for unproven legacy rows and is fail-closed.';
COMMENT ON FUNCTION public.partner_set_tonight_capacity(UUID, UUID, UUID, SMALLINT, INTEGER, TEXT) IS
  'Own-venue capacity mutation; the immutable venue snapshot category must match the round activity allowlist before replay or write.';
COMMENT ON FUNCTION public.partner_get_tonight_setup(UUID) IS
  'Returns only round activities compatible with the caller current own-venue snapshots.';

COMMIT;
