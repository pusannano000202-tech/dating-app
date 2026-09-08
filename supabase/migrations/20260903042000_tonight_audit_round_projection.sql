-- Materialize the round relation for each immutable Tonight audit event once,
-- at write time. Round-scoped audit pages can then use one bounded keyset
-- index instead of re-running every entity-to-round join for every page row.

BEGIN;

CREATE TABLE quantum_private.tonight_audit_round_projection (
  round_id UUID NOT NULL
    REFERENCES public.tonight_rounds(id) ON DELETE RESTRICT,
  audit_id BIGINT NOT NULL
    REFERENCES quantum_private.tonight_audit_events(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (round_id, audit_id)
);

CREATE INDEX tonight_audit_round_projection_page_idx
  ON quantum_private.tonight_audit_round_projection
  (round_id, occurred_at DESC, audit_id DESC);

ALTER TABLE quantum_private.tonight_audit_round_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantum_private.tonight_audit_round_projection FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE quantum_private.tonight_audit_round_projection
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tonight_audit_round_projection_update_immutable
  BEFORE UPDATE
  ON quantum_private.tonight_audit_round_projection
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE TRIGGER tonight_audit_round_projection_delete_immutable
  BEFORE DELETE
  ON quantum_private.tonight_audit_round_projection
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.prevent_tonight_immutable_mutation();

CREATE OR REPLACE FUNCTION quantum_private.resolve_tonight_audit_round_ids(
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS TABLE (round_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT round_row.id
  FROM public.tonight_rounds AS round_row
  WHERE p_entity_type = 'round'
    AND round_row.id = p_entity_id

  UNION ALL

  SELECT application_row.round_id
  FROM public.tonight_applications AS application_row
  WHERE p_entity_type = 'application'
    AND application_row.id = p_entity_id

  UNION ALL

  SELECT capacity.round_id
  FROM public.tonight_venue_capacities AS capacity
  WHERE p_entity_type = 'venue_capacity'
    AND capacity.id = p_entity_id

  UNION ALL

  SELECT team.round_id
  FROM public.tonight_teams AS team
  WHERE p_entity_type = 'team'
    AND team.id = p_entity_id

  UNION ALL

  SELECT application_row.round_id
  FROM public.tonight_deposits AS deposit
  JOIN public.tonight_applications AS application_row
    ON application_row.id = deposit.application_id
  WHERE p_entity_type = 'deposit'
    AND deposit.id = p_entity_id

  UNION ALL

  SELECT application_row.round_id
  FROM quantum_private.tonight_deposit_reconciliation_jobs AS reconciliation_job
  JOIN public.tonight_deposits AS deposit
    ON deposit.id = reconciliation_job.deposit_id
  JOIN public.tonight_applications AS application_row
    ON application_row.id = deposit.application_id
  WHERE p_entity_type = 'deposit_reconciliation'
    AND reconciliation_job.id = p_entity_id

  UNION ALL

  SELECT application_row.round_id
  FROM public.tonight_deposit_refund_requests AS request
  JOIN public.tonight_deposits AS deposit
    ON deposit.id = request.deposit_id
  JOIN public.tonight_applications AS application_row
    ON application_row.id = deposit.application_id
  WHERE p_entity_type = 'refund_request'
    AND request.id = p_entity_id

  UNION ALL

  SELECT application_row.round_id
  FROM quantum_private.tonight_applicant_features AS feature
  JOIN public.tonight_applications AS application_row
    ON application_row.id = feature.application_id
  WHERE p_entity_type = 'applicant_feature'
    AND feature.application_id = p_entity_id

  UNION ALL

  SELECT team.round_id
  FROM public.tonight_attendance AS attendance
  JOIN public.tonight_teams AS team
    ON team.id = attendance.team_id
  WHERE p_entity_type = 'attendance'
    AND attendance.id = p_entity_id

  UNION ALL

  SELECT team.round_id
  FROM public.tonight_partner_service_confirmations AS confirmation
  JOIN public.tonight_teams AS team
    ON team.id = confirmation.team_id
  WHERE p_entity_type = 'service_confirmation'
    AND confirmation.id = p_entity_id

  UNION ALL

  SELECT team.round_id
  FROM quantum_private.tonight_partner_service_confirmation_attempts AS service_attempt
  JOIN public.tonight_teams AS team
    ON team.id = service_attempt.team_id
  WHERE p_entity_type = 'service_confirmation_attempt'
    AND service_attempt.id = p_entity_id

  UNION ALL

  SELECT team.round_id
  FROM public.tonight_settlements AS settlement
  JOIN public.tonight_teams AS team
    ON team.id = settlement.team_id
  WHERE p_entity_type = 'settlement'
    AND settlement.id = p_entity_id

  UNION ALL

  SELECT application_row.round_id
  FROM quantum_private.tonight_deposit_disposition_jobs AS disposition_job
  JOIN public.tonight_deposits AS deposit
    ON deposit.id = disposition_job.deposit_id
  JOIN public.tonight_applications AS application_row
    ON application_row.id = deposit.application_id
  WHERE p_entity_type = 'deposit_disposition_job'
    AND disposition_job.id = p_entity_id

  UNION ALL

  SELECT team.round_id
  FROM quantum_private.tonight_settlement_jobs AS settlement_job
  JOIN public.tonight_teams AS team
    ON team.id = settlement_job.team_id
  WHERE p_entity_type = 'settlement_job'
    AND settlement_job.id = p_entity_id

  UNION ALL

  SELECT team.round_id
  FROM quantum_private.tonight_call_attempts AS attempt
  JOIN public.tonight_teams AS team
    ON team.id = attempt.team_id
  WHERE p_entity_type = 'call_attempt'
    AND attempt.id = p_entity_id

  UNION ALL

  SELECT outbox.round_id
  FROM public.tonight_notification_outbox AS outbox
  WHERE p_entity_type = 'tonight_notification_outbox'
    AND outbox.id = p_entity_id

  UNION ALL

  SELECT outbox.round_id
  FROM public.tonight_push_deliveries AS delivery
  JOIN public.tonight_notification_outbox AS outbox
    ON outbox.notification_id = delivery.notification_id
  WHERE p_entity_type = 'tonight_push_delivery'
    AND delivery.id = p_entity_id

  UNION ALL

  SELECT membership_round.id
  FROM public.tonight_market_memberships AS membership
  JOIN public.tonight_rounds AS membership_round
    ON membership_round.market_code = membership.market_code
  WHERE p_entity_type = 'market_membership'
    AND membership.id = p_entity_id;
$$;

REVOKE ALL ON FUNCTION quantum_private.resolve_tonight_audit_round_ids(TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION quantum_private.project_tonight_audit_round()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO quantum_private.tonight_audit_round_projection (
    round_id,
    audit_id,
    occurred_at
  )
  SELECT resolved.round_id, NEW.id, NEW.occurred_at
  FROM quantum_private.resolve_tonight_audit_round_ids(
    NEW.entity_type,
    NEW.entity_id
  ) AS resolved
  ON CONFLICT (round_id, audit_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.project_tonight_audit_round()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION quantum_private.project_tonight_market_audits_for_round()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO quantum_private.tonight_audit_round_projection (
    round_id,
    audit_id,
    occurred_at
  )
  SELECT NEW.id, audit.id, audit.occurred_at
  FROM quantum_private.tonight_audit_events AS audit
  JOIN public.tonight_market_memberships AS membership
    ON membership.id = audit.entity_id
  WHERE audit.entity_type = 'market_membership'
    AND membership.market_code = NEW.market_code
  ON CONFLICT (round_id, audit_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.project_tonight_market_audits_for_round()
  FROM PUBLIC, anon, authenticated, service_role;

-- These locks close the gap between installing the maintenance triggers and
-- backfilling existing rows. They are held only for this migration transaction.
LOCK TABLE public.tonight_rounds, quantum_private.tonight_audit_events
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TRIGGER tonight_audit_events_project_round
  AFTER INSERT
  ON quantum_private.tonight_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.project_tonight_audit_round();

CREATE TRIGGER tonight_rounds_project_market_membership_audits
  AFTER INSERT
  ON public.tonight_rounds
  FOR EACH ROW
  EXECUTE FUNCTION quantum_private.project_tonight_market_audits_for_round();

INSERT INTO quantum_private.tonight_audit_round_projection (
  round_id,
  audit_id,
  occurred_at
)
SELECT resolved.round_id, audit.id, audit.occurred_at
FROM quantum_private.tonight_audit_events AS audit
CROSS JOIN LATERAL quantum_private.resolve_tonight_audit_round_ids(
  audit.entity_type,
  audit.entity_id
) AS resolved
ON CONFLICT (round_id, audit_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.super_admin_list_tonight_audit_events(
  p_round_id UUID,
  p_before_occurred_at TIMESTAMPTZ,
  p_before_id BIGINT,
  p_limit INTEGER
)
RETURNS TABLE (
  audit_id BIGINT,
  audit_cursor_id TEXT,
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

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  IF (p_before_occurred_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_audit_cursor';
  END IF;
  IF p_round_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tonight_rounds AS round_row
    WHERE round_row.id = p_round_id
  ) THEN
    RAISE EXCEPTION 'tonight_round_not_found';
  END IF;

  IF p_round_id IS NULL THEN
    RETURN QUERY
    SELECT
      audit.id,
      audit.id::TEXT AS audit_cursor_id,
      audit.entity_type,
      audit.entity_id,
      audit.action,
      audit.actor_user_id,
      audit.actor_kind,
      audit.occurred_at,
      audit.before_state,
      audit.after_state
    FROM quantum_private.tonight_audit_events AS audit
    WHERE p_before_occurred_at IS NULL
      OR (audit.occurred_at, audit.id) < (p_before_occurred_at, p_before_id)
    ORDER BY audit.occurred_at DESC, audit.id DESC
    LIMIT p_limit + 1;
  ELSE
    RETURN QUERY
    SELECT
      audit.id,
      audit.id::TEXT AS audit_cursor_id,
      audit.entity_type,
      audit.entity_id,
      audit.action,
      audit.actor_user_id,
      audit.actor_kind,
      audit.occurred_at,
      audit.before_state,
      audit.after_state
    FROM quantum_private.tonight_audit_round_projection AS projection
    JOIN quantum_private.tonight_audit_events AS audit
      ON audit.id = projection.audit_id
    WHERE projection.round_id = p_round_id
      AND (
        p_before_occurred_at IS NULL
        OR (projection.occurred_at, projection.audit_id) < (p_before_occurred_at, p_before_id)
      )
    ORDER BY projection.occurred_at DESC, projection.audit_id DESC
    LIMIT p_limit + 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_list_tonight_audit_events(
  UUID, TIMESTAMPTZ, BIGINT, INTEGER
)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_list_tonight_audit_events(
  UUID, TIMESTAMPTZ, BIGINT, INTEGER
)
  TO authenticated;

COMMIT;
