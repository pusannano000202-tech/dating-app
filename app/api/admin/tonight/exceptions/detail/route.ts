import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { toAdminExceptionDetailDto } from '@/lib/auth/admin-exception-privacy'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  asRequiredString,
  asUuid,
  privateJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

const EXCEPTION_KEY_PATTERN = /^[0-9]{10}:[0-9]{2}:[a-z_]+:[0-9a-f-]{36}$/

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['admin', 'super_admin'] })
    const searchParams = new URL(request.url).searchParams
    const roundId = asUuid(searchParams.get('round_id'), 'round_id')
    const exceptionKey = asRequiredString(
      searchParams.get('exception_key'),
      'exception_key',
      { maxLength: 100, pattern: EXCEPTION_KEY_PATTERN },
    )
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('admin_get_tonight_exception_detail', {
      p_round_id: roundId,
      p_exception_key: exceptionKey,
    })
    if (error) return tonightRpcErrorResponse(error)
    const detail = Array.isArray(data) ? data[0] : null
    if (!detail) return privateJson({ error: 'not_found' }, 404)
    const safeDetail = toAdminExceptionDetailDto(detail)
    if (!safeDetail) return privateJson({ error: 'unexpected_response' }, 503)
    return privateJson({ exception: safeDetail })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
