import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asOptionalUuid, asUuid, privateJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const roundId = asUuid(url.searchParams.get('round_id'), 'round_id')
    const venueId = asOptionalUuid(url.searchParams.get('venue_id'), 'venue_id')
    await requireRequestAccess(request, {
      allowedRoles: ['partner'],
      ...(venueId ? { partnerVenueId: venueId } : {}),
    })
    const supabase = createSupabaseRequestClient(request)
    const [dashboardResult, availabilityResult] = await Promise.all([
      supabase.rpc('partner_get_tonight_dashboard', { p_round_id: roundId }),
      supabase.rpc('partner_get_tonight_service_availability', { p_round_id: roundId }),
    ])
    if (dashboardResult.error) return tonightRpcErrorResponse(dashboardResult.error)
    if (availabilityResult.error) return tonightRpcErrorResponse(availabilityResult.error)
    const availabilityByTeam = new Map(
      (Array.isArray(availabilityResult.data) ? availabilityResult.data : [])
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
        .map((row) => [row.team_id, row]),
    )
    const data = (Array.isArray(dashboardResult.data) ? dashboardResult.data : []).map((value) => {
      if (!value || typeof value !== 'object') return value
      const row = value as Record<string, unknown>
      const availability = availabilityByTeam.get(row.team_id)
      return {
        ...row,
        service_confirm_after: availability?.service_confirm_after ?? null,
        can_confirm_service: availability?.can_confirm_service === true,
      }
    })
    const rows = Array.isArray(data) ? data : []
    const dashboard = venueId
      ? rows.filter((row) => row && typeof row === 'object' && (row as Record<string, unknown>).venue_id === venueId)
      : rows
    // Membership was verified above. An owned venue can legitimately have no capacities or teams yet.
    return privateJson({ dashboard })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
