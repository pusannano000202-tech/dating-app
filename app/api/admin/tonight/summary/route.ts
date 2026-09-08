import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asInteger, asUuid, privateJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['admin', 'super_admin'] })
    const searchParams = new URL(request.url).searchParams
    const roundId = asUuid(searchParams.get('round_id'), 'round_id')
    const rawAfter = searchParams.get('after_team_number')
    const afterTeamNumber = rawAfter === null
      ? null
      : asInteger(Number(rawAfter), 'after_team_number', { min: 0, max: 2_147_483_647 })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('admin_get_tonight_round_summary_page', {
      p_round_id: roundId,
      p_limit: 50,
      p_after_team_number: afterTeamNumber,
    })
    if (error) return tonightRpcErrorResponse(error)
    const rows = Array.isArray(data) ? data as Record<string, unknown>[] : []
    const teams = rows.slice(0, 50)
    const last = teams.at(-1)
    const lastTeamNumber = last?.summary_team_number
    return privateJson({
      teams,
      next_after_team_number: rows.length > 50 && typeof lastTeamNumber === 'number'
        ? lastTeamNumber
        : null,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
