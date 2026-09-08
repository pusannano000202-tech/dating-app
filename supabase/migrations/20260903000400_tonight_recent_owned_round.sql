-- Keep a participant's most recent terminal Tonight journey visible long
-- enough to observe held/refund progress after the active round completes.
-- An unresolved caller-owned financial journey wins over a newly opened round,
-- even after market access is revoked; access eligibility and financial-record
-- ownership are intentionally separate boundaries.

BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.build_tonight_round_payload(
  p_round_id UUID,
  p_caller UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round public.tonight_rounds%ROWTYPE;
  v_application public.tonight_applications%ROWTYPE;
BEGIN
  SELECT round_row.* INTO v_round
  FROM public.tonight_rounds AS round_row
  WHERE round_row.id = p_round_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF (
    SELECT COUNT(*)
    FROM public.tonight_round_activities AS activity
    WHERE activity.round_id = v_round.id
  ) <> 3 THEN
    RAISE EXCEPTION 'activity_count_invalid';
  END IF;

  SELECT application_row.* INTO v_application
  FROM public.tonight_applications AS application_row
  WHERE application_row.round_id = v_round.id
    AND application_row.user_id = p_caller;

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
              SELECT refund_request.status
              FROM public.tonight_deposit_refund_requests AS refund_request
              WHERE refund_request.deposit_id = deposit.id
            ),
            'refund_revision', (
              SELECT refund_request.revision
              FROM public.tonight_deposit_refund_requests AS refund_request
              WHERE refund_request.deposit_id = deposit.id
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
  v_financial_recovery BOOLEAN := FALSE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- A newer round must not hide an older caller-owned payment that still needs
  -- reconciliation, refund settlement, or manual review. This branch does not
  -- require an active market membership because revoking future participation
  -- must not revoke access to the caller's existing financial record.
  SELECT round_row.* INTO v_round
  FROM public.tonight_rounds AS round_row
  JOIN public.tonight_applications AS application_row
    ON application_row.round_id = round_row.id
   AND application_row.user_id = v_caller
  WHERE round_row.market_code = 'PNU'
    AND round_row.starts_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    AND round_row.starts_at < CURRENT_TIMESTAMP
    AND EXISTS (
      SELECT 1
      FROM public.tonight_deposits AS deposit
      LEFT JOIN public.tonight_deposit_refund_requests AS refund_request
        ON refund_request.deposit_id = deposit.id
      WHERE deposit.application_id = application_row.id
        AND (
          deposit.status IN (
            'pending', 'paid', 'held', 'refund_requested', 'reconciliation_required'
          )
          OR refund_request.status IN ('requested', 'approved', 'processing', 'failed')
          OR EXISTS (
            SELECT 1
            FROM quantum_private.tonight_deposit_reconciliation_jobs AS reconciliation_job
            WHERE reconciliation_job.deposit_id = deposit.id
              AND reconciliation_job.status IN ('pending', 'processing', 'failed')
          )
        )
    )
  ORDER BY round_row.starts_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_financial_recovery := TRUE;
  END IF;

  IF NOT FOUND THEN
    SELECT round_row.* INTO v_round
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
  END IF;

  IF NOT FOUND THEN
    SELECT round_row.* INTO v_round
    FROM public.tonight_rounds AS round_row
    JOIN public.tonight_applications AS application_row
      ON application_row.round_id = round_row.id
     AND application_row.user_id = v_caller
    JOIN public.tonight_market_memberships AS membership
      ON membership.market_code = round_row.market_code
     AND membership.user_id = v_caller
     AND membership.revoked_at IS NULL
    WHERE round_row.status IN ('completed', 'cancelled')
      AND round_row.market_code = 'PNU'
      AND round_row.starts_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    ORDER BY round_row.starts_at DESC
    LIMIT 1;
  END IF;

  IF v_round.id IS NULL THEN RETURN NULL; END IF;
  RETURN quantum_private.build_tonight_round_payload(v_round.id, v_caller)
    || pg_catalog.jsonb_build_object('financial_recovery', v_financial_recovery);
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.build_tonight_round_payload(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_current_tonight_round()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_tonight_round() TO authenticated;

COMMIT;
