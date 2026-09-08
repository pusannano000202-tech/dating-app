import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asInteger, asUuid, privateJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const searchParams = new URL(request.url).searchParams
    const roundId = asUuid(searchParams.get('round_id'), 'round_id')
    const rawAfter = searchParams.get('after_team_number')
    const afterTeamNumber = rawAfter === null
      ? null
      : asInteger(Number(rawAfter), 'after_team_number', { min: 0, max: 2_147_483_647 })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_list_tonight_team_bundle_options', {
      p_round_id: roundId,
      p_limit: 50,
      p_after_team_number: afterTeamNumber,
    })
    if (error) return tonightRpcErrorResponse(error)
    const rows = Array.isArray(data) ? data as Record<string, unknown>[] : []
    const teamNumbers = [...new Set(rows
      .map((row) => row.bundle_team_number)
      .filter((value): value is number => typeof value === 'number'))]
      .sort((a, b) => a - b)
    const visibleTeamNumbers = new Set(teamNumbers.slice(0, 50))
    return privateJson({
      bundles: rows.filter((row) => visibleTeamNumbers.has(row.bundle_team_number as number)),
      next_after_team_number: teamNumbers.length > 50 ? teamNumbers[49] : null,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
