import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  TonightApiInputError,
  asUuid,
  privateJson,
  tonightInputErrorResponse,
  tonightRpcErrorResponse,
} from '@/lib/server/tonight/api-contract'

export const dynamic = 'force-dynamic'

const QUERY_KEYS = new Set(['round_id', 'limit'])

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
    })
    const url = new URL(request.url)
    for (const key of url.searchParams.keys()) {
      if (!QUERY_KEYS.has(key) || url.searchParams.getAll(key).length !== 1) {
        throw new TonightApiInputError('unexpected_field', key)
      }
    }
    const roundId = asUuid(url.searchParams.get('round_id'), 'round_id')
    const rawLimit = url.searchParams.get('limit')
    const limit = rawLimit === null ? 50 : Number(rawLimit)
    if (!/^\d+$/.test(rawLimit ?? '50') || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new TonightApiInputError('invalid_field', 'limit')
    }

    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc(
      'super_admin_list_tonight_reconciliation_failures',
      { p_round_id: roundId, p_limit: limit },
    )
    if (error) return tonightRpcErrorResponse(error)
    if (!Array.isArray(data)) return privateJson({ error: 'service_unavailable' }, 503)
    return privateJson({ jobs: data })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
