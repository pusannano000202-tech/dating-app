import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import { mapWeeklyAvailabilityRpcError } from '@/lib/matching/weekly-availability'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { TonightApiInputError, asInteger, asUuid, readStrictJson, tonightInputErrorResponse } from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  const secret = process.env.CONTINUATION_INTERNAL_SECRET || process.env.CRON_SECRET
  if (!secret || !isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) return continuationJson({ error: 'forbidden' }, 403)
  try {
    const body = await readStrictJson(request, ['application_id', 'window_id', 'occurrence_id', 'expected_revision', 'idempotency_key'])
    const service = createPaymentServiceClient()
    if (!service) return continuationJson({ error: 'service_unavailable' }, 503)
    const { data, error } = await service.rpc('assign_weekly_party_for_service', {
      p_application_id: asUuid(body.application_id, 'application_id'), p_window_id: asUuid(body.window_id, 'window_id'),
      p_occurrence_id: asUuid(body.occurrence_id, 'occurrence_id'),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asUuid(body.idempotency_key, 'idempotency_key'),
    })
    if (error) {
      const mapped = mapWeeklyAvailabilityRpcError(error)
      if (mapped?.error === 'assignment_retry') {
        return continuationJson({ error: mapped.error, retryable: true }, mapped.status)
      }
      return mapped ? continuationJson({ error: mapped.error }, mapped.status) : continuationRpcErrorResponse(error)
    }
    return continuationJson(data)
  } catch (error) { return error instanceof TonightApiInputError ? tonightInputErrorResponse(error) : continuationJson({ error: 'invalid_request' }, 400) }
}
