import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asIdempotencyKey, asInteger, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  try {
    const body = await readStrictJson(request, [
      'venue_id', 'round_id', 'team_id', 'expected_revision', 'idempotency_key',
    ])
    const venueId = asUuid(body.venue_id, 'venue_id')
    const roundId = asUuid(body.round_id, 'round_id')
    const teamId = asUuid(body.team_id, 'team_id')
    await requireRequestAccess(request, { allowedRoles: ['partner'], partnerVenueId: venueId })
    const supabase = createSupabaseRequestClient(request)
    const scope = await supabase.rpc('partner_get_tonight_dashboard', { p_round_id: roundId })
    if (scope.error) return tonightRpcErrorResponse(scope.error)
    const ownsExactTeam = Array.isArray(scope.data) && scope.data.some((row) =>
      row && typeof row === 'object'
      && (row as Record<string, unknown>).venue_id === venueId
      && (row as Record<string, unknown>).team_id === teamId,
    )
    if (!ownsExactTeam) return privateJson({ error: 'not_found' }, 404)
    const { data, error } = await supabase.rpc('partner_accept_tonight_team', {
      p_team_id: teamId,
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ acceptance_id: data })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
