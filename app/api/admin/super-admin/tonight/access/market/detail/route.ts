import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { hydrateTonightAccessMemberships } from '@/lib/server/tonight/access-directory'
import { asUuid, privateJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const membershipId = asUuid(
      new URL(request.url).searchParams.get('membership_id'),
      'membership_id',
    )
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_get_tonight_market_membership', {
      p_membership_id: membershipId,
    })
    if (error) return tonightRpcErrorResponse(error)
    const membership = Array.isArray(data) ? data[0] : null
    if (!membership) return privateJson({ error: 'not_found' }, 404)

    const service = createPaymentServiceClient()
    if (!service) return privateJson({ error: 'service_unavailable' }, 503)
    const hydrated = await hydrateTonightAccessMemberships(
      service,
      [membership] as Array<Record<string, unknown> & { user_id: string }>,
    )
    if (hydrated.error || !hydrated.data?.[0]) {
      return privateJson({ error: 'service_unavailable' }, 503)
    }
    return privateJson({ membership: hydrated.data[0] })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
