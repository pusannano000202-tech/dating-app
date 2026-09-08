import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { asIdempotencyKey, asInteger, asRequiredString, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const body = await readStrictJson(request, ['decision', 'expected_revision', 'idempotency_key'])
    const decision = asRequiredString(body.decision, 'decision', { pattern: /^(?:approve|reject)$/, maxLength: 8 })
    const supabase = createSupabaseRequestClient(request)
    const args = {
      p_request_id: asUuid((await context.params).requestId, 'request_id'),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 1, max: 2_147_483_647 }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    }
    const { data, error } = await supabase.rpc(
      decision === 'approve'
        ? 'approve_tonight_market_membership_request'
        : 'reject_tonight_market_membership_request',
      args,
    )
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ decision, result: data })
  } catch (error) {
    return error instanceof RequestGuardError ? requestGuardErrorResponse(error) : tonightInputErrorResponse(error)
  }
}
