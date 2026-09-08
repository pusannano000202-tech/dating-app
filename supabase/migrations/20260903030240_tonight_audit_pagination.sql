-- Add a stable bounded keyset page for the super-admin Tonight audit ledger.
-- Retire the legacy raw bulk reader in the same release candidate so every
-- audit read is bounded, cursor-based, and sanitized by the application API.

BEGIN;

CREATE INDEX IF NOT EXISTS tonight_audit_events_recent_idx
  ON quantum_private.tonight_audit_events (occurred_at DESC, id DESC);

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
  WHERE
    (
      p_before_occurred_at IS NULL
      OR (audit.occurred_at, audit.id) < (p_before_occurred_at, p_before_id)
    )
    AND (
      p_round_id IS NULL
      OR (audit.entity_type = 'round' AND audit.entity_id = p_round_id)
      OR (
        audit.entity_type = 'application'
        AND EXISTS (
          SELECT 1
          FROM public.tonight_applications AS application_row
          WHERE application_row.id = audit.entity_id
            AND application_row.round_id = p_round_id
        )
      )
      OR (
        audit.entity_type = 'venue_capacity'
        AND EXISTS (
          SELECT 1
          FROM public.tonight_venue_capacities AS capacity
          WHERE capacity.id = audit.entity_id
            AND capacity.round_id = p_round_id
        )
      )
      OR (
        audit.entity_type = 'team'
        AND EXISTS (
          SELECT 1
          FROM public.tonight_teams AS team
          WHERE team.id = audit.entity_id
            AND team.round_id = p_round_id
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
        audit.entity_type = 'deposit_reconciliation'
        AND EXISTS (
          SELECT 1
          FROM quantum_private.tonight_deposit_reconciliation_jobs AS reconciliation_job
          JOIN public.tonight_deposits AS deposit
            ON deposit.id = reconciliation_job.deposit_id
          JOIN public.tonight_applications AS application_row
            ON application_row.id = deposit.application_id
          WHERE reconciliation_job.id = audit.entity_id
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
          WHERE attendance.id = audit.entity_id
            AND team.round_id = p_round_id
        )
      )
      OR (
        audit.entity_type = 'service_confirmation'
        AND EXISTS (
          SELECT 1
          FROM public.tonight_partner_service_confirmations AS confirmation
          JOIN public.tonight_teams AS team ON team.id = confirmation.team_id
          WHERE confirmation.id = audit.entity_id
            AND team.round_id = p_round_id
        )
      )
      OR (
        audit.entity_type = 'service_confirmation_attempt'
        AND EXISTS (
          SELECT 1
          FROM quantum_private.tonight_partner_service_confirmation_attempts AS service_attempt
          JOIN public.tonight_teams AS team ON team.id = service_attempt.team_id
          WHERE service_attempt.id = audit.entity_id
            AND team.round_id = p_round_id
        )
      )
      OR (
        audit.entity_type = 'settlement'
        AND EXISTS (
          SELECT 1
          FROM public.tonight_settlements AS settlement
          JOIN public.tonight_teams AS team ON team.id = settlement.team_id
          WHERE settlement.id = audit.entity_id
            AND team.round_id = p_round_id
        )
      )
      OR (
        audit.entity_type = 'deposit_disposition_job'
        AND EXISTS (
          SELECT 1
          FROM quantum_private.tonight_deposit_disposition_jobs AS disposition_job
          JOIN public.tonight_deposits AS deposit
            ON deposit.id = disposition_job.deposit_id
          JOIN public.tonight_applications AS application_row
            ON application_row.id = deposit.application_id
          WHERE disposition_job.id = audit.entity_id
            AND application_row.round_id = p_round_id
        )
      )
      OR (
        audit.entity_type = 'settlement_job'
        AND EXISTS (
          SELECT 1
          FROM quantum_private.tonight_settlement_jobs AS settlement_job
          JOIN public.tonight_teams AS team ON team.id = settlement_job.team_id
          WHERE settlement_job.id = audit.entity_id
            AND team.round_id = p_round_id
        )
      )
      OR (
        audit.entity_type = 'call_attempt'
        AND EXISTS (
          SELECT 1
          FROM quantum_private.tonight_call_attempts AS attempt
          JOIN public.tonight_teams AS team ON team.id = attempt.team_id
          WHERE attempt.id = audit.entity_id
            AND team.round_id = p_round_id
        )
      )
      OR (
        audit.entity_type = 'tonight_notification_outbox'
        AND EXISTS (
          SELECT 1
          FROM public.tonight_notification_outbox AS outbox
          WHERE outbox.id = audit.entity_id
            AND outbox.round_id = p_round_id
        )
      )
      OR (
        audit.entity_type = 'tonight_push_delivery'
        AND EXISTS (
          SELECT 1
          FROM public.tonight_push_deliveries AS delivery
          JOIN public.tonight_notification_outbox AS outbox
            ON outbox.notification_id = delivery.notification_id
          WHERE delivery.id = audit.entity_id
            AND outbox.round_id = p_round_id
        )
      )
      OR (
        audit.entity_type = 'market_membership'
        AND EXISTS (
          SELECT 1
          FROM public.tonight_market_memberships AS membership
          JOIN public.tonight_rounds AS membership_round
            ON membership_round.market_code = membership.market_code
          WHERE membership.id = audit.entity_id
            AND membership_round.id = p_round_id
        )
      )
    )
  ORDER BY audit.occurred_at DESC, audit.id DESC
  LIMIT p_limit + 1;
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

REVOKE ALL ON FUNCTION public.super_admin_list_tonight_audit_events(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.super_admin_list_tonight_audit_events(UUID, INTEGER);

COMMIT;
