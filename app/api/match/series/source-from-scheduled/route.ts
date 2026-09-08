import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const body = await readStrictJson(request, ['occurrence_id', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('register_my_scheduled_continuation_source', {
      p_occurrence_id: asUuid(body.occurrence_id, 'occurrence_id'),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return continuationRpcErrorResponse(error)
    return continuationJson(data, data && typeof data === 'object' && 'replayed' in data && data.replayed ? 200 : 201)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}
