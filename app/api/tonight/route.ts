import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { getTonightFeatureState } from '@/lib/matching/tonight-ranked/runtime'
import { privateJson, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

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
    if (roundId) {
      const { data: summaryData, error: summaryError } = await supabase.rpc(
        'get_my_tonight_participation_summary',
        { p_round_id: roundId },
      )
      if (summaryError) return tonightRpcErrorResponse(summaryError)
      participationSummary = summaryData
    }
    const { data: gateData, error: gateError } = await supabase.rpc('get_tonight_application_gate')
    if (gateError) return tonightRpcErrorResponse(gateError)
    const databaseApplicationsOpen = gateData === true
    return privateJson({
      round: data ?? null,
      participation_summary: participationSummary,
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
