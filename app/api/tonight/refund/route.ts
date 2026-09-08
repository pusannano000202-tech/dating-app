import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asIdempotencyKey, asInteger, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const body = await readStrictJson(request, [
      'application_id', 'expected_deposit_revision', 'idempotency_key',
    ])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('request_my_tonight_refund', {
      p_application_id: asUuid(body.application_id, 'application_id'),
      p_expected_deposit_revision: asInteger(body.expected_deposit_revision, 'expected_deposit_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ refund_request_id: data }, 202)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
