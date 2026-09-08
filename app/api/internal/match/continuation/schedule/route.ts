import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { continuationJson, continuationRpcErrorResponse, isRecord } from '@/lib/matching/continuation-api'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { TonightApiInputError, asInteger, asIsoTimestamp, asUuid, readStrictJson, tonightInputErrorResponse } from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  const secret = process.env.CONTINUATION_INTERNAL_SECRET || process.env.CRON_SECRET
  if (!secret || !isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) return continuationJson({ error: 'forbidden' }, 403)
  try {
    const body = await readStrictJson(request, ['transition_id', 'starts_at', 'ends_at', 'location_snapshot', 'expected_transition_revision', 'idempotency_key'])
    if (!isRecord(body.location_snapshot)) throw new TonightApiInputError('invalid_field', 'location_snapshot')
    const service = createPaymentServiceClient()
    if (!service) return continuationJson({ error: 'service_unavailable' }, 503)
    const { data, error } = await service.rpc('schedule_continuation_occurrence_for_service', {
      p_transition_id: asUuid(body.transition_id, 'transition_id'), p_starts_at: asIsoTimestamp(body.starts_at, 'starts_at'),
      p_ends_at: asIsoTimestamp(body.ends_at, 'ends_at'), p_location_snapshot: body.location_snapshot,
      p_expected_transition_revision: asInteger(body.expected_transition_revision, 'expected_transition_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) return continuationRpcErrorResponse(error)
    return continuationJson(data, 201)
  } catch (error) { return error instanceof TonightApiInputError ? tonightInputErrorResponse(error) : continuationJson({ error: 'invalid_request' }, 400) }
}
