import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { getTonightFeatureState } from '@/lib/matching/tonight-ranked/runtime'
import { privateJson, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'
import { projectTonightRoundStats } from '@/lib/matching/event-calendar-stats'
import { readWithDeadline } from '@/lib/matching/tonight-ranked/read-with-deadline'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const feature = getTonightFeatureState()
    if (!feature.visible) return privateJson({ error: 'not_found' }, 404)

    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_current_tonight_round')
    if (error) return tonightRpcErrorResponse(error)
    const roundId = getTonightRoundId(data)
    let participationSummary: unknown = null
    let teamStats: unknown = null
    const readOptional = (
      name: 'get_my_tonight_participation_summary' | 'get_my_current_tonight_team_count',
      args: { p_round_id: string },
    ) => readWithDeadline(async signal => await supabase.rpc(name, args).abortSignal(signal), request.signal, 2_000)
    // Independent reads must not serially delay the caller's existing receipt.
    // Transport rejection is an unavailable optional value, not an empty round.
    const [summary, teams, gate] = await Promise.allSettled([
      roundId ? readOptional('get_my_tonight_participation_summary', { p_round_id: roundId }) : Promise.resolve({ data: null, error: null }),
      roundId ? readOptional('get_my_current_tonight_team_count', { p_round_id: roundId }) : Promise.resolve({ data: null, error: null }),
      readWithDeadline(async signal => await supabase.rpc('get_tonight_application_gate').abortSignal(signal), request.signal, 2_000),
    ])
    request.signal.throwIfAborted()
    for (const result of [summary, teams, gate]) {
      const readError = result.status === 'fulfilled' ? result.value.error : result.reason
      if (readError) {
        const response = tonightRpcErrorResponse(readError)
        // Explicit access denial must still stop private data delivery.
        if (response.status < 500) return response
      }
    }
    if (summary.status === 'fulfilled' && !summary.value.error) participationSummary = summary.value.data
    if (teams.status === 'fulfilled' && !teams.value.error) teamStats = teams.value.data
    const gateData = gate.status === 'fulfilled' ? gate.value.data : null
    const gateError = gate.status === 'fulfilled' ? gate.value.error : gate.reason
    const applicationsAvailable = !gateError && typeof gateData === 'boolean'
    const databaseApplicationsOpen = applicationsAvailable && gateData === true
    return privateJson({
      round: data ?? null,
      participation_summary: participationSummary,
      round_stats: roundId ? projectTonightRoundStats(participationSummary, teamStats, roundId) : null,
      applications_available: applicationsAvailable,
      applications_open: feature.applicationsOpen
        && databaseApplicationsOpen
        && isTonightRoundApplicationsOpen(data),
    })
  } catch (error) {
    return error instanceof RequestGuardError
      ? requestGuardErrorResponse(error)
      : privateJson({ error: 'service_unavailable' }, 503)
  }
}

function getTonightRoundId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const round = (value as Record<string, unknown>).round
  if (!round || typeof round !== 'object' || Array.isArray(round)) return null
  const id = (round as Record<string, unknown>).id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function isTonightRoundApplicationsOpen(value: unknown, now = Date.now()): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const payload = value as Record<string, unknown>
  if (payload.financial_recovery === true) return false
  const round = payload.round
  if (!round || typeof round !== 'object' || Array.isArray(round)) return false
  const row = round as Record<string, unknown>
  const status = row.status
  if (status === 'completed' || status === 'cancelled') return false
  if (status !== 'open') return false
  const opensAt = typeof row.signup_open_at === 'string' ? Date.parse(row.signup_open_at) : Number.NaN
  const closesAt = typeof row.signup_close_at === 'string' ? Date.parse(row.signup_close_at) : Number.NaN
  return Number.isFinite(opensAt) && Number.isFinite(closesAt)
    && opensAt <= now && now < closesAt
}
