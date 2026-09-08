-- Classify every paid Tonight deposit after the venue confirms service.
-- Arrived or excused members receive a full refund through the existing queue.
-- No-shows remain held for manual review and are never automatically forfeited.

BEGIN;

CREATE TABLE quantum_private.tonight_deposit_terminal_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deposit_id UUID NOT NULL
    REFERENCES public.tonight_deposits(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL REFERENCES public.tonight_teams(id) ON DELETE RESTRICT,
  attendance_status TEXT NOT NULL CHECK (
    attendance_status IN ('pending', 'arrived', 'no_show', 'excused')
  ),
  attendance_revision INTEGER NOT NULL CHECK (attendance_revision >= 0),
  disposition TEXT NOT NULL CHECK (disposition IN ('refund_queued', 'manual_review')),
  refund_request_id UUID REFERENCES public.tonight_deposit_refund_requests(id) ON DELETE RESTRICT,
  request_deposit_revision INTEGER NOT NULL CHECK (request_deposit_revision >= 0),
  result_deposit_revision INTEGER NOT NULL CHECK (result_deposit_revision >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  classified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (deposit_id, attendance_revision),
  CONSTRAINT tonight_deposit_terminal_result_consistency CHECK (
    (disposition = 'refund_queued' AND refund_request_id IS NOT NULL)
    OR (disposition = 'manual_review' AND refund_request_id IS NULL)
  )
);

CREATE INDEX tonight_deposit_terminal_events_team_idx
  ON quantum_private.tonight_deposit_terminal_events (team_id, disposition);

ALTER TABLE quantum_private.tonight_deposit_terminal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE quantum_private.tonight_deposit_terminal_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE quantum_private.tonight_deposit_terminal_events_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tonight_deposit_terminal_events_update_immutable
  BEFORE UPDATE ON quantum_private.tonight_deposit_terminal_events
  FOR EACH ROW EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();
CREATE TRIGGER tonight_deposit_terminal_events_delete_immutable
  BEFORE DELETE ON quantum_private.tonight_deposit_terminal_events
  FOR EACH ROW EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE OR REPLACE FUNCTION public.service_list_tonight_unfinalized_deposits(
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  deposit_id UUID,
  deposit_revision INTEGER,
  team_id UUID,
  attendance_status TEXT,
  attendance_revision INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_limit IS NULL THEN
    RAISE EXCEPTION 'invalid_deposit_disposition_limit';
  END IF;

  RETURN QUERY
  SELECT
    deposit.id,
    deposit.revision,
    team.id,
    attendance.status,
    attendance.revision
  FROM public.tonight_partner_service_confirmations AS confirmation
  JOIN public.tonight_teams AS team ON team.id = confirmation.team_id
  JOIN public.tonight_team_members AS member ON member.team_id = team.id
  JOIN public.tonight_attendance AS attendance
    ON attendance.team_id = team.id
   AND attendance.application_id = member.application_id
  JOIN public.tonight_deposits AS deposit
    ON deposit.application_id = member.application_id
  WHERE team.status = 'completed'
    -- Reconciliation-required is not proof of a captured charge. Wait for the
    -- provider recovery worker to resolve it to paid/held before classifying
    -- attendance, otherwise a no-show event can permanently strand later pay.
    AND deposit.status IN ('paid', 'held')
    AND NOT EXISTS (
      SELECT 1
      FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
      WHERE terminal_event.deposit_id = deposit.id
        AND terminal_event.attendance_revision = attendance.revision
    )
  ORDER BY confirmation.service_completed_at, team.id, member.seat_number
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.service_finalize_tonight_deposit_disposition(
  p_deposit_id UUID,
  p_expected_revision INTEGER,
  p_expected_attendance_revision INTEGER,
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
  terminal_row quantum_private.tonight_deposit_terminal_events%ROWTYPE;
  v_team_id UUID;
  v_refund_request_id UUID;
  v_disposition TEXT;
  v_result_revision INTEGER;
  v_result JSONB;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_deposit_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_expected_attendance_revision IS NULL OR p_expected_attendance_revision < 0 THEN
    RAISE EXCEPTION 'invalid_deposit_disposition_request';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  SELECT terminal_event.*
  INTO terminal_row
  FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
  WHERE terminal_event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF terminal_row.deposit_id <> p_deposit_id
      OR terminal_row.request_deposit_revision <> p_expected_revision
      OR terminal_row.attendance_revision <> p_expected_attendance_revision THEN
      RAISE EXCEPTION 'deposit_disposition_idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'disposition', terminal_row.disposition,
      'refund_request_id', terminal_row.refund_request_id,
      'deposit_revision', terminal_row.result_deposit_revision
    );
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

  -- Use the same team -> attendance -> deposit lock order as arrival and
  -- service confirmation so the terminal decision has one canonical snapshot.
  SELECT team.*
  INTO team_row
  FROM public.tonight_teams AS team
  WHERE team.id = v_team_id
  FOR UPDATE;

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
  FOR UPDATE;

  -- A second worker may have completed while this transaction waited on the
  -- team lock. Re-read the immutable event before making any change.
  SELECT terminal_event.*
  INTO terminal_row
  FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
  WHERE terminal_event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF terminal_row.deposit_id <> p_deposit_id
      OR terminal_row.request_deposit_revision <> p_expected_revision
      OR terminal_row.attendance_revision <> p_expected_attendance_revision THEN
      RAISE EXCEPTION 'deposit_disposition_idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'disposition', terminal_row.disposition,
      'refund_request_id', terminal_row.refund_request_id,
      'deposit_revision', terminal_row.result_deposit_revision
    );
  END IF;

  IF team_row.status <> 'completed'
    OR NOT EXISTS (
      SELECT 1
      FROM public.tonight_partner_service_confirmations AS confirmation
      WHERE confirmation.team_id = team_row.id
    ) THEN
    RAISE EXCEPTION 'partner_service_confirmation_required';
  END IF;
  IF deposit_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;
  IF attendance_row.revision <> p_expected_attendance_revision THEN
    RAISE EXCEPTION 'stale_revision';
  END IF;
  IF deposit_row.status NOT IN ('paid', 'held') THEN
    RAISE EXCEPTION 'deposit_disposition_not_eligible';
  END IF;

  IF attendance_row.status IN ('arrived', 'excused') THEN
    UPDATE public.tonight_deposits AS deposit
    SET status = 'refund_requested',
        revision = deposit.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE deposit.id = deposit_row.id
      AND deposit.revision = p_expected_revision;
    v_result_revision := p_expected_revision + 1;

    INSERT INTO public.tonight_deposit_refund_requests (
      deposit_id,
      requested_by,
      idempotency_key
    )
    VALUES (
      deposit_row.id,
      deposit_row.user_id,
      p_idempotency_key || ':refund'
    )
    ON CONFLICT (deposit_id) DO NOTHING
    RETURNING id INTO v_refund_request_id;
    IF v_refund_request_id IS NULL THEN
      SELECT refund_request.id
      INTO v_refund_request_id
      FROM public.tonight_deposit_refund_requests AS refund_request
      WHERE refund_request.deposit_id = deposit_row.id;
    END IF;
    IF v_refund_request_id IS NULL THEN
      RAISE EXCEPTION 'refund_queue_write_failed';
    END IF;
    v_disposition := 'refund_queued';
  ELSE
    UPDATE public.tonight_deposits AS deposit
    SET status = CASE
          WHEN deposit_row.status = 'paid' THEN 'held'
          ELSE deposit_row.status
        END,
        held_at = CASE
          WHEN deposit_row.status = 'paid' THEN CURRENT_TIMESTAMP
          ELSE deposit.held_at
        END,
        revision = CASE
          WHEN deposit_row.status = 'paid' THEN deposit.revision + 1
          ELSE deposit.revision
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE deposit.id = deposit_row.id
      AND deposit.revision = p_expected_revision
    RETURNING deposit.revision INTO v_result_revision;
    v_disposition := 'manual_review';
  END IF;

  INSERT INTO quantum_private.tonight_deposit_terminal_events (
    deposit_id,
    team_id,
    attendance_status,
    attendance_revision,
    disposition,
    refund_request_id,
    request_deposit_revision,
    result_deposit_revision,
    idempotency_key
  )
  VALUES (
    deposit_row.id,
    team_row.id,
    attendance_row.status,
    attendance_row.revision,
    v_disposition,
    v_refund_request_id,
    p_expected_revision,
    v_result_revision,
    p_idempotency_key
  );

  v_result := pg_catalog.jsonb_build_object(
    'disposition', v_disposition,
    'refund_request_id', v_refund_request_id,
    'deposit_revision', v_result_revision
  );
  PERFORM quantum_private.write_tonight_audit(
    'deposit',
    deposit_row.id,
    'completed_service_deposit_classified',
    pg_catalog.to_jsonb(deposit_row),
    v_result || pg_catalog.jsonb_build_object(
      'attendance_status', attendance_row.status,
      'team_id', team_row.id
    ),
    p_idempotency_key
  );
  RETURN v_result;
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
  JOIN public.users AS user_row ON user_row.id = attendance.user_id
  LEFT JOIN public.profiles AS profile ON profile.user_id = attendance.user_id
  WHERE team.round_id = p_round_id
    AND terminal_event.disposition = 'manual_review'
    AND terminal_event.attendance_revision = attendance.revision
    AND attendance.status IN ('pending', 'no_show')
  ORDER BY team.team_code, attendance.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.service_list_tonight_unfinalized_deposits(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_finalize_tonight_deposit_disposition(UUID, INTEGER, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_deposit_terminal_exceptions(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.service_list_tonight_unfinalized_deposits(INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.service_finalize_tonight_deposit_disposition(UUID, INTEGER, INTEGER, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_deposit_terminal_exceptions(UUID)
  TO authenticated;

COMMIT;
