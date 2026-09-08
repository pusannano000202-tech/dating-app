import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { continuationRouteErrorResponse } from '@/app/api/match/continuation-route'
import { continuationJson, continuationRpcErrorResponse, isRecord } from '@/lib/matching/continuation-api'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { TonightApiInputError, asInteger, asRequiredString, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'

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

export async function POST(request: Request, context: { params: Promise<{ seriesId: string }> }) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const { seriesId: rawSeriesId } = await context.params
    const seriesId = asUuid(rawSeriesId, 'series_id')
    const body = await readStrictJson(request, [
      'action', 'transition_id', 'choice', 'expected_roster_revision', 'idempotency_key',
    ])
    const action = asRequiredString(body.action, 'action', { maxLength: 40 })
    const idempotencyKey = asUuid(body.idempotency_key, 'idempotency_key')
    const supabase = createSupabaseRequestClient(request)

    if (action === 'open_transition') {
      if (body.transition_id !== undefined || body.choice !== undefined || body.expected_roster_revision !== undefined) {
        throw new TonightApiInputError('unexpected_field')
      }
      const series = await supabase.rpc('get_my_integrated_continuation_series', { p_series_id: seriesId })
      if (series.error) return continuationRpcErrorResponse(series.error)
      if (!isRecord(series.data) || typeof series.data.source_id !== 'string') {
        return continuationJson({ error: 'not_found' }, 404)
      }
      const result = await supabase.rpc('open_continuation_transition', {
        p_source_id: asUuid(series.data.source_id, 'source_id'),
        p_idempotency_key: idempotencyKey,
      })
      if (result.error) return continuationRpcErrorResponse(result.error)
      return continuationJson(result.data, 201)
    }

    if (action === 'set_choice') {
      const choice = asRequiredString(body.choice, 'choice', { maxLength: 16 })
      if (choice !== 'continue' && choice !== 'end') throw new TonightApiInputError('invalid_field', 'choice')
      const result = await supabase.rpc('set_my_continuation_choice', {
        p_transition_id: asUuid(body.transition_id, 'transition_id'),
        p_choice: choice,
        p_expected_roster_revision: asInteger(body.expected_roster_revision, 'expected_roster_revision', { min: 0, max: 2_147_483_647 }),
        p_idempotency_key: idempotencyKey,
      })
      if (result.error) return continuationRpcErrorResponse(result.error)
      if (isRecord(result.data) && typeof result.data.series_id === 'string' && result.data.series_id !== seriesId) {
        return continuationJson({ error: 'not_found' }, 404)
      }
      return continuationJson(result.data)
    }
    throw new TonightApiInputError('invalid_field', 'action')
  } catch (error) {
    return continuationRouteErrorResponse(error)
  }
}
