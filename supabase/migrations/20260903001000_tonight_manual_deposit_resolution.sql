-- A no-show deposit remains held until a recently authenticated super-admin
-- explicitly chooses a full refund or an approved forfeiture policy action.

BEGIN;

CREATE TABLE quantum_private.tonight_manual_deposit_resolution_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deposit_id UUID NOT NULL UNIQUE
    REFERENCES public.tonight_deposits(id) ON DELETE RESTRICT,
  terminal_event_id BIGINT NOT NULL
    REFERENCES quantum_private.tonight_deposit_terminal_events(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL REFERENCES public.tonight_teams(id) ON DELETE RESTRICT,
  subject_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  attendance_status TEXT NOT NULL CHECK (attendance_status IN ('pending', 'no_show')),
  attendance_revision INTEGER NOT NULL CHECK (attendance_revision >= 0),
  decision TEXT NOT NULL CHECK (decision IN ('refund', 'forfeit')),
  actor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  request_deposit_revision INTEGER NOT NULL CHECK (request_deposit_revision >= 0),
  result_deposit_revision INTEGER NOT NULL CHECK (result_deposit_revision > 0),
  refund_request_id UUID
    REFERENCES public.tonight_deposit_refund_requests(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tonight_manual_deposit_resolution_result_check CHECK (
    (decision = 'refund' AND refund_request_id IS NOT NULL)
    OR (decision = 'forfeit' AND refund_request_id IS NULL)
  )
);

CREATE INDEX tonight_manual_deposit_resolution_team_idx
  ON quantum_private.tonight_manual_deposit_resolution_events (team_id, resolved_at DESC);

ALTER TABLE quantum_private.tonight_manual_deposit_resolution_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quantum_private.tonight_manual_deposit_resolution_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE quantum_private.tonight_manual_deposit_resolution_events_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tonight_manual_deposit_resolution_update_immutable
  BEFORE UPDATE ON quantum_private.tonight_manual_deposit_resolution_events
  FOR EACH ROW EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();
CREATE TRIGGER tonight_manual_deposit_resolution_delete_immutable
  BEFORE DELETE ON quantum_private.tonight_manual_deposit_resolution_events
  FOR EACH ROW EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

-- The application environment flag is the first gate. This fail-closed DB
-- value is an independent second gate and has no public/admin toggle.
INSERT INTO public.app_config (key, value)
VALUES ('tonight_no_show_forfeit_policy_approved', pg_catalog.to_jsonb(FALSE))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.super_admin_resolve_tonight_manual_deposit(
  p_deposit_id UUID,
  p_decision TEXT,
  p_expected_revision INTEGER,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  team_row public.tonight_teams%ROWTYPE;
  attendance_row public.tonight_attendance%ROWTYPE;
  deposit_row public.tonight_deposits%ROWTYPE;
  terminal_event quantum_private.tonight_deposit_terminal_events%ROWTYPE;
  resolution_event quantum_private.tonight_manual_deposit_resolution_events%ROWTYPE;
  refund_row public.tonight_deposit_refund_requests%ROWTYPE;
  v_caller UUID := auth.uid();
  v_team_id UUID;
  v_result_revision INTEGER;
  v_result JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_deposit_id IS NULL THEN
    RAISE EXCEPTION 'manual_deposit_identity_required';
  END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_decision IS NULL OR p_decision NOT IN ('refund', 'forfeit') THEN
    RAISE EXCEPTION 'invalid_manual_deposit_decision';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'invalid_expected_revision';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  SELECT resolution.*
  INTO resolution_event
  FROM quantum_private.tonight_manual_deposit_resolution_events AS resolution
  WHERE resolution.idempotency_key = pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF resolution_event.deposit_id <> p_deposit_id
      OR resolution_event.decision <> p_decision
      OR resolution_event.actor_user_id <> v_caller
      OR resolution_event.request_deposit_revision <> p_expected_revision THEN
      RAISE EXCEPTION 'manual_deposit_idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'deposit_id', resolution_event.deposit_id,
      'decision', resolution_event.decision,
      'deposit_revision', resolution_event.result_deposit_revision,
      'refund_request_id', resolution_event.refund_request_id
    );
  END IF;

  IF p_decision = 'forfeit'
    AND NOT COALESCE((
      SELECT config.value = pg_catalog.to_jsonb(TRUE)
      FROM public.app_config AS config
      WHERE config.key = 'tonight_no_show_forfeit_policy_approved'
    ), FALSE) THEN
    RAISE EXCEPTION 'forfeit_policy_not_approved';
  END IF;

  SELECT member.team_id
  INTO v_team_id
  FROM public.tonight_deposits AS deposit
  JOIN public.tonight_team_members AS member
    ON member.application_id = deposit.application_id
  WHERE deposit.id = p_deposit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_deposit_not_found';
  END IF;

  SELECT team.*
  INTO team_row
  FROM public.tonight_teams AS team
  WHERE team.id = v_team_id
  FOR UPDATE OF team;

  SELECT attendance.*
  INTO attendance_row
  FROM public.tonight_attendance AS attendance
  JOIN public.tonight_deposits AS deposit
    ON deposit.application_id = attendance.application_id
  WHERE attendance.team_id = v_team_id
    AND deposit.id = p_deposit_id
  FOR UPDATE OF attendance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_attendance_not_found';
  END IF;

  SELECT deposit.*
  INTO deposit_row
  FROM public.tonight_deposits AS deposit
  WHERE deposit.id = p_deposit_id
  FOR UPDATE OF deposit;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tonight_deposit_not_found';
  END IF;

  SELECT resolution.*
  INTO resolution_event
  FROM quantum_private.tonight_manual_deposit_resolution_events AS resolution
  WHERE resolution.deposit_id = p_deposit_id;
  IF FOUND THEN
    IF resolution_event.idempotency_key = pg_catalog.btrim(p_idempotency_key)
      AND resolution_event.decision = p_decision
      AND resolution_event.actor_user_id = v_caller
      AND resolution_event.request_deposit_revision = p_expected_revision THEN
      RETURN pg_catalog.jsonb_build_object(
        'deposit_id', resolution_event.deposit_id,
        'decision', resolution_event.decision,
        'deposit_revision', resolution_event.result_deposit_revision,
        'refund_request_id', resolution_event.refund_request_id
      );
    END IF;
    RAISE EXCEPTION 'manual_deposit_already_resolved';
  END IF;

  SELECT terminal.*
  INTO terminal_event
  FROM quantum_private.tonight_deposit_terminal_events AS terminal
  WHERE terminal.deposit_id = p_deposit_id
    AND terminal.disposition = 'manual_review'
    AND terminal.attendance_revision = attendance_row.revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual_deposit_not_eligible';
  END IF;
  IF team_row.status <> 'completed'
    OR NOT EXISTS (
      SELECT 1
      FROM public.tonight_partner_service_confirmations AS confirmation
      WHERE confirmation.team_id = team_row.id
    ) THEN
    RAISE EXCEPTION 'partner_service_confirmation_required';
  END IF;
  IF attendance_row.status NOT IN ('pending', 'no_show') THEN
    RAISE EXCEPTION 'manual_deposit_not_eligible';
  END IF;
  IF deposit_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;
  IF deposit_row.status <> 'held' THEN
    RAISE EXCEPTION 'manual_deposit_not_held';
  END IF;
  IF p_decision = 'forfeit' AND EXISTS (
    SELECT 1
    FROM public.tonight_deposit_refund_requests AS request
    WHERE request.deposit_id = deposit_row.id
  ) THEN
    RAISE EXCEPTION 'manual_deposit_refund_state_conflict';
  END IF;

  IF p_decision = 'refund' THEN
    UPDATE public.tonight_deposits AS deposit
    SET status = 'refund_requested',
        revision = deposit.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE deposit.id = p_deposit_id
      AND deposit.revision = p_expected_revision
      AND deposit.status = 'held'
    RETURNING deposit.revision INTO v_result_revision;
    IF v_result_revision IS NULL THEN
      RAISE EXCEPTION 'stale_revision';
    END IF;

    INSERT INTO public.tonight_deposit_refund_requests (
      deposit_id,
      requested_by,
      idempotency_key
    )
    VALUES (
      deposit_row.id,
      deposit_row.user_id,
      'manual-refund:' || deposit_row.id::TEXT
    )
    ON CONFLICT (deposit_id) DO NOTHING
    RETURNING * INTO refund_row;

    IF refund_row.id IS NULL THEN
      SELECT request.*
      INTO refund_row
      FROM public.tonight_deposit_refund_requests AS request
      WHERE request.deposit_id = deposit_row.id
      FOR UPDATE OF request;
    END IF;
    IF refund_row.id IS NULL
      OR refund_row.requested_by <> deposit_row.user_id
      OR refund_row.status NOT IN ('requested', 'approved', 'processing', 'failed') THEN
      RAISE EXCEPTION 'manual_deposit_refund_state_conflict';
    END IF;
  ELSIF p_decision = 'forfeit' THEN
    UPDATE public.tonight_deposits AS deposit
    SET status = 'forfeited',
        revision = deposit.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE deposit.id = p_deposit_id
      AND deposit.revision = p_expected_revision
      AND deposit.status = 'held'
    RETURNING deposit.revision INTO v_result_revision;
    IF v_result_revision IS NULL THEN
      RAISE EXCEPTION 'stale_revision';
    END IF;
  END IF;

  INSERT INTO quantum_private.tonight_manual_deposit_resolution_events (
    deposit_id,
    terminal_event_id,
    team_id,
    subject_user_id,
    attendance_status,
    attendance_revision,
    decision,
    actor_user_id,
    request_deposit_revision,
    result_deposit_revision,
    refund_request_id,
    idempotency_key
  ) VALUES (
    deposit_row.id,
    terminal_event.id,
    team_row.id,
    deposit_row.user_id,
    attendance_row.status,
    attendance_row.revision,
    p_decision,
    v_caller,
    p_expected_revision,
    v_result_revision,
    refund_row.id,
    pg_catalog.btrim(p_idempotency_key)
  );

  v_result := pg_catalog.jsonb_build_object(
    'deposit_id', deposit_row.id,
    'decision', p_decision,
    'deposit_revision', v_result_revision,
    'refund_request_id', refund_row.id
  );

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
  ) VALUES (
    'deposit',
    deposit_row.id,
    'manual_deposit_' || p_decision,
    v_caller,
    'authenticated',
    CURRENT_TIMESTAMP,
    pg_catalog.jsonb_build_object(
      'status', deposit_row.status,
      'revision', deposit_row.revision,
      'attendance_status', attendance_row.status,
      'attendance_revision', attendance_row.revision
    ),
    v_result,
    pg_catalog.btrim(p_idempotency_key)
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_tonight_manual_deposits(
  p_round_id UUID
)
RETURNS TABLE (
  deposit_id UUID,
  deposit_revision INTEGER,
  team_id UUID,
  team_code TEXT,
  subject_user_id UUID,
  subject_display_name TEXT,
  subject_phone TEXT,
  attendance_status TEXT,
  attendance_revision INTEGER
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
  IF p_round_id IS NULL THEN RAISE EXCEPTION 'round_id_required'; END IF;

  RETURN QUERY
  SELECT
    deposit.id,
    deposit.revision,
    team.id,
    team.team_code,
    attendance.user_id,
    profile.display_name,
    user_row.phone,
    attendance.status,
    attendance.revision
  FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
  JOIN public.tonight_teams AS team ON team.id = terminal_event.team_id
  JOIN public.tonight_deposits AS deposit ON deposit.id = terminal_event.deposit_id
  JOIN public.tonight_attendance AS attendance
    ON attendance.application_id = deposit.application_id
   AND attendance.team_id = team.id
  JOIN public.users AS user_row ON user_row.id = attendance.user_id
  LEFT JOIN public.profiles AS profile ON profile.user_id = attendance.user_id
  WHERE team.round_id = p_round_id
    AND terminal_event.disposition = 'manual_review'
    AND terminal_event.attendance_revision = attendance.revision
    AND attendance.status IN ('pending', 'no_show')
    AND deposit.status = 'held'
    AND NOT EXISTS (
      SELECT 1
      FROM quantum_private.tonight_manual_deposit_resolution_events AS resolution
      WHERE resolution.deposit_id = deposit.id
    )
  ORDER BY team.team_code, attendance.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tonight_deposit_terminal_exceptions(
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
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_caller) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_round_id IS NULL THEN RAISE EXCEPTION 'round_id_required'; END IF;

  RETURN QUERY
  SELECT
    'deposit_manual_review'::TEXT,
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
  FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
  JOIN public.tonight_teams AS team ON team.id = terminal_event.team_id
  JOIN public.tonight_deposits AS deposit ON deposit.id = terminal_event.deposit_id
  JOIN public.tonight_attendance AS attendance
    ON attendance.application_id = deposit.application_id
   AND attendance.team_id = team.id
  JOIN public.users AS user_row ON user_row.id = attendance.user_id
  LEFT JOIN public.profiles AS profile ON profile.user_id = attendance.user_id
  WHERE team.round_id = p_round_id
    AND terminal_event.disposition = 'manual_review'
    AND terminal_event.attendance_revision = attendance.revision
    AND attendance.status IN ('pending', 'no_show')
    AND deposit.status = 'held'
    AND NOT EXISTS (
      SELECT 1
      FROM quantum_private.tonight_manual_deposit_resolution_events AS resolution
      WHERE resolution.deposit_id = deposit.id
    )
  ORDER BY team.team_code, attendance.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_resolve_tonight_manual_deposit(
  UUID, TEXT, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_list_tonight_manual_deposits(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_deposit_terminal_exceptions(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.super_admin_resolve_tonight_manual_deposit(
  UUID, TEXT, INTEGER, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_list_tonight_manual_deposits(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_deposit_terminal_exceptions(UUID)
  TO authenticated;

COMMIT;
