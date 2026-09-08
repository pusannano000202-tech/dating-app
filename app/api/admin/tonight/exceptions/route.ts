import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  asOptionalString,
  asUuid,
  privateJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'
import { normalizeTonightExceptionPage } from '@/lib/server/tonight/exception-page'

const EXCEPTION_KEY_PATTERN = /^[0-9]{10}:[0-9]{2}:[a-z_]+:[0-9a-f-]{36}$/

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['admin', 'super_admin'] })
    const searchParams = new URL(request.url).searchParams
    const roundId = asUuid(searchParams.get('round_id'), 'round_id')
    const afterExceptionKey = asOptionalString(
      searchParams.get('after_exception_key'),
      'after_exception_key',
      { maxLength: 100, pattern: EXCEPTION_KEY_PATTERN },
    )
    const supabase = createSupabaseRequestClient(request)
    const [pageResult, countResult] = await Promise.all([
      supabase.rpc('admin_get_tonight_exception_page', {
        p_round_id: roundId,
        p_limit: 50,
        p_after_exception_key: afterExceptionKey,
      }),
      supabase.rpc('admin_get_tonight_exception_counts', { p_round_id: roundId }),
    ])
    if (pageResult.error) return tonightRpcErrorResponse(pageResult.error)
    if (countResult.error) return tonightRpcErrorResponse(countResult.error)

    const page = normalizeTonightExceptionPage(pageResult.data, countResult.data, 50)
    return privateJson({
      exceptions: page.exceptions,
      counts: page.counts,
      total_count: page.totalCount,
      next_after_exception_key: page.nextAfterExceptionKey,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
