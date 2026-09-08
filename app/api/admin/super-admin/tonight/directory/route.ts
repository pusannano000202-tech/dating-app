import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  TonightApiInputError,
  asRequiredString,
  privateJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

export const dynamic = 'force-dynamic'

const DIRECTORY_QUERY_PATTERN = /^[0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ@.+\-\s]{2,80}$/u

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const supabase = createSupabaseRequestClient(request)

    const url = new URL(request.url)
    const keys = [...new Set(url.searchParams.keys())]
    if (keys.length !== 1 || keys[0] !== 'q' || url.searchParams.getAll('q').length !== 1) {
      throw new TonightApiInputError('unexpected_field', keys.find((key) => key !== 'q') ?? 'q')
    }
    const rawQuery = url.searchParams.get('q')
    if (typeof rawQuery !== 'string' || rawQuery.trim().length < 2) {
      return privateJson({ error: 'query_too_short' }, 400)
    }
    const query = asRequiredString(rawQuery, 'q', {
      minLength: 2,
      maxLength: 80,
      pattern: DIRECTORY_QUERY_PATTERN,
    })
    const directory = await supabase.rpc('super_admin_search_tonight_directory', {
      p_query: query,
    })
    if (directory.error) return tonightRpcErrorResponse(directory.error)
    return privateJson(directory.data ?? { users: [], venues: [] })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
