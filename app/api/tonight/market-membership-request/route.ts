import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { asIdempotencyKey, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

function isPnuProfileRequired(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'message' in error
    && typeof error.message === 'string'
    && error.message.toLowerCase().includes('pnu_profile_required'),
  )
}

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const body = await readStrictJson(request, ['idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('request_my_tonight_market_membership', {
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) {
      if (isPnuProfileRequired(error)) return privateJson({ error: 'pnu_profile_required' }, 400)
      return tonightRpcErrorResponse(error)
    }
    return privateJson({ request_id: data, status: 'pending', verification_state: 'manual_review_required' }, 201)
  } catch (error) {
    return error instanceof RequestGuardError ? requestGuardErrorResponse(error) : tonightInputErrorResponse(error)
  }
}
