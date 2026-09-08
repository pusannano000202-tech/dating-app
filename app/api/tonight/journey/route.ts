import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asUuid, privateJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const roundId = asUuid(new URL(request.url).searchParams.get('round_id'), 'round_id')
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_tonight_journey', { p_round_id: roundId })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ journey: Array.isArray(data) ? data[0] ?? null : data ?? null })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
