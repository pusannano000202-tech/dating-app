-- Recover final-attempt worker claims after a process crash. The last lease
-- must become an explicit, operator-visible terminal state instead of staying
-- `processing` forever. All recovery remains service-only; operators receive
-- bounded, PII-free health data and only a recently reauthenticated
-- super-admin can requeue the two new private financial job kinds.

BEGIN;

CREATE INDEX tonight_deposit_disposition_jobs_dead_letter_idx
  ON quantum_private.tonight_deposit_disposition_jobs (updated_at DESC, id DESC)
  WHERE status = 'dead_letter';

CREATE INDEX tonight_settlement_jobs_dead_letter_idx
  ON quantum_private.tonight_settlement_jobs (updated_at DESC, id DESC)
  WHERE status = 'dead_letter';

CREATE INDEX tonight_deposit_disposition_jobs_stale_terminal_idx
  ON quantum_private.tonight_deposit_disposition_jobs (lease_expires_at, id)
  WHERE status = 'processing' AND attempt_count >= 8;

CREATE INDEX tonight_settlement_jobs_stale_terminal_idx
  ON quantum_private.tonight_settlement_jobs (lease_expires_at, id)
  WHERE status = 'processing' AND attempt_count >= 8;

CREATE INDEX tonight_refund_requests_stale_terminal_idx
  ON public.tonight_deposit_refund_requests (settlement_lease_expires_at, id)
  WHERE status = 'processing' AND settlement_attempt_count >= 10;

CREATE INDEX tonight_reconciliation_jobs_stale_terminal_idx
  ON quantum_private.tonight_deposit_reconciliation_jobs (lease_expires_at, id)
  WHERE status = 'processing' AND attempt_count >= 20;

CREATE INDEX tonight_notification_outbox_stale_terminal_idx
  ON public.tonight_notification_outbox (locked_at, id)
  WHERE status = 'processing' AND attempt_count >= 8;

CREATE INDEX tonight_push_deliveries_stale_terminal_idx
  ON public.tonight_push_deliveries (locked_at, id)
  WHERE status = 'processing' AND attempt_count >= 5;

