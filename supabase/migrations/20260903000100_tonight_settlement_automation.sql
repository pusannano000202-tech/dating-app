-- Service-confirmed attendance is finalized into a partner settlement by a
-- server-owned worker. Admins can see the short-lived or failed-to-finalize
-- gap without exposing settlement internals to users or venue partners.

BEGIN;

CREATE OR REPLACE FUNCTION public.service_list_tonight_unsettled_teams(
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  team_id UUID,
  confirmed_attendee_count SMALLINT,
  service_completed_at TIMESTAMPTZ
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
    RAISE EXCEPTION 'invalid_settlement_limit';
  END IF;

  RETURN QUERY
  SELECT
    confirmation.team_id,
    confirmation.confirmed_attendee_count,
    confirmation.service_completed_at
  FROM public.tonight_partner_service_confirmations AS confirmation
  JOIN public.tonight_teams AS team ON team.id = confirmation.team_id
  WHERE team.status = 'completed'
    AND confirmation.confirmed_attendee_count = (
      SELECT COUNT(*)::SMALLINT
      FROM public.tonight_attendance AS attendance
      WHERE attendance.team_id = confirmation.team_id
        AND attendance.status = 'arrived'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tonight_settlements AS settlement
      WHERE settlement.team_id = confirmation.team_id
    )
  ORDER BY confirmation.service_completed_at, confirmation.team_id
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tonight_settlement_exceptions(
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
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF p_round_id IS NULL THEN
    RAISE EXCEPTION 'round_id_required';
  END IF;

  RETURN QUERY
  SELECT
    'settlement_finalize_pending'::TEXT,
    team.id,
    team.team_code,
    NULL::UUID,
    NULL::TEXT,
    NULL::TEXT,
    NULL::UUID,
    NULL::TEXT,
    NULL::TEXT,
    NULL::UUID,
    NULL::TEXT,
    'pending'::TEXT,
    NULL::UUID,
    NULL::INTEGER
  FROM public.tonight_partner_service_confirmations AS confirmation
  JOIN public.tonight_teams AS team ON team.id = confirmation.team_id
  WHERE team.round_id = p_round_id
    AND confirmation.confirmed_attendee_count = (
      SELECT COUNT(*)::SMALLINT
      FROM public.tonight_attendance AS attendance
      WHERE attendance.team_id = confirmation.team_id
        AND attendance.status = 'arrived'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tonight_settlements AS settlement
      WHERE settlement.team_id = confirmation.team_id
    )
  ORDER BY team.team_code, team.id;
END;
$$;

REVOKE ALL ON FUNCTION public.service_list_tonight_unsettled_teams(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.service_list_tonight_unsettled_teams(INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_tonight_settlement_exceptions(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_tonight_settlement_exceptions(UUID)
  TO authenticated;

COMMIT;
