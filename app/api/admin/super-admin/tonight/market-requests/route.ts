import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { privateJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_list_tonight_market_membership_requests')
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ requests: Array.isArray(data) ? data : [] })
  } catch (error) {
    return error instanceof RequestGuardError ? requestGuardErrorResponse(error) : tonightInputErrorResponse(error)
  }
}