CREATE OR REPLACE FUNCTION public.service_sweep_tonight_terminal_worker_claims(
  p_now TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  p_batch_size INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deposit_disposition_count INTEGER := 0;
  v_settlement_count INTEGER := 0;
  v_refund_count INTEGER := 0;
  v_reconciliation_count INTEGER := 0;
  v_notification_count INTEGER := 0;
  v_push_count INTEGER := 0;
  v_deposit_disposition_has_more BOOLEAN := FALSE;
  v_settlement_has_more BOOLEAN := FALSE;
  v_refund_has_more BOOLEAN := FALSE;
  v_reconciliation_has_more BOOLEAN := FALSE;
  v_notification_has_more BOOLEAN := FALSE;
  v_push_has_more BOOLEAN := FALSE;
  v_has_more BOOLEAN := FALSE;
  v_row RECORD;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_now IS NULL THEN RAISE EXCEPTION 'worker_sweep_time_required'; END IF;
  IF p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_batch_size';
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT job.id
    FROM quantum_private.tonight_deposit_disposition_jobs AS job
    WHERE job.status = 'processing'
      AND job.attempt_count >= 8
      AND job.lease_expires_at <= p_now
      AND NOT EXISTS (
        SELECT 1
        FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
        WHERE terminal_event.deposit_id = job.deposit_id
          AND terminal_event.attendance_revision = job.attendance_revision
      )
    ORDER BY job.lease_expires_at, job.id
    LIMIT p_batch_size
    FOR UPDATE OF job SKIP LOCKED
  ), updated AS (
    UPDATE quantum_private.tonight_deposit_disposition_jobs AS job
    SET status = 'dead_letter',
        lease_id = NULL,
        lease_expires_at = NULL,
        last_error_code = 'lease_expired_after_max_attempts',
        revision = job.revision + 1,
        updated_at = p_now
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER INTO v_deposit_disposition_count FROM updated;

  WITH candidates AS MATERIALIZED (
    SELECT job.id
    FROM quantum_private.tonight_settlement_jobs AS job
    WHERE job.status = 'processing'
      AND job.attempt_count >= 8
      AND job.lease_expires_at <= p_now
      AND NOT EXISTS (
        SELECT 1 FROM public.tonight_settlements AS settlement
        WHERE settlement.team_id = job.team_id
      )
    ORDER BY job.lease_expires_at, job.id
    LIMIT p_batch_size
    FOR UPDATE OF job SKIP LOCKED
  ), updated AS (
    UPDATE quantum_private.tonight_settlement_jobs AS job
    SET status = 'dead_letter',
        lease_id = NULL,
        lease_expires_at = NULL,
        last_error_code = 'lease_expired_after_max_attempts',
        revision = job.revision + 1,
        updated_at = p_now
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER INTO v_settlement_count FROM updated;

  FOR v_row IN
    WITH candidates AS MATERIALIZED (
      SELECT request.id
      FROM public.tonight_deposit_refund_requests AS request
      JOIN public.tonight_deposits AS deposit ON deposit.id = request.deposit_id
      WHERE deposit.status = 'refund_requested'
        AND request.status = 'processing'
        AND request.settlement_attempt_count >= 10
        AND request.settlement_lease_expires_at <= p_now
      ORDER BY request.settlement_lease_expires_at, request.id
      LIMIT p_batch_size
      FOR UPDATE OF request SKIP LOCKED
    ), updated AS (
      UPDATE public.tonight_deposit_refund_requests AS request
      SET status = 'failed',
          settlement_lease_id = NULL,
          settlement_lease_expires_at = NULL,
          settlement_last_error = 'lease_expired_after_max_attempts',
          settlement_next_retry_at = NULL,
          revision = request.revision + 1
      FROM candidates
      WHERE request.id = candidates.id
      RETURNING request.id, request.revision, request.settlement_attempt_count
    )
    SELECT updated.* FROM updated
  LOOP
    v_refund_count := v_refund_count + 1;
    PERFORM quantum_private.write_tonight_audit(
      'refund_request',
      v_row.id,
      'refund_worker_stale_final_claim_failed',
      pg_catalog.jsonb_build_object(
        'status', 'processing',
        'revision', v_row.revision - 1,
        'settlement_attempt_count', v_row.settlement_attempt_count
      ),
      pg_catalog.jsonb_build_object(
        'status', 'failed',
        'revision', v_row.revision,
        'settlement_attempt_count', v_row.settlement_attempt_count,
        'error', 'lease_expired_after_max_attempts'
      ),
      'refund-stale-final-' || v_row.id::TEXT || '-' || v_row.revision::TEXT
    );
  END LOOP;

  FOR v_row IN
    WITH candidates AS MATERIALIZED (
      SELECT job.id
      FROM quantum_private.tonight_deposit_reconciliation_jobs AS job
      WHERE job.status = 'processing'
        AND job.attempt_count >= 20
        AND job.lease_expires_at <= p_now
        AND NOT EXISTS (
          SELECT 1
          FROM quantum_private.tonight_deposit_result_events AS result_event
          WHERE result_event.deposit_id = job.deposit_id
            AND result_event.result_status IN ('paid', 'held')
        )
      ORDER BY job.lease_expires_at, job.id
      LIMIT p_batch_size
      FOR UPDATE OF job SKIP LOCKED
    ), updated AS (
      UPDATE quantum_private.tonight_deposit_reconciliation_jobs AS job
      SET status = 'failed',
          outcome = 'manual_review',
          lease_id = NULL,
          lease_expires_at = NULL,
          next_attempt_at = p_now,
          last_error_code = 'lease_expired_after_max_attempts',
          revision = job.revision + 1,
          updated_at = p_now
      FROM candidates
      WHERE job.id = candidates.id
      RETURNING job.id, job.revision, job.attempt_count
    )
    SELECT updated.* FROM updated
  LOOP
    v_reconciliation_count := v_reconciliation_count + 1;
    PERFORM quantum_private.write_tonight_audit(
      'deposit_reconciliation',
      v_row.id,
      'deposit_reconciliation_stale_final_claim_failed',
      pg_catalog.jsonb_build_object(
        'status', 'processing',
        'revision', v_row.revision - 1,
        'attempt_count', v_row.attempt_count
      ),
      pg_catalog.jsonb_build_object(
        'status', 'failed',
        'outcome', 'manual_review',
        'revision', v_row.revision,
        'attempt_count', v_row.attempt_count,
        'error', 'lease_expired_after_max_attempts'
      ),
      'reconciliation-stale-final-' || v_row.id::TEXT || '-' || v_row.revision::TEXT
    );
  END LOOP;

  WITH candidates AS MATERIALIZED (
    SELECT outbox.id, outbox.revision
    FROM public.tonight_notification_outbox AS outbox
    WHERE outbox.status = 'processing'
      AND outbox.attempt_count >= 8
      AND outbox.locked_at < p_now - INTERVAL '5 minutes'
    ORDER BY outbox.locked_at, outbox.id
    LIMIT p_batch_size
    FOR UPDATE OF outbox SKIP LOCKED
  ), updated AS (
    UPDATE public.tonight_notification_outbox AS outbox
    SET status = 'failed',
        locked_at = NULL,
        last_error_code = 'lease_expired_after_max_attempts',
        updated_at = p_now
    FROM candidates
    WHERE outbox.id = candidates.id
      AND outbox.revision = candidates.revision
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER INTO v_notification_count FROM updated;

  WITH candidates AS MATERIALIZED (
    SELECT delivery.id, delivery.revision
    FROM public.tonight_push_deliveries AS delivery
    WHERE delivery.status = 'processing'
      AND delivery.attempt_count >= 5
      AND delivery.locked_at < p_now - INTERVAL '5 minutes'
    ORDER BY delivery.locked_at, delivery.id
    LIMIT p_batch_size
    FOR UPDATE OF delivery SKIP LOCKED
  ), updated AS (
    UPDATE public.tonight_push_deliveries AS delivery
    SET status = 'failed',
        locked_at = NULL,
        last_error_code = 'lease_expired_after_max_attempts',
        updated_at = p_now
    FROM candidates
    WHERE delivery.id = candidates.id
      AND delivery.revision = candidates.revision
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER INTO v_push_count FROM updated;

  SELECT
    EXISTS (
      SELECT 1
      FROM quantum_private.tonight_deposit_disposition_jobs AS job
      WHERE job.status = 'processing'
        AND job.attempt_count >= 8
        AND job.lease_expires_at <= p_now
        AND NOT EXISTS (
          SELECT 1
          FROM quantum_private.tonight_deposit_terminal_events AS terminal_event
          WHERE terminal_event.deposit_id = job.deposit_id
            AND terminal_event.attendance_revision = job.attendance_revision
        )
    ),
    EXISTS (
      SELECT 1
      FROM quantum_private.tonight_settlement_jobs AS job
      WHERE job.status = 'processing'
        AND job.attempt_count >= 8
        AND job.lease_expires_at <= p_now
        AND NOT EXISTS (
          SELECT 1 FROM public.tonight_settlements AS settlement
          WHERE settlement.team_id = job.team_id
        )
    ),
    EXISTS (
      SELECT 1
      FROM public.tonight_deposit_refund_requests AS request
      JOIN public.tonight_deposits AS deposit ON deposit.id = request.deposit_id
      WHERE deposit.status = 'refund_requested'
        AND request.status = 'processing'
        AND request.settlement_attempt_count >= 10
        AND request.settlement_lease_expires_at <= p_now
    ),
    EXISTS (
      SELECT 1
      FROM quantum_private.tonight_deposit_reconciliation_jobs AS job
      WHERE job.status = 'processing'
        AND job.attempt_count >= 20
        AND job.lease_expires_at <= p_now
        AND NOT EXISTS (
          SELECT 1
          FROM quantum_private.tonight_deposit_result_events AS result_event
          WHERE result_event.deposit_id = job.deposit_id
            AND result_event.result_status IN ('paid', 'held')
        )
    ),
    EXISTS (
      SELECT 1 FROM public.tonight_notification_outbox AS outbox
      WHERE outbox.status = 'processing'
        AND outbox.attempt_count >= 8
        AND outbox.locked_at < p_now - INTERVAL '5 minutes'
    ),
    EXISTS (
      SELECT 1 FROM public.tonight_push_deliveries AS delivery
      WHERE delivery.status = 'processing'
        AND delivery.attempt_count >= 5
        AND delivery.locked_at < p_now - INTERVAL '5 minutes'
    )
  INTO
    v_deposit_disposition_has_more,
    v_settlement_has_more,
    v_refund_has_more,
    v_reconciliation_has_more,
    v_notification_has_more,
    v_push_has_more;

  v_has_more := v_deposit_disposition_has_more
    OR v_settlement_has_more
    OR v_refund_has_more
    OR v_reconciliation_has_more
    OR v_notification_has_more
    OR v_push_has_more;

  RETURN pg_catalog.jsonb_build_object(
    'batch_limit', p_batch_size,
    'has_more', v_has_more,
    'has_more_by_kind', pg_catalog.jsonb_build_object(
      'deposit_disposition', v_deposit_disposition_has_more,
      'settlement', v_settlement_has_more,
      'refund', v_refund_has_more,
      'reconciliation', v_reconciliation_has_more,
      'notification', v_notification_has_more,
      'push', v_push_has_more
    ),
    'deposit_disposition_dead_lettered', v_deposit_disposition_count,
    'settlement_dead_lettered', v_settlement_count,
    'refund_failed', v_refund_count,
    'reconciliation_failed', v_reconciliation_count,
    'notification_failed', v_notification_count,
    'push_failed', v_push_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tonight_financial_worker_health(
  p_round_id UUID,
  p_before_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_before_job_kind TEXT DEFAULT NULL,
  p_before_job_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_admin(v_caller) AND NOT public.is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF p_round_id IS NULL THEN RAISE EXCEPTION 'round_id_required'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  IF (
    p_before_updated_at IS NULL
    AND (p_before_job_kind IS NOT NULL OR p_before_job_id IS NOT NULL)
  ) OR (
    p_before_updated_at IS NOT NULL
    AND (p_before_job_kind IS NULL OR p_before_job_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'invalid_financial_cursor';
  END IF;
  IF p_before_job_kind IS NOT NULL
    AND p_before_job_kind NOT IN ('deposit_disposition', 'settlement')
  THEN
    RAISE EXCEPTION 'invalid_financial_cursor';
  END IF;

  WITH deposit_metrics AS (
    SELECT
      pg_catalog.count(*) FILTER (WHERE job.status IN ('pending', 'processing', 'failed'))::INTEGER AS active_count,
      pg_catalog.count(*) FILTER (WHERE job.status = 'dead_letter')::INTEGER AS dead_letter_count,
      pg_catalog.min(job.created_at) FILTER (WHERE job.status IN ('pending', 'processing', 'failed')) AS oldest_active_at
    FROM quantum_private.tonight_deposit_disposition_jobs AS job
    JOIN public.tonight_deposits AS deposit ON deposit.id = job.deposit_id
    JOIN public.tonight_team_members AS member ON member.application_id = deposit.application_id
    JOIN public.tonight_teams AS team ON team.id = member.team_id
    WHERE team.round_id = p_round_id
  ), settlement_metrics AS (
    SELECT
      pg_catalog.count(*) FILTER (WHERE job.status IN ('pending', 'processing', 'failed'))::INTEGER AS active_count,
      pg_catalog.count(*) FILTER (WHERE job.status = 'dead_letter')::INTEGER AS dead_letter_count,
      pg_catalog.min(job.created_at) FILTER (WHERE job.status IN ('pending', 'processing', 'failed')) AS oldest_active_at
    FROM quantum_private.tonight_settlement_jobs AS job
    JOIN public.tonight_teams AS team ON team.id = job.team_id
    WHERE team.round_id = p_round_id
  ), refund_metrics AS (
    SELECT
      pg_catalog.count(*) FILTER (
        WHERE request.status IN ('requested', 'processing')
          OR (request.status = 'failed' AND request.settlement_attempt_count < 10)
      )::INTEGER AS active_count,
      pg_catalog.count(*) FILTER (
        WHERE request.status = 'failed' AND request.settlement_attempt_count >= 10
      )::INTEGER AS failed_count,
      pg_catalog.min(request.requested_at) FILTER (
        WHERE request.status IN ('requested', 'processing')
          OR (request.status = 'failed' AND request.settlement_attempt_count < 10)
      ) AS oldest_active_at
    FROM public.tonight_deposit_refund_requests AS request
    JOIN public.tonight_deposits AS deposit ON deposit.id = request.deposit_id
    JOIN public.tonight_team_members AS member ON member.application_id = deposit.application_id
    JOIN public.tonight_teams AS team ON team.id = member.team_id
    WHERE team.round_id = p_round_id
  ), reconciliation_metrics AS (
    SELECT
      pg_catalog.count(*) FILTER (WHERE job.status IN ('pending', 'processing'))::INTEGER AS active_count,
      pg_catalog.count(*) FILTER (WHERE job.status = 'failed')::INTEGER AS failed_count,
      pg_catalog.min(job.created_at) FILTER (WHERE job.status IN ('pending', 'processing')) AS oldest_active_at
    FROM quantum_private.tonight_deposit_reconciliation_jobs AS job
    JOIN public.tonight_deposits AS deposit ON deposit.id = job.deposit_id
    JOIN public.tonight_team_members AS member ON member.application_id = deposit.application_id
    JOIN public.tonight_teams AS team ON team.id = member.team_id
    WHERE team.round_id = p_round_id
  ), notification_metrics AS (
    SELECT
      pg_catalog.count(*) FILTER (WHERE outbox.status IN ('pending', 'processing'))::INTEGER AS active_count,
      pg_catalog.count(*) FILTER (WHERE outbox.status = 'failed')::INTEGER AS failed_count,
      pg_catalog.min(outbox.created_at) FILTER (WHERE outbox.status IN ('pending', 'processing')) AS oldest_active_at
    FROM public.tonight_notification_outbox AS outbox
    WHERE outbox.round_id = p_round_id
  ), push_metrics AS (
    SELECT
      pg_catalog.count(*) FILTER (WHERE delivery.status IN ('pending', 'processing'))::INTEGER AS active_count,
      pg_catalog.count(*) FILTER (WHERE delivery.status = 'failed')::INTEGER AS failed_count,
      pg_catalog.min(delivery.created_at) FILTER (WHERE delivery.status IN ('pending', 'processing')) AS oldest_active_at
    FROM public.tonight_push_deliveries AS delivery
    JOIN public.tonight_notification_outbox AS outbox
      ON outbox.notification_id = delivery.notification_id
    WHERE outbox.round_id = p_round_id
  ), financial_items AS (
    SELECT
      'deposit_disposition'::TEXT AS job_kind,
      job.id AS job_id,
      job.revision AS job_revision,
      team.id AS team_id,
      team.team_code,
      job.status AS job_status,
      job.attempt_count,
      job.last_error_code,
      job.created_at,
      job.updated_at
    FROM quantum_private.tonight_deposit_disposition_jobs AS job
    JOIN public.tonight_deposits AS deposit ON deposit.id = job.deposit_id
    JOIN public.tonight_team_members AS member ON member.application_id = deposit.application_id
    JOIN public.tonight_teams AS team ON team.id = member.team_id
    WHERE team.round_id = p_round_id AND job.status = 'dead_letter'

    UNION ALL

    SELECT
      'settlement'::TEXT,
      job.id,
      job.revision,
      team.id,
      team.team_code,
      job.status,
      job.attempt_count,
      job.last_error_code,
      job.created_at,
      job.updated_at
    FROM quantum_private.tonight_settlement_jobs AS job
    JOIN public.tonight_teams AS team ON team.id = job.team_id
    WHERE team.round_id = p_round_id AND job.status = 'dead_letter'
  ), limited_items AS (
    SELECT item.*
    FROM financial_items AS item
    WHERE p_before_updated_at IS NULL
      OR (item.updated_at, item.job_kind, item.job_id)
        < (p_before_updated_at, p_before_job_kind, p_before_job_id)
    ORDER BY updated_at DESC, job_kind DESC, job_id DESC
    LIMIT p_limit + 1
  )
  SELECT pg_catalog.jsonb_build_object(
    'deposit_disposition_active_count', deposit_metrics.active_count,
    'deposit_dead_letter_count', deposit_metrics.dead_letter_count,
    'oldest_deposit_disposition_active_at', deposit_metrics.oldest_active_at,
    'settlement_active_count', settlement_metrics.active_count,
    'settlement_dead_letter_count', settlement_metrics.dead_letter_count,
    'oldest_settlement_active_at', settlement_metrics.oldest_active_at,
    'refund_active_count', refund_metrics.active_count,
    'refund_failed_count', refund_metrics.failed_count,
    'oldest_refund_active_at', refund_metrics.oldest_active_at,
    'reconciliation_active_count', reconciliation_metrics.active_count,
    'reconciliation_failed_count', reconciliation_metrics.failed_count,
    'oldest_reconciliation_active_at', reconciliation_metrics.oldest_active_at,
    'notification_active_count', notification_metrics.active_count,
    'notification_failed_count', notification_metrics.failed_count,
    'oldest_notification_active_at', notification_metrics.oldest_active_at,
    'push_active_count', push_metrics.active_count,
    'push_failed_count', push_metrics.failed_count,
    'oldest_push_active_at', push_metrics.oldest_active_at,
    'jobs', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'job_kind', item.job_kind,
          'job_id', item.job_id,
          'job_revision', item.job_revision,
          'team_id', item.team_id,
          'team_code', item.team_code,
          'job_status', item.job_status,
          'attempt_count', item.attempt_count,
          'last_error_code', item.last_error_code,
          'created_at', item.created_at,
          'updated_at', item.updated_at
        ) ORDER BY item.updated_at DESC, item.job_kind DESC, item.job_id DESC
      )
      FROM limited_items AS item
    ), '[]'::JSONB)
  ) INTO v_result
  FROM deposit_metrics, settlement_metrics, refund_metrics,
       reconciliation_metrics, notification_metrics, push_metrics;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_retry_tonight_financial_job(
  p_job_kind TEXT,
  p_job_id UUID,
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
  v_entity_type TEXT;
  v_before JSONB;
  v_status TEXT;
  v_actual_revision INTEGER;
  v_new_revision INTEGER;
  v_existing quantum_private.tonight_audit_events%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_super_admin(v_caller) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  PERFORM quantum_private.require_recent_super_admin_auth(v_caller);
  IF p_job_kind NOT IN ('deposit_disposition', 'settlement') THEN
    RAISE EXCEPTION 'invalid_financial_job_kind';
  END IF;
  IF p_job_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'invalid_financial_job_identity';
  END IF;
  IF p_idempotency_key IS NULL
    OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  v_entity_type := CASE p_job_kind
    WHEN 'deposit_disposition' THEN 'deposit_disposition_job'
    ELSE 'settlement_job'
  END;

  SELECT audit.* INTO v_existing
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = v_entity_type
    AND audit.idempotency_key = pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing.entity_id <> p_job_id
      OR v_existing.action <> 'financial_job_retry_requested'
      OR (v_existing.before_state ->> 'revision')::INTEGER <> p_expected_revision
      OR v_existing.before_state ->> 'job_kind' <> p_job_kind THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN (v_existing.after_state ->> 'revision')::INTEGER;
  END IF;

  IF p_job_kind = 'deposit_disposition' THEN
    SELECT pg_catalog.to_jsonb(job), job.status, job.revision
    INTO v_before, v_status, v_actual_revision
    FROM quantum_private.tonight_deposit_disposition_jobs AS job
    WHERE job.id = p_job_id
    FOR UPDATE OF job;
  ELSE
    SELECT pg_catalog.to_jsonb(job), job.status, job.revision
    INTO v_before, v_status, v_actual_revision
    FROM quantum_private.tonight_settlement_jobs AS job
    WHERE job.id = p_job_id
    FOR UPDATE OF job;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_job_not_found'; END IF;

  SELECT audit.* INTO v_existing
  FROM quantum_private.tonight_audit_events AS audit
  WHERE audit.entity_type = v_entity_type
    AND audit.idempotency_key = pg_catalog.btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing.entity_id <> p_job_id
      OR v_existing.action <> 'financial_job_retry_requested'
      OR (v_existing.before_state ->> 'revision')::INTEGER <> p_expected_revision
      OR v_existing.before_state ->> 'job_kind' <> p_job_kind THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN (v_existing.after_state ->> 'revision')::INTEGER;
  END IF;

  IF v_actual_revision <> p_expected_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
  IF v_status <> 'dead_letter' THEN RAISE EXCEPTION 'financial_job_not_retryable'; END IF;

  IF p_job_kind = 'deposit_disposition' THEN
    UPDATE quantum_private.tonight_deposit_disposition_jobs AS job
    SET status = 'pending', attempt_count = 0, lease_id = NULL,
        lease_expires_at = NULL, next_attempt_at = CURRENT_TIMESTAMP,
        last_error_code = NULL, revision = job.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE job.id = p_job_id AND job.revision = p_expected_revision
    RETURNING job.revision INTO v_new_revision;
  ELSE
    UPDATE quantum_private.tonight_settlement_jobs AS job
    SET status = 'pending', attempt_count = 0, lease_id = NULL,
        lease_expires_at = NULL, next_attempt_at = CURRENT_TIMESTAMP,
        last_error_code = NULL, revision = job.revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE job.id = p_job_id AND job.revision = p_expected_revision
    RETURNING job.revision INTO v_new_revision;
  END IF;
  IF v_new_revision IS NULL THEN RAISE EXCEPTION 'stale_revision'; END IF;

  PERFORM quantum_private.write_tonight_audit(
    v_entity_type,
    p_job_id,
    'financial_job_retry_requested',
    pg_catalog.jsonb_build_object(
      'job_kind', p_job_kind,
      'status', v_before ->> 'status',
      'revision', p_expected_revision,
      'attempt_count', (v_before ->> 'attempt_count')::INTEGER
    ),
    pg_catalog.jsonb_build_object(
      'job_kind', p_job_kind,
      'status', 'pending',
      'revision', v_new_revision,
      'attempt_count', 0
    ),
    pg_catalog.btrim(p_idempotency_key)
  );
  RETURN v_new_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.service_sweep_tonight_terminal_worker_claims(TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_tonight_financial_worker_health(UUID, TIMESTAMPTZ, TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.super_admin_retry_tonight_financial_job(TEXT, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.service_sweep_tonight_terminal_worker_claims(TIMESTAMPTZ, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_financial_worker_health(UUID, TIMESTAMPTZ, TEXT, UUID, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_retry_tonight_financial_job(TEXT, UUID, INTEGER, TEXT)
  TO authenticated;

COMMIT;
