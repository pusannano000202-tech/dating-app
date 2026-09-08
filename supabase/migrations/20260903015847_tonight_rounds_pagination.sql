-- Keep the operator round directory on a recent, cursor-bounded keyset page.
-- Every child aggregate first joins that page, so historical rounds are never
-- rescanned merely to render the latest admin dropdown.

BEGIN;

CREATE INDEX IF NOT EXISTS tonight_rounds_admin_recent_idx
  ON public.tonight_rounds (starts_at DESC, id DESC);

REVOKE ALL ON FUNCTION public.admin_list_tonight_rounds()
  FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.admin_list_tonight_rounds();

CREATE OR REPLACE FUNCTION public.admin_list_tonight_rounds(
  p_limit INTEGER DEFAULT 50,
  p_before_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  market_code TEXT,
  service_date DATE,
  status TEXT,
  signup_close_at TIMESTAMPTZ,
  capacity_lock_at TIMESTAMPTZ,
  allocation_publish_at TIMESTAMPTZ,
  deposit_due_at TIMESTAMPTZ,
  partner_acceptance_due_at TIMESTAMPTZ,
  reveal_at TIMESTAMPTZ,
  arrival_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  application_count BIGINT,
  male_application_count BIGINT,
  female_application_count BIGINT,
  waitlisted_count BIGINT,
  settlement_exception_count BIGINT
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
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  IF (p_before_starts_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_round_cursor';
  END IF;

  RETURN QUERY
  WITH page_rounds AS MATERIALIZED (
    SELECT
      round_row.id AS round_id,
      round_row.market_code AS round_market_code,
      round_row.service_date AS round_service_date,
      round_row.status AS round_status,
      round_row.signup_close_at AS round_signup_close_at,
      round_row.capacity_lock_at AS round_capacity_lock_at,
      round_row.allocation_publish_at AS round_allocation_publish_at,
      round_row.deposit_due_at AS round_deposit_due_at,
      round_row.partner_acceptance_due_at AS round_partner_acceptance_due_at,
      round_row.reveal_at AS round_reveal_at,
      round_row.arrival_at AS round_arrival_at,
      round_row.starts_at AS round_starts_at
    FROM public.tonight_rounds AS round_row
    WHERE p_before_starts_at IS NULL
      OR (round_row.starts_at, round_row.id) < (p_before_starts_at, p_before_id)
    ORDER BY round_row.starts_at DESC, round_row.id DESC
    LIMIT p_limit + 1
  ),
  application_stats AS MATERIALIZED (
    SELECT
      application_row.round_id,
      COUNT(*) AS application_count,
      COUNT(*) FILTER (WHERE application_row.status = 'waitlisted') AS waitlisted_count
    FROM public.tonight_applications AS application_row
    JOIN page_rounds ON page_rounds.round_id = application_row.round_id
    GROUP BY application_row.round_id
  ),
  gender_stats AS MATERIALIZED (
    SELECT
      application_row.round_id,
      COUNT(*) FILTER (WHERE feature.gender_code = 'male') AS male_application_count,
      COUNT(*) FILTER (WHERE feature.gender_code = 'female') AS female_application_count
    FROM public.tonight_applications AS application_row
    JOIN page_rounds ON page_rounds.round_id = application_row.round_id
    JOIN quantum_private.tonight_applicant_features AS feature
      ON feature.application_id = application_row.id
    GROUP BY application_row.round_id
  ),
  exception_events AS MATERIALIZED (
    SELECT team.round_id
    FROM public.tonight_teams AS team
    JOIN page_rounds ON page_rounds.round_id = team.round_id
    JOIN public.tonight_team_members AS member ON member.team_id = team.id
    JOIN public.tonight_deposits AS deposit ON deposit.application_id = member.application_id
    WHERE deposit.status = 'reconciliation_required'

    UNION ALL

    SELECT team.round_id
    FROM public.tonight_teams AS team
    JOIN page_rounds ON page_rounds.round_id = team.round_id
    JOIN public.tonight_settlements AS settlement ON settlement.team_id = team.id
    WHERE settlement.status = 'disputed'

    UNION ALL

    SELECT team.round_id
    FROM public.tonight_teams AS team
    JOIN page_rounds ON page_rounds.round_id = team.round_id
    JOIN public.tonight_partner_service_confirmations AS confirmation
      ON confirmation.team_id = team.id
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::BIGINT AS arrived_count
      FROM public.tonight_attendance AS attendance
      WHERE attendance.team_id = team.id
        AND attendance.status = 'arrived'
    ) AS arrived
    WHERE confirmation.confirmed_attendee_count <> arrived.arrived_count

    UNION ALL

    SELECT team.round_id
    FROM public.tonight_teams AS team
    JOIN page_rounds ON page_rounds.round_id = team.round_id
    JOIN public.tonight_team_members AS member ON member.team_id = team.id
    JOIN public.tonight_deposits AS deposit ON deposit.application_id = member.application_id
    JOIN public.tonight_deposit_refund_requests AS refund_request
      ON refund_request.deposit_id = deposit.id
    WHERE refund_request.status = 'failed'
      AND refund_request.settlement_attempt_count >= 10
  ),
  exception_stats AS MATERIALIZED (
    SELECT exception_events.round_id, COUNT(*) AS settlement_exception_count
    FROM exception_events
    GROUP BY exception_events.round_id
  )
  SELECT
    page_rounds.round_id,
    page_rounds.round_market_code,
    page_rounds.round_service_date,
    page_rounds.round_status,
    page_rounds.round_signup_close_at,
    page_rounds.round_capacity_lock_at,
    page_rounds.round_allocation_publish_at,
    page_rounds.round_deposit_due_at,
    page_rounds.round_partner_acceptance_due_at,
    page_rounds.round_reveal_at,
    page_rounds.round_arrival_at,
    page_rounds.round_starts_at,
    COALESCE(application_stats.application_count, 0),
    COALESCE(gender_stats.male_application_count, 0),
    COALESCE(gender_stats.female_application_count, 0),
    COALESCE(application_stats.waitlisted_count, 0),
    COALESCE(exception_stats.settlement_exception_count, 0)
  FROM page_rounds
  LEFT JOIN application_stats ON application_stats.round_id = page_rounds.round_id
  LEFT JOIN gender_stats ON gender_stats.round_id = page_rounds.round_id
  LEFT JOIN exception_stats ON exception_stats.round_id = page_rounds.round_id
  ORDER BY page_rounds.round_starts_at DESC, page_rounds.round_id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_tonight_rounds(INTEGER, TIMESTAMPTZ, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_tonight_rounds(INTEGER, TIMESTAMPTZ, UUID)
  TO authenticated;

COMMIT;
