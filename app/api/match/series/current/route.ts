import { requireRequestAccess } from '@/lib/auth/server-guards'
import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_integrated_continuation_series', { p_series_id: null })
    if (error) return continuationRpcErrorResponse(error)
    return continuationJson(data)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}
