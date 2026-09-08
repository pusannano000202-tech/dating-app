import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asIdempotencyKey, asInteger, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  try {
    const body = await readStrictJson(request, [
      'venue_id', 'round_id', 'activity_id', 'venue_snapshot_id', 'team_capacity',
      'max_team_headcount', 'expected_revision', 'idempotency_key',
    ])
    const venueId = asUuid(body.venue_id, 'venue_id')
    await requireRequestAccess(request, { allowedRoles: ['partner'], partnerVenueId: venueId })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('partner_set_tonight_capacity_profile', {
      p_round_id: asUuid(body.round_id, 'round_id'),
      p_activity_id: asUuid(body.activity_id, 'activity_id'),
      p_venue_snapshot_id: asUuid(body.venue_snapshot_id, 'venue_snapshot_id'),
      p_team_capacity: asInteger(body.team_capacity, 'team_capacity', { min: 0, max: 100 }),
      p_max_team_headcount: asInteger(body.max_team_headcount, 'max_team_headcount', { min: 5, max: 6 }),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ capacity_id: data })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
