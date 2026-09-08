import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { assertStrictSearchParams } from '@/lib/server/tonight/access-directory'
import {
  asInteger,
  privateJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'
import {
  decodeTonightRoundCursor,
  normalizeTonightRoundPage,
} from '@/lib/server/tonight/round-page'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['admin', 'super_admin'] })
    const searchParams = assertStrictSearchParams(request, ['limit', 'cursor'])
    const limitValue = searchParams.get('limit')
    const limit = limitValue === null
      ? 50
      : asInteger(Number(limitValue), 'limit', { min: 1, max: 50 })
    const cursor = decodeTonightRoundCursor(searchParams.get('cursor'))
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('admin_list_tonight_rounds', {
      p_limit: limit,
      p_before_starts_at: cursor?.startsAt ?? null,
      p_before_id: cursor?.id ?? null,
    })
    if (error) return tonightRpcErrorResponse(error)
    const page = normalizeTonightRoundPage(data, limit)
    return privateJson({ rounds: page.rounds, next_cursor: page.nextCursor })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
