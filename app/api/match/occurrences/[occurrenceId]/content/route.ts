import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { continuationJson, continuationRpcErrorResponse, isRecord } from '@/lib/matching/continuation-api'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asInteger, asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request, context: { params: Promise<{ occurrenceId: string }> }) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const { occurrenceId } = await context.params
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_continuation_occurrence_content', {
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
    const body = await readStrictJson(request, ['action', 'payload', 'expected_content_revision', 'idempotency_key'])
    if (!isRecord(body.payload)) throw new TypeError('payload_must_be_object')
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('apply_my_continuation_content_action', {
      p_occurrence_id: asUuid(occurrenceId, 'occurrence_id'),
      p_action: asRequiredString(body.action, 'action', { maxLength: 80 }),
      p_payload: body.payload,
      p_expected_content_revision: asInteger(body.expected_content_revision, 'expected_content_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return continuationRpcErrorResponse(error)
    return continuationJson(data)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}
