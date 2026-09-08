import { requireRequestAccess } from '@/lib/auth/server-guards'
import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asUuid } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request, context: { params: Promise<{ seriesId: string }> }) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const { seriesId } = await context.params
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_integrated_continuation_series', {
      p_series_id: asUuid(seriesId, 'series_id'),
    })
    if (error) return continuationRpcErrorResponse(error)
    if (!data) return continuationJson({ error: 'not_found' }, 404)
    return continuationJson(data)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}
