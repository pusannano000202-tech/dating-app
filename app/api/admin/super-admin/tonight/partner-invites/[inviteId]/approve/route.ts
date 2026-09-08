import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { partnerOnboardingRpcError } from '@/lib/server/tonight/account-onboarding'
import { asIdempotencyKey, asInteger, asUuid, privateJson, readStrictJson, tonightInputErrorResponse } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function POST(request: Request, context: { params: Promise<{ inviteId: string }> }) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const body = await readStrictJson(request, ['expected_revision', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('approve_tonight_partner_invite', {
      p_invite_id: asUuid((await context.params).inviteId, 'invite_id'),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 1, max: 2_147_483_647 }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return partnerOnboardingRpcError(error)
    return privateJson({ membership_id: data, status: 'approved' })
  } catch (error) {
    return error instanceof RequestGuardError ? requestGuardErrorResponse(error) : tonightInputErrorResponse(error)
  }
}
