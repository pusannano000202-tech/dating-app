import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asIdempotencyKey, asInteger, asIsoTimestamp, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function POST(request: Request) {
  try {
    const body = await readStrictJson(request, [
      'venue_id', 'round_id', 'team_id', 'confirmed_attendee_count', 'service_completed_at',
      'expected_revision', 'idempotency_key',
    ])
    const venueId = asUuid(body.venue_id, 'venue_id')
    const roundId = asUuid(body.round_id, 'round_id')
    const teamId = asUuid(body.team_id, 'team_id')
    const confirmedAttendeeCount = asInteger(body.confirmed_attendee_count, 'confirmed_attendee_count', { min: 0, max: 6 })
    const serviceCompletedAt = asIsoTimestamp(body.service_completed_at, 'service_completed_at')
    const expectedRevision = asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 })
    const idempotencyKey = asIdempotencyKey(body.idempotency_key)
    await requireRequestAccess(request, { allowedRoles: ['partner'], partnerVenueId: venueId })
    const supabase = createSupabaseRequestClient(request)
    const scope = await supabase.rpc('partner_get_tonight_dashboard', { p_round_id: roundId })
    if (scope.error) return tonightRpcErrorResponse(scope.error)
    const ownsExactTeam = Array.isArray(scope.data) && scope.data.some((row) =>
      row && typeof row === 'object'
      && (row as Record<string, unknown>).venue_id === venueId
      && (row as Record<string, unknown>).team_id === teamId,
    )
    if (!ownsExactTeam) return privateJson({ error: 'not_found' }, 404)

    // This is intentionally a separate RPC call. Its transaction commits the
    // partner's immutable evidence even if canonical confirmation is blocked.
    const attempt = await supabase.rpc('partner_record_tonight_service_confirmation_attempt', {
      p_team_id: teamId,
      p_reported_attendee_count: confirmedAttendeeCount,
      p_service_completed_at: serviceCompletedAt,
      p_expected_revision: expectedRevision,
      p_idempotency_key: idempotencyKey,
    })
    if (attempt.error) return tonightRpcErrorResponse(attempt.error)
    const attemptData = attempt.data && typeof attempt.data === 'object' && !Array.isArray(attempt.data)
      ? attempt.data as Record<string, unknown>
      : null
    if (!attemptData || typeof attemptData.matches_attendance !== 'boolean') {
      return privateJson({ error: 'service_unavailable' }, 503)
    }
    if (!attemptData.matches_attendance) {
      return privateJson({
        error: 'attendance_reconciliation_required',
        attempt_id: attemptData.attempt_id,
        reported_attendee_count: attemptData.reported_attendee_count,
        observed_arrived_count: attemptData.observed_arrived_count,
      }, 409)
    }

    const { data, error } = await supabase.rpc('partner_confirm_tonight_service', {
      p_team_id: teamId,
      p_confirmed_attendee_count: confirmedAttendeeCount,
      p_service_completed_at: serviceCompletedAt,
      p_expected_revision: expectedRevision,
      p_idempotency_key: idempotencyKey,
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ service_confirmation_id: data })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
