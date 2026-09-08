import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { continuationJson, continuationRpcErrorResponse } from '@/lib/matching/continuation-api'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { TonightApiInputError, asInteger, asRequiredString, asUuid, readStrictJson, tonightInputErrorResponse } from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  const secret = process.env.CONTINUATION_INTERNAL_SECRET || process.env.CRON_SECRET
  if (!secret || !isAuthorizedInternalRequest(request.headers.get('authorization'), secret)) return continuationJson({ error: 'forbidden' }, 403)
  try {
    const body = await readStrictJson(request, ['occurrence_id', 'participant_user_id', 'attendance_status', 'expected_attendance_revision', 'resolution_id', 'reason'])
    const attendance = asRequiredString(body.attendance_status, 'attendance_status', { maxLength: 16 })
    if (!['present', 'absent', 'disputed'].includes(attendance)) throw new TonightApiInputError('invalid_field', 'attendance_status')
    const service = createPaymentServiceClient()
    if (!service) return continuationJson({ error: 'service_unavailable' }, 503)
    const { data, error } = await service.rpc('resolve_weekly_attendance_for_service', {
      p_occurrence_id: asUuid(body.occurrence_id, 'occurrence_id'), p_participant_user_id: asUuid(body.participant_user_id, 'participant_user_id'),
      p_attendance_status: attendance,
      p_expected_attendance_revision: asInteger(body.expected_attendance_revision, 'expected_attendance_revision', { min: 0, max: 2_147_483_647 }),
      p_resolution_id: asUuid(body.resolution_id, 'resolution_id'), p_reason: asRequiredString(body.reason, 'reason', { maxLength: 280 }),
    })
    if (error) return continuationRpcErrorResponse(error)
    return continuationJson(data)
  } catch (error) { return error instanceof TonightApiInputError ? tonightInputErrorResponse(error) : continuationJson({ error: 'invalid_request' }, 400) }
}
