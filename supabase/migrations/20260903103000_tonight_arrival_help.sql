-- Durable, contact-free arrival assistance for Tonight teams.
-- Browser roles never read the ledger directly; every view and transition is
-- caller scoped by a fixed-search-path SECURITY DEFINER RPC.

BEGIN;

CREATE TABLE public.tonight_arrival_help_requests (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.tonight_teams(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN (
    'entrance', 'team', 'venue'
  )),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'acknowledged', 'escalated', 'resolved', 'cancelled'
  )),
  handled_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  request_idempotency_key TEXT NOT NULL,
  last_action_idempotency_key TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (requested_by, request_idempotency_key),
  UNIQUE (last_action_idempotency_key),
  UNIQUE (id, team_id),
  CONSTRAINT tonight_arrival_help_timestamps_consistent CHECK (
    (status <> 'acknowledged' OR acknowledged_at IS NOT NULL)
    AND (status <> 'resolved' OR resolved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX tonight_arrival_help_one_active_per_member
  ON public.tonight_arrival_help_requests (team_id, requested_by)
  WHERE status IN ('requested', 'acknowledged', 'escalated');

CREATE INDEX tonight_arrival_help_team_status_idx
  ON public.tonight_arrival_help_requests (team_id, status, requested_at);

ALTER TABLE public.tonight_arrival_help_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tonight_arrival_help_requests
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tonight_arrival_help_requests TO service_role;

CREATE OR REPLACE FUNCTION public.request_my_tonight_arrival_help(
  p_team_id UUID,
  p_category TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  request_id UUID,
  team_id UUID,
  team_code TEXT,
  category TEXT,
  status TEXT,
  revision INTEGER,
  requested_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  next_actor TEXT,
  next_action TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_request public.tonight_arrival_help_requests%ROWTYPE;
  v_existing public.tonight_arrival_help_requests%ROWTYPE;
  v_team_code TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_team_id IS NULL OR p_category NOT IN ('entrance', 'team', 'venue') THEN
    RAISE EXCEPTION 'invalid_arrival_help_request';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 8
    OR pg_catalog.length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tonight-arrival-help:' || p_team_id::TEXT || ':' || v_caller::TEXT,
      0
    )
  );

  SELECT team.team_code
  INTO v_team_code
  FROM public.tonight_team_members AS member
  JOIN public.tonight_teams AS team ON team.id = member.team_id
  JOIN public.tonight_rounds AS round_row ON round_row.id = team.round_id
  WHERE member.team_id = p_team_id
    AND member.user_id = v_caller
    AND member.member_status IN ('assigned', 'confirmed')
    AND team.status IN ('revealed', 'in_progress')
    AND CURRENT_TIMESTAMP >= round_row.reveal_at
    AND CURRENT_TIMESTAMP < round_row.starts_at + INTERVAL '2 hours'
  FOR SHARE OF member, team, round_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_arrival_help_not_available';
  END IF;

  SELECT request.*
  INTO v_existing
  FROM public.tonight_arrival_help_requests AS request
  WHERE request.requested_by = v_caller
    AND request.request_idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.team_id <> p_team_id OR v_existing.category <> p_category THEN
      RAISE EXCEPTION 'arrival_help_idempotency_conflict';
    END IF;
    v_request := v_existing;
  ELSE
    INSERT INTO public.tonight_arrival_help_requests AS request (
      team_id,
      requested_by,
      category,
      status,
      request_idempotency_key
    )
    VALUES (
      p_team_id,
      v_caller,
      p_category,
      'requested',
      p_idempotency_key
    )
    ON CONFLICT (team_id, requested_by)
      WHERE status IN ('requested', 'acknowledged', 'escalated')
    DO UPDATE SET updated_at = request.updated_at
    RETURNING request.* INTO v_request;

    IF v_request.request_idempotency_key <> p_idempotency_key
      OR v_request.category <> p_category THEN
      RAISE EXCEPTION 'arrival_help_already_active';
    END IF;

    PERFORM quantum_private.write_tonight_audit(
      'arrival_help',
      v_request.id,
      'arrival_help_requested',
      NULL,
      pg_catalog.to_jsonb(v_request),
      p_idempotency_key
    );
  END IF;

  RETURN QUERY SELECT
    v_request.id,
    v_request.team_id,
    v_team_code,
    v_request.category,
    v_request.status,
    v_request.revision,
    v_request.requested_at,
    v_request.updated_at,
    CASE
      WHEN v_request.status IN ('requested', 'acknowledged') THEN 'partner'
      WHEN v_request.status = 'escalated' THEN 'admin'
      ELSE 'user'
    END,
    CASE
      WHEN v_request.status = 'requested' THEN '업장 확인을 기다려 주세요.'
      WHEN v_request.status = 'acknowledged' THEN '업장 안내를 확인해 주세요.'
      WHEN v_request.status = 'escalated' THEN '운영자 확인을 기다려 주세요.'
      WHEN v_request.status = 'resolved' THEN '현장 안내가 완료됐어요.'
      ELSE '요청이 종료됐어요.'
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_tonight_arrival_help(
  p_team_id UUID
)
RETURNS TABLE (
  request_id UUID,
  team_id UUID,
  team_code TEXT,
  category TEXT,
  status TEXT,
  revision INTEGER,
  requested_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  next_actor TEXT,
  next_action TEXT
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
    request.id,
    request.team_id,
    team.team_code,
    request.category,
    request.status,
    request.revision,
    request.requested_at,
    request.updated_at,
    CASE
      WHEN request.status IN ('requested', 'acknowledged') THEN 'partner'
      WHEN request.status = 'escalated' THEN 'admin'
      ELSE 'user'
    END,
    CASE
      WHEN request.status = 'requested' THEN '업장 확인을 기다려 주세요.'
      WHEN request.status = 'acknowledged' THEN '업장 안내를 확인해 주세요.'
      WHEN request.status = 'escalated' THEN '운영자 확인을 기다려 주세요.'
      WHEN request.status = 'resolved' THEN '현장 안내가 완료됐어요.'
      ELSE '요청이 종료됐어요.'
    END
  FROM public.tonight_arrival_help_requests AS request
  JOIN public.tonight_teams AS team ON team.id = request.team_id
  JOIN public.tonight_team_members AS member ON member.team_id = team.id
  WHERE request.team_id = p_team_id
    AND request.requested_by = v_caller
    AND member.user_id = v_caller
  ORDER BY request.requested_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_my_tonight_arrival_help(
  p_request_id UUID,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  request_id UUID,
  team_id UUID,
  status TEXT,
  revision INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_request public.tonight_arrival_help_requests%ROWTYPE;
  v_before public.tonight_arrival_help_requests%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_request_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 8
    OR pg_catalog.length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'invalid_arrival_help_transition';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.tonight_arrival_help_requests AS request
  WHERE request.id = p_request_id
    AND request.requested_by = v_caller
    AND (
      request.status IN ('requested', 'acknowledged', 'escalated')
      OR request.last_action_idempotency_key = p_idempotency_key
    )
  FOR UPDATE OF request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_arrival_help_not_found';
  END IF;
  IF v_request.last_action_idempotency_key = p_idempotency_key THEN
    RETURN QUERY SELECT v_request.id, v_request.team_id, v_request.status, v_request.revision;
    RETURN;
  END IF;
  IF v_request.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  v_before := v_request;
  UPDATE public.tonight_arrival_help_requests AS request
  SET
    status = 'cancelled',
    handled_by = v_caller,
    revision = request.revision + 1,
    last_action_idempotency_key = p_idempotency_key,
    updated_at = CURRENT_TIMESTAMP
  WHERE request.id = p_request_id
    AND request.revision = p_expected_revision
  RETURNING request.* INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'arrival_help',
    v_request.id,
    'arrival_help_cancelled',
    pg_catalog.to_jsonb(v_before),
    pg_catalog.to_jsonb(v_request),
    p_idempotency_key
  );

  RETURN QUERY SELECT v_request.id, v_request.team_id, v_request.status, v_request.revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_get_tonight_arrival_help_queue(
  p_round_id UUID,
  p_venue_id UUID
)
RETURNS TABLE (
  request_id UUID,
  team_id UUID,
  team_code TEXT,
  category TEXT,
  status TEXT,
  revision INTEGER,
  requested_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  next_action TEXT
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
  IF p_venue_id IS NULL THEN
    RAISE EXCEPTION 'invalid_venue_id';
  END IF;

  RETURN QUERY
  SELECT
    request.id,
    request.team_id,
    team.team_code,
    request.category,
    request.status,
    request.revision,
    request.requested_at,
    request.updated_at,
    CASE
      WHEN request.status = 'requested' THEN '팀 번호를 확인하고 찾으러 가기'
      WHEN request.status = 'acknowledged' THEN '만남 확인 후 완료 처리'
      WHEN request.status = 'escalated' THEN '운영자 처리 대기'
      ELSE '처리 완료'
    END
  FROM public.tonight_arrival_help_requests AS request
  JOIN public.tonight_teams AS team ON team.id = request.team_id
  JOIN public.tonight_venue_capacities AS capacity ON capacity.id = team.venue_capacity_id
  WHERE team.round_id = p_round_id
    AND capacity.venue_id = p_venue_id
    AND request.status IN ('requested', 'acknowledged', 'escalated')
    AND EXISTS (
      SELECT 1
      FROM public.venue_partner_memberships AS membership
      WHERE membership.user_id = v_caller
        AND membership.venue_id = capacity.venue_id
        AND membership.revoked_at IS NULL
    )
  ORDER BY
    CASE request.status
      WHEN 'requested' THEN 0
      WHEN 'acknowledged' THEN 1
      WHEN 'escalated' THEN 2
      ELSE 3
    END,
    request.requested_at
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_update_tonight_arrival_help(
  p_venue_id UUID,
  p_request_id UUID,
  p_action TEXT,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  request_id UUID,
  team_id UUID,
  status TEXT,
  revision INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_request public.tonight_arrival_help_requests%ROWTYPE;
  v_before public.tonight_arrival_help_requests%ROWTYPE;
  v_venue_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_venue_id IS NULL
    OR p_action NOT IN ('acknowledge', 'resolve', 'escalate')
    OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 8
    OR pg_catalog.length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'invalid_arrival_help_transition';
  END IF;

  SELECT capacity.venue_id
  INTO v_venue_id
  FROM public.tonight_arrival_help_requests AS request
  JOIN public.tonight_teams AS team ON team.id = request.team_id
  JOIN public.tonight_venue_capacities AS capacity ON capacity.id = team.venue_capacity_id
  JOIN public.venue_partner_memberships AS membership
    ON membership.venue_id = capacity.venue_id
  WHERE request.id = p_request_id
    AND capacity.venue_id = p_venue_id
    AND membership.user_id = v_caller
    AND membership.venue_id = capacity.venue_id
    AND membership.revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_arrival_help_not_found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('venue-partner-venue:' || v_venue_id::TEXT, 0)
  );

  PERFORM membership.venue_id
  FROM public.venue_partner_memberships AS membership
  WHERE membership.user_id = v_caller
    AND membership.venue_id = v_venue_id
    AND membership.revoked_at IS NULL
  FOR SHARE OF membership;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_arrival_help_not_found';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.tonight_arrival_help_requests AS request
  JOIN public.tonight_teams AS team ON team.id = request.team_id
  JOIN public.tonight_venue_capacities AS capacity ON capacity.id = team.venue_capacity_id
  WHERE request.id = p_request_id
    AND capacity.venue_id = v_venue_id
  FOR UPDATE OF request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_arrival_help_not_found';
  END IF;

  IF v_request.last_action_idempotency_key = p_idempotency_key THEN
    RETURN QUERY SELECT v_request.id, v_request.team_id, v_request.status, v_request.revision;
    RETURN;
  END IF;
  IF v_request.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;
  IF (p_action = 'acknowledge' AND v_request.status <> 'requested')
    OR (p_action = 'escalate' AND v_request.status NOT IN ('requested', 'acknowledged'))
    OR (p_action = 'resolve' AND v_request.status NOT IN ('requested', 'acknowledged', 'escalated')) THEN
    RAISE EXCEPTION 'arrival_help_transition_conflict';
  END IF;

  v_before := v_request;
  UPDATE public.tonight_arrival_help_requests AS request
  SET
    status = CASE p_action
      WHEN 'acknowledge' THEN 'acknowledged'
      WHEN 'resolve' THEN 'resolved'
      WHEN 'escalate' THEN 'escalated'
    END,
    handled_by = v_caller,
    revision = request.revision + 1,
    last_action_idempotency_key = p_idempotency_key,
    acknowledged_at = CASE
      WHEN p_action = 'acknowledge' THEN COALESCE(request.acknowledged_at, CURRENT_TIMESTAMP)
      ELSE request.acknowledged_at
    END,
    resolved_at = CASE
      WHEN p_action = 'resolve' THEN CURRENT_TIMESTAMP
      ELSE request.resolved_at
    END,
    updated_at = CURRENT_TIMESTAMP
  WHERE request.id = p_request_id
    AND request.revision = p_expected_revision
  RETURNING request.* INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'arrival_help',
    v_request.id,
    'partner_arrival_help_' || p_action,
    pg_catalog.to_jsonb(v_before),
    pg_catalog.to_jsonb(v_request),
    p_idempotency_key
  );

  RETURN QUERY SELECT v_request.id, v_request.team_id, v_request.status, v_request.revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tonight_arrival_help_queue(
  p_round_id UUID
)
RETURNS TABLE (
  request_id UUID,
  team_id UUID,
  team_code TEXT,
  venue_name TEXT,
  category TEXT,
  status TEXT,
  revision INTEGER,
  requested_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  next_action TEXT
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
    request.id,
    request.team_id,
    team.team_code,
    snapshot.display_name,
    request.category,
    request.status,
    request.revision,
    request.requested_at,
    request.updated_at,
    CASE
      WHEN request.status = 'escalated' THEN '업장과 현장 상태 확인'
      WHEN request.status IN ('requested', 'acknowledged') THEN '업장 처리 상태 관찰'
      ELSE '처리 완료'
    END
  FROM public.tonight_arrival_help_requests AS request
  JOIN public.tonight_teams AS team ON team.id = request.team_id
  LEFT JOIN public.tonight_partner_acceptances AS acceptance ON acceptance.team_id = team.id
  LEFT JOIN public.venue_snapshots AS snapshot ON snapshot.id = acceptance.venue_snapshot_id
  WHERE team.round_id = p_round_id
    AND request.status IN ('requested', 'acknowledged', 'escalated')
  ORDER BY
    CASE request.status
      WHEN 'escalated' THEN 0
      WHEN 'requested' THEN 1
      WHEN 'acknowledged' THEN 2
      ELSE 3
    END,
    request.requested_at
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_tonight_arrival_help(
  p_request_id UUID,
  p_action TEXT,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  request_id UUID,
  team_id UUID,
  status TEXT,
  revision INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_request public.tonight_arrival_help_requests%ROWTYPE;
  v_before public.tonight_arrival_help_requests%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF p_action NOT IN ('acknowledge', 'resolve', 'escalate')
    OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 8
    OR pg_catalog.length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'invalid_arrival_help_transition';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.tonight_arrival_help_requests AS request
  WHERE request.id = p_request_id
  FOR UPDATE OF request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_arrival_help_not_found';
  END IF;

  IF v_request.last_action_idempotency_key = p_idempotency_key THEN
    RETURN QUERY SELECT v_request.id, v_request.team_id, v_request.status, v_request.revision;
    RETURN;
  END IF;
  IF v_request.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;
  IF (p_action = 'acknowledge' AND v_request.status <> 'requested')
    OR (p_action = 'escalate' AND v_request.status NOT IN ('requested', 'acknowledged'))
    OR (p_action = 'resolve' AND v_request.status NOT IN ('requested', 'acknowledged', 'escalated')) THEN
    RAISE EXCEPTION 'arrival_help_transition_conflict';
  END IF;

  v_before := v_request;
  UPDATE public.tonight_arrival_help_requests AS request
  SET
    status = CASE p_action
      WHEN 'acknowledge' THEN 'acknowledged'
      WHEN 'resolve' THEN 'resolved'
      WHEN 'escalate' THEN 'escalated'
    END,
    handled_by = v_caller,
    revision = request.revision + 1,
    last_action_idempotency_key = p_idempotency_key,
    acknowledged_at = CASE
      WHEN p_action = 'acknowledge' THEN COALESCE(request.acknowledged_at, CURRENT_TIMESTAMP)
      ELSE request.acknowledged_at
    END,
    resolved_at = CASE
      WHEN p_action = 'resolve' THEN CURRENT_TIMESTAMP
      ELSE request.resolved_at
    END,
    updated_at = CURRENT_TIMESTAMP
  WHERE request.id = p_request_id
    AND request.revision = p_expected_revision
  RETURNING request.* INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    'arrival_help',
    v_request.id,
    'admin_arrival_help_' || p_action,
    pg_catalog.to_jsonb(v_before),
    pg_catalog.to_jsonb(v_request),
    p_idempotency_key
  );

  RETURN QUERY SELECT v_request.id, v_request.team_id, v_request.status, v_request.revision;
END;
$$;

REVOKE ALL ON FUNCTION public.request_my_tonight_arrival_help(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_tonight_arrival_help(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_my_tonight_arrival_help(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_get_tonight_arrival_help_queue(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_update_tonight_arrival_help(UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_arrival_help_queue(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_update_tonight_arrival_help(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.request_my_tonight_arrival_help(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tonight_arrival_help(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_tonight_arrival_help(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_tonight_arrival_help_queue(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_update_tonight_arrival_help(UUID, UUID, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_arrival_help_queue(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_tonight_arrival_help(UUID, TEXT, INTEGER, TEXT) TO authenticated;

COMMENT ON TABLE public.tonight_arrival_help_requests IS
  'Contact-free, durable on-site assistance ledger shared by the user, exact venue partner, and operators.';

COMMIT;
