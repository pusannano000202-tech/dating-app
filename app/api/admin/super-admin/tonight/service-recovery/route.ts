import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  asIdempotencyKey,
  asInteger,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const body = await readStrictJson(request, [
      'team_id', 'attempt_id', 'expected_revision', 'idempotency_key',
    ])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_recover_tonight_service_confirmation', {
      p_team_id: asUuid(body.team_id, 'team_id'),
      p_attempt_id: asUuid(body.attempt_id, 'attempt_id'),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', {
        min: 0,
        max: 2_147_483_647,
      }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }
    return privateJson(data)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
