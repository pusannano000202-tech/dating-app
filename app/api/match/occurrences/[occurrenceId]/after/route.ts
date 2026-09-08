import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { continuationJson, continuationRpcErrorResponse, isRecord } from '@/lib/matching/continuation-api'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { TonightApiInputError, asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request, context: { params: Promise<{ occurrenceId: string }> }) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const { occurrenceId } = await context.params
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_continuation_after', {
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
    const body = await readStrictJson(request, ['action', 'idempotency_key'])
    const action = asRequiredString(body.action, 'action', { maxLength: 40 })
    if (action !== 'open_next') throw new TonightApiInputError('invalid_field', 'action')
    const supabase = createSupabaseRequestClient(request)
    const after = await supabase.rpc('get_my_continuation_after', {
      p_occurrence_id: asUuid(occurrenceId, 'occurrence_id'),
    })
    if (after.error) return continuationRpcErrorResponse(after.error)
    if (!isRecord(after.data) || typeof after.data.series_id !== 'string') return continuationJson({ error: 'not_found' }, 404)
    const series = await supabase.rpc('get_my_integrated_continuation_series', { p_series_id: after.data.series_id })
    if (series.error) return continuationRpcErrorResponse(series.error)
    if (!isRecord(series.data) || typeof series.data.source_id !== 'string') return continuationJson({ error: 'not_found' }, 404)
    const result = await supabase.rpc('open_continuation_transition', {
      p_source_id: asUuid(series.data.source_id, 'source_id'),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (result.error) return continuationRpcErrorResponse(result.error)
    return continuationJson(result.data, 201)
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}
