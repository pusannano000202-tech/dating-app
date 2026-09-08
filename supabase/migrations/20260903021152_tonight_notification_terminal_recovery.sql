-- Makes terminal Tonight notification failures visible without leaking push
-- credentials or participant PII, and lets only a recently reauthenticated
-- super-admin either requeue the job or identify that the user must
-- resubscribe. All mutations are revisioned and append an immutable audit.

BEGIN;

ALTER TABLE public.tonight_notification_outbox
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT tonight_notification_outbox_revision_check
    CHECK (revision >= 0);

ALTER TABLE public.tonight_push_deliveries
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT tonight_push_deliveries_revision_check
    CHECK (revision >= 0);

CREATE INDEX tonight_notification_outbox_failed_round_idx
  ON public.tonight_notification_outbox (round_id, updated_at DESC, id DESC)
  WHERE status = 'failed';

CREATE INDEX tonight_push_deliveries_failed_idx
  ON public.tonight_push_deliveries (updated_at DESC, id DESC)
  WHERE status = 'failed';

CREATE OR REPLACE FUNCTION quantum_private.is_tonight_notification_retry_open(
  p_round_id UUID,
  p_team_id UUID,
  p_recipient_user_id UUID,
  p_audience TEXT,
  p_event_type TEXT,
  p_scheduled_for TIMESTAMPTZ,
  p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tonight_rounds AS round_row
    JOIN public.tonight_teams AS team
      ON team.id = p_team_id
     AND team.round_id = round_row.id
    WHERE round_row.id = p_round_id
      AND p_recipient_user_id IS NOT NULL
      AND p_scheduled_for <= p_now
      AND round_row.status NOT IN ('completed', 'cancelled')
      AND (
        (
          p_audience = 'participant'
          AND p_event_type = 'allocation_published'
          AND p_now < round_row.deposit_due_at
          AND team.status <> 'cancelled'
          AND EXISTS (
            SELECT 1
            FROM public.tonight_team_members AS member
            WHERE member.team_id = team.id
              AND member.user_id = p_recipient_user_id
              AND member.member_status <> 'cancelled'
          )
        )
        OR (
          p_audience = 'participant'
          AND p_event_type = 'deposit_due'
          AND p_now < round_row.deposit_due_at
          AND team.status = 'deposit_pending'
          AND EXISTS (
            SELECT 1
            FROM public.tonight_team_members AS member
            JOIN public.tonight_deposits AS deposit
              ON deposit.application_id = member.application_id
             AND deposit.user_id = member.user_id
            WHERE member.team_id = team.id
              AND member.user_id = p_recipient_user_id
              AND member.member_status <> 'cancelled'
              AND deposit.status IN ('initiated', 'pending')
          )
        )
        OR (
          p_audience = 'partner'
          AND p_event_type = 'partner_acceptance_due'
          AND p_now < round_row.partner_acceptance_due_at
          AND team.status = 'partner_pending'
          AND EXISTS (
            SELECT 1
            FROM public.tonight_venue_capacities AS capacity
            JOIN public.venue_partner_memberships AS membership
              ON membership.venue_id = capacity.venue_id
             AND membership.user_id = p_recipient_user_id
             AND membership.revoked_at IS NULL
            WHERE capacity.id = team.venue_capacity_id
          )
        )
        OR (
          p_audience = 'participant'
          AND p_event_type = 'venue_revealed'
          AND p_now <= round_row.starts_at
          AND team.status IN ('accepted', 'revealed', 'in_progress', 'completed')
          AND EXISTS (
            SELECT 1
            FROM public.tonight_team_members AS member
            WHERE member.team_id = team.id
              AND member.user_id = p_recipient_user_id
              AND member.member_status <> 'cancelled'
          )
        )
        OR (
          p_audience = 'participant'
          AND p_event_type = 'arrival_due'
          AND p_now <= round_row.starts_at
          AND team.status IN ('accepted', 'revealed', 'in_progress', 'completed')
          AND EXISTS (
            SELECT 1
            FROM public.tonight_team_members AS member
            WHERE member.team_id = team.id
              AND member.user_id = p_recipient_user_id
              AND member.member_status <> 'cancelled'
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_tonight_notification_failures(
  p_round_id UUID,
  p_before_failed_at TIMESTAMPTZ DEFAULT NULL,
  p_before_failure_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  failure_kind TEXT,
  failure_id UUID,
  failure_revision INTEGER,
  round_id UUID,
  team_id UUID,
  event_type TEXT,
  recipient_ref TEXT,
  team_ref TEXT,
  failure_code TEXT,
  attempt_count INTEGER,
  failed_at TIMESTAMPTZ,
  resubscribe_required BOOLEAN
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
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_round_id IS NULL THEN RAISE EXCEPTION 'round_id_required'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  IF (p_before_failed_at IS NULL AND p_before_failure_id IS NOT NULL)
    OR (p_before_failed_at IS NOT NULL AND p_before_failure_id IS NULL)
  THEN
    RAISE EXCEPTION 'cursor_pair_required';
  END IF;

  RETURN QUERY
  WITH failures AS (
    SELECT
      'in_app'::TEXT AS failure_kind,
      outbox.id AS failure_id,
      outbox.revision AS failure_revision,
      outbox.round_id,
      outbox.team_id,
      outbox.event_type,
      'usr_' || pg_catalog.left(
        pg_catalog.md5(outbox.round_id::TEXT || ':' || outbox.recipient_user_id::TEXT),
        12
      ) AS recipient_ref,
      CASE WHEN outbox.team_id IS NULL THEN NULL ELSE
        'team_' || pg_catalog.left(
          pg_catalog.md5(outbox.round_id::TEXT || ':' || outbox.team_id::TEXT),
          12
        )
      END AS team_ref,
      CASE
        WHEN outbox.last_error_code IN (
          'in_app_delivery_failed',
          'invalid_completion_result',
          'lease_expired_after_max_attempts'
        ) THEN outbox.last_error_code
        ELSE 'notification_delivery_failed'
      END AS failure_code,
      outbox.attempt_count,
      outbox.updated_at AS failed_at,
      FALSE AS resubscribe_required
    FROM public.tonight_notification_outbox AS outbox
    WHERE outbox.round_id = p_round_id
      AND outbox.status = 'failed'

    UNION ALL

    SELECT
      'push'::TEXT,
      delivery.id,
      delivery.revision,
      outbox.round_id,
      outbox.team_id,
      outbox.event_type,
      'usr_' || pg_catalog.left(
        pg_catalog.md5(outbox.round_id::TEXT || ':' || delivery.user_id::TEXT),
        12
      ),
      CASE WHEN outbox.team_id IS NULL THEN NULL ELSE
        'team_' || pg_catalog.left(
          pg_catalog.md5(outbox.round_id::TEXT || ':' || outbox.team_id::TEXT),
          12
        )
      END,
      CASE
        WHEN delivery.last_error_code ~ '^push_http_[0-9]{3}$'
          OR delivery.last_error_code IN (
            'push_send_failed',
            'lease_expired_after_max_attempts',
            'resubscribe_required'
          ) THEN delivery.last_error_code
        ELSE 'push_delivery_failed'
      END,
      delivery.attempt_count,
      delivery.updated_at,
      subscription.revoked_at IS NOT NULL
    FROM public.tonight_push_deliveries AS delivery
    JOIN public.tonight_push_subscriptions AS subscription
      ON subscription.id = delivery.subscription_id
    JOIN public.tonight_notification_outbox AS outbox
      ON outbox.notification_id = delivery.notification_id
    WHERE outbox.round_id = p_round_id
      AND delivery.status = 'failed'
  )
  SELECT failures.*
  FROM failures
  WHERE p_before_failed_at IS NULL
    OR (failures.failed_at, failures.failure_id) < (p_before_failed_at, p_before_failure_id)
  ORDER BY failures.failed_at DESC, failures.failure_id DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_retry_tonight_notification_failure(
  p_failure_kind TEXT,
  p_failure_id UUID,
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
  v_kind TEXT := pg_catalog.btrim(COALESCE(p_failure_kind, ''));
  v_entity_type TEXT;
  v_outbox public.tonight_notification_outbox%ROWTYPE;
  v_delivery public.tonight_push_deliveries%ROWTYPE;
  v_subscription_revoked_at TIMESTAMPTZ;
  v_audit quantum_private.tonight_audit_events%ROWTYPE;
  v_new_revision INTEGER;
  v_retry_open BOOLEAN;
  v_before JSONB;
  v_after JSONB;
  v_result JSONB;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);

  IF v_kind NOT IN ('in_app', 'push') THEN
    RAISE EXCEPTION 'invalid_failure_kind';
  END IF;
  IF p_failure_id IS NULL THEN RAISE EXCEPTION 'failure_id_required'; END IF;
  IF p_expected_revision IS NULL
    OR p_expected_revision < 0
    OR p_expected_revision >= 2147483647
  THEN
    RAISE EXCEPTION 'expected_revision_required';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128
    OR pg_catalog.btrim(p_idempotency_key) !~ '^[A-Za-z0-9:_-]+$'
  THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  v_entity_type := CASE
    WHEN v_kind = 'in_app' THEN 'tonight_notification_outbox'
    ELSE 'tonight_push_delivery'
  END;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_entity_type || ':' || p_failure_id::TEXT, 0)
  );

  SELECT audit.* INTO v_audit
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = v_entity_type
    AND audit.idempotency_key = pg_catalog.btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_audit.entity_id <> p_failure_id
      OR v_audit.action <> 'notification_failure_recovery_requested'
      OR v_audit.before_state ->> 'failure_kind' <> v_kind
      OR (v_audit.before_state ->> 'revision')::INTEGER <> p_expected_revision
      OR pg_catalog.jsonb_typeof(v_audit.after_state -> 'result') <> 'object'
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_audit.after_state -> 'result';
  END IF;

  IF v_kind = 'in_app' THEN
    SELECT outbox.* INTO v_outbox
    FROM public.tonight_notification_outbox AS outbox
    WHERE outbox.id = p_failure_id
    FOR UPDATE OF outbox;

    IF NOT FOUND THEN RAISE EXCEPTION 'notification_failure_not_found'; END IF;
    IF v_outbox.revision <> p_expected_revision THEN
      RAISE EXCEPTION 'stale_revision';
    END IF;
    IF v_outbox.status <> 'failed' THEN
      RAISE EXCEPTION 'notification_failure_not_retryable';
    END IF;

    v_before := pg_catalog.jsonb_build_object(
      'failure_kind', v_kind,
      'status', v_outbox.status,
      'attempt_count', v_outbox.attempt_count,
      'revision', v_outbox.revision,
      'round_id', v_outbox.round_id,
      'team_id', v_outbox.team_id,
      'event_type', v_outbox.event_type
    );

    v_retry_open := quantum_private.is_tonight_notification_retry_open(
      v_outbox.round_id,
      v_outbox.team_id,
      v_outbox.recipient_user_id,
      v_outbox.audience,
      v_outbox.event_type,
      v_outbox.scheduled_for,
      CURRENT_TIMESTAMP
    );

    IF v_retry_open THEN
      UPDATE public.tonight_notification_outbox AS outbox
      SET status = 'pending',
          attempt_count = 0,
          available_at = CURRENT_TIMESTAMP,
          locked_at = NULL,
          last_error_code = NULL,
          revision = outbox.revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE outbox.id = p_failure_id
        AND outbox.revision = p_expected_revision
        AND outbox.status = 'failed'
      RETURNING outbox.revision INTO v_new_revision;

      IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;
      v_result := pg_catalog.jsonb_build_object(
        'failure_kind', v_kind,
        'failure_id', p_failure_id,
        'revision', v_new_revision,
        'outcome', 'retry_queued',
        'retry_queued', TRUE,
        'resubscribe_required', FALSE,
        'user_notice_queued', FALSE
      );
      v_after := pg_catalog.jsonb_build_object(
        'failure_kind', v_kind,
        'status', 'pending',
        'attempt_count', 0,
        'revision', v_new_revision,
        'result', v_result
      );
    ELSE
      UPDATE public.tonight_notification_outbox AS outbox
      SET status = 'cancelled',
          locked_at = NULL,
          last_error_code = 'notification_window_expired',
          revision = outbox.revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE outbox.id = p_failure_id
        AND outbox.revision = p_expected_revision
        AND outbox.status = 'failed'
      RETURNING outbox.revision INTO v_new_revision;

      IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;
      v_result := pg_catalog.jsonb_build_object(
        'failure_kind', v_kind,
        'failure_id', p_failure_id,
        'revision', v_new_revision,
        'outcome', 'expired',
        'retry_queued', FALSE,
        'resubscribe_required', FALSE,
        'user_notice_queued', FALSE
      );
      v_after := pg_catalog.jsonb_build_object(
        'failure_kind', v_kind,
        'status', 'cancelled',
        'attempt_count', v_outbox.attempt_count,
        'revision', v_new_revision,
        'result', v_result
      );
    END IF;
  ELSE
    SELECT delivery.* INTO v_delivery
    FROM public.tonight_push_deliveries AS delivery
    WHERE delivery.id = p_failure_id
    FOR UPDATE OF delivery;

    IF NOT FOUND THEN RAISE EXCEPTION 'notification_failure_not_found'; END IF;
    IF v_delivery.revision <> p_expected_revision THEN
      RAISE EXCEPTION 'stale_revision';
    END IF;
    IF v_delivery.status <> 'failed' THEN
      RAISE EXCEPTION 'notification_failure_not_retryable';
    END IF;

    SELECT outbox.* INTO v_outbox
    FROM public.tonight_notification_outbox AS outbox
    WHERE outbox.notification_id = v_delivery.notification_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'notification_context_not_found'; END IF;

    SELECT subscription.revoked_at INTO v_subscription_revoked_at
    FROM public.tonight_push_subscriptions AS subscription
    WHERE subscription.id = v_delivery.subscription_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'push_subscription_not_found'; END IF;

    v_retry_open := quantum_private.is_tonight_notification_retry_open(
      v_outbox.round_id,
      v_outbox.team_id,
      v_delivery.user_id,
      v_outbox.audience,
      v_outbox.event_type,
      v_outbox.scheduled_for,
      CURRENT_TIMESTAMP
    );

    v_before := pg_catalog.jsonb_build_object(
      'failure_kind', v_kind,
      'status', v_delivery.status,
      'attempt_count', v_delivery.attempt_count,
      'revision', v_delivery.revision,
      'notification_id', v_delivery.notification_id
    );

    IF NOT v_retry_open THEN
      UPDATE public.tonight_push_deliveries AS delivery
      SET status = 'cancelled',
          locked_at = NULL,
          last_error_code = 'notification_window_expired',
          revision = delivery.revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE delivery.id = p_failure_id
        AND delivery.revision = p_expected_revision
        AND delivery.status = 'failed'
      RETURNING delivery.revision INTO v_new_revision;

      IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;
      v_result := pg_catalog.jsonb_build_object(
        'failure_kind', v_kind,
        'failure_id', p_failure_id,
        'revision', v_new_revision,
        'outcome', 'expired',
        'retry_queued', FALSE,
        'resubscribe_required', FALSE,
        'user_notice_queued', FALSE
      );
      v_after := pg_catalog.jsonb_build_object(
        'failure_kind', v_kind,
        'status', 'cancelled',
        'attempt_count', v_delivery.attempt_count,
        'revision', v_new_revision,
        'result', v_result
      );
    ELSIF v_subscription_revoked_at IS NULL THEN
      UPDATE public.tonight_push_deliveries AS delivery
      SET status = 'pending',
          attempt_count = 0,
          available_at = CURRENT_TIMESTAMP,
          locked_at = NULL,
          sent_at = NULL,
          last_error_code = NULL,
          revision = delivery.revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE delivery.id = p_failure_id
        AND delivery.revision = p_expected_revision
        AND delivery.status = 'failed'
      RETURNING delivery.revision INTO v_new_revision;

      IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;
      v_result := pg_catalog.jsonb_build_object(
        'failure_kind', v_kind,
        'failure_id', p_failure_id,
        'revision', v_new_revision,
        'outcome', 'retry_queued',
        'retry_queued', TRUE,
        'resubscribe_required', FALSE,
        'user_notice_queued', FALSE
      );
      v_after := pg_catalog.jsonb_build_object(
        'failure_kind', v_kind,
        'status', 'pending',
        'attempt_count', 0,
        'revision', v_new_revision,
        'result', v_result
      );
    ELSE
      UPDATE public.tonight_push_deliveries AS delivery
      SET status = 'cancelled',
          locked_at = NULL,
          last_error_code = 'resubscribe_required',
          revision = delivery.revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE delivery.id = p_failure_id
        AND delivery.revision = p_expected_revision
        AND delivery.status = 'failed'
      RETURNING delivery.revision INTO v_new_revision;

      IF NOT FOUND THEN RAISE EXCEPTION 'stale_revision'; END IF;

      INSERT INTO public.notifications (user_id, kind, payload)
      VALUES (
        v_delivery.user_id,
        'tonight_journey',
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'round_id', v_outbox.round_id,
          'team_id', v_outbox.team_id,
          'event_type', 'push_resubscribe_required',
          'event_key', 'round:' || v_outbox.round_id::TEXT
            || ':push_resubscribe_required',
          'audience', v_outbox.audience,
          'scheduled_at', CURRENT_TIMESTAMP
        ))
      )
      ON CONFLICT DO NOTHING;

      v_result := pg_catalog.jsonb_build_object(
        'failure_kind', v_kind,
        'failure_id', p_failure_id,
        'revision', v_new_revision,
        'outcome', 'resubscribe_required',
        'retry_queued', FALSE,
        'resubscribe_required', TRUE,
        'user_notice_queued', TRUE
      );
      v_after := pg_catalog.jsonb_build_object(
        'failure_kind', v_kind,
        'status', 'cancelled',
        'attempt_count', v_delivery.attempt_count,
        'revision', v_new_revision,
        'result', v_result
      );
    END IF;
  END IF;

  PERFORM quantum_private.write_tonight_audit(
    v_entity_type,
    p_failure_id,
    'notification_failure_recovery_requested',
    v_before,
    v_after,
    pg_catalog.btrim(p_idempotency_key)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.is_tonight_notification_retry_open(
  UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_list_tonight_notification_failures(
  UUID, TIMESTAMPTZ, UUID, INTEGER
)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_retry_tonight_notification_failure(TEXT, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.super_admin_list_tonight_notification_failures(
  UUID, TIMESTAMPTZ, UUID, INTEGER
)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_retry_tonight_notification_failure(TEXT, UUID, INTEGER, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.super_admin_list_tonight_notification_failures(
  UUID, TIMESTAMPTZ, UUID, INTEGER
) IS
  'Returns at most 50 Tonight notification failures using only PII-safe operational identifiers.';
COMMENT ON FUNCTION public.super_admin_retry_tonight_notification_failure(TEXT, UUID, INTEGER, TEXT) IS
  'Recently reauthenticated super-admin recovery with optimistic revision and immutable idempotent audit.';

COMMIT;
