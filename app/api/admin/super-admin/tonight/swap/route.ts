import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asIdempotencyKey, asInteger, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const body = await readStrictJson(request, [
      'team_a_id', 'bundle_a_id', 'expected_team_a_revision',
      'team_b_id', 'bundle_b_id', 'expected_team_b_revision', 'idempotency_key',
    ])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_swap_tonight_friend_bundles', {
      p_team_a_id: asUuid(body.team_a_id, 'team_a_id'),
      p_bundle_a_id: asUuid(body.bundle_a_id, 'bundle_a_id'),
      p_expected_team_a_revision: asInteger(body.expected_team_a_revision, 'expected_team_a_revision', { min: 0, max: 2_147_483_647 }),
      p_team_b_id: asUuid(body.team_b_id, 'team_b_id'),
      p_bundle_b_id: asUuid(body.bundle_b_id, 'bundle_b_id'),
      p_expected_team_b_revision: asInteger(body.expected_team_b_revision, 'expected_team_b_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ swapped: data === true })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
