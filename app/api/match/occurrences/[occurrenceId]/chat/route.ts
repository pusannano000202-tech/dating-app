import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request, context: { params: Promise<{ occurrenceId: string }> }) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const { occurrenceId } = await context.params
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_continuation_chat', {
      p_occurrence_id: asUuid(occurrenceId, 'occurrence_id'),
    })
    if (error) return continuationRpcErrorResponse(error)
    return continuationJson(data)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}

export async function POST(request: Request, context: { params: Promise<{ occurrenceId: string }> }) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const { occurrenceId } = await context.params
    const body = await readStrictJson(request, ['message', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('send_my_continuation_chat_message', {
      p_occurrence_id: asUuid(occurrenceId, 'occurrence_id'),
      p_message: asRequiredString(body.message, 'message', { maxLength: 1000 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return continuationRpcErrorResponse(error)
    return continuationJson(data, 201)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}
