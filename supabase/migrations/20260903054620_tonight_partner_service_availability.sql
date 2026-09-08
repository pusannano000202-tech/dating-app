-- Expose the same database-time service-completion boundary enforced by the
-- partner confirmation RPC. The browser must never decide this from its clock.

BEGIN;

CREATE OR REPLACE FUNCTION public.partner_get_tonight_service_availability(
  p_round_id UUID
)
RETURNS TABLE (
  team_id UUID,
  service_confirm_after TIMESTAMPTZ,
  can_confirm_service BOOLEAN
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
    team.id,
    round_row.starts_at
      + pg_catalog.make_interval(mins => activity.duration_minutes),
    CURRENT_TIMESTAMP >= round_row.starts_at
      + pg_catalog.make_interval(mins => activity.duration_minutes)
      AND team.status IN ('accepted', 'revealed', 'in_progress', 'completed')
  FROM public.tonight_teams AS team
  JOIN public.tonight_rounds AS round_row
    ON round_row.id = team.round_id
  JOIN public.tonight_round_activities AS activity
    ON activity.id = team.activity_id
    AND activity.round_id = team.round_id
  JOIN public.tonight_venue_capacities AS capacity
    ON capacity.id = team.venue_capacity_id
  JOIN public.venue_partner_memberships AS membership
    ON membership.venue_id = capacity.venue_id
    AND membership.user_id = v_caller
    AND membership.revoked_at IS NULL
  WHERE team.round_id = p_round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_get_tonight_service_availability(UUID)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.partner_get_tonight_service_availability(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.partner_get_tonight_service_availability(UUID) IS
  'Returns own-venue team service completion availability using database time.';

COMMIT;
