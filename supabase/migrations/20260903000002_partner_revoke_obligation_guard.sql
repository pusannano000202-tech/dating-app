-- Install the live-obligation query only after the Tonight ledger tables exist.
-- The earlier RBAC migration deliberately fails closed until this replacement
-- is applied.

BEGIN;

CREATE OR REPLACE FUNCTION quantum_private.venue_has_live_tonight_obligations(
  p_venue_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_has_live_obligation BOOLEAN;
BEGIN
  IF p_venue_id IS NULL THEN
    RAISE EXCEPTION 'invalid_venue_id';
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.tonight_venue_capacities AS capacity
      JOIN public.tonight_rounds AS round_row
        ON round_row.id = capacity.round_id
      WHERE capacity.venue_id = p_venue_id
        AND round_row.service_date >= (
          pg_catalog.timezone('Asia/Seoul', CURRENT_TIMESTAMP)::DATE
        )
        AND round_row.status NOT IN ('completed', 'cancelled')
        AND (
          capacity.status = 'locked'
          OR capacity.reserved_team_count > 0
          OR (
            capacity.status IN ('open', 'locked')
            AND capacity.team_capacity > capacity.reserved_team_count
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.tonight_teams AS team
      JOIN public.tonight_venue_capacities AS capacity
        ON capacity.id = team.venue_capacity_id
      WHERE capacity.venue_id = p_venue_id
        AND team.status IN (
          'deposit_pending',
          'partner_pending',
          'accepted',
          'revealed',
          'in_progress'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.tonight_partner_service_confirmations AS confirmation
      LEFT JOIN public.tonight_settlements AS settlement
        ON settlement.team_id = confirmation.team_id
        AND settlement.venue_id = confirmation.venue_id
      WHERE confirmation.venue_id = p_venue_id
        AND (
          settlement.id IS NULL
          OR settlement.status IN ('ready', 'processing', 'disputed')
        )
    )
  INTO v_has_live_obligation;

  RETURN COALESCE(v_has_live_obligation, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION quantum_private.venue_has_live_tonight_obligations(UUID)
  FROM /* explicit role boundary */ PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION quantum_private.venue_has_live_tonight_obligations(UUID) IS
  'Fail-closed check that protects the last venue partner while capacity, team, or settlement obligations remain live.';

COMMIT;
