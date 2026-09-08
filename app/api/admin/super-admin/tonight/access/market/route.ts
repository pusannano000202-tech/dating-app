import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { assertStrictSearchParams } from '@/lib/server/tonight/access-directory'
import { asIdempotencyKey, asInteger, asOptionalUuid, asRequiredString, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'
import { normalizeTonightMarketMembershipPage } from '@/lib/server/tonight/access-page'

const marketCode = (value: unknown) => asRequiredString(value, 'market_code', { maxLength: 24, pattern: /^PNU$/ })

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const searchParams = assertStrictSearchParams(request, [
      'market_code', 'after_membership_id', 'user_id',
    ])
    const market = marketCode(searchParams.get('market_code') ?? 'PNU')
    const afterMembershipId = asOptionalUuid(
      searchParams.get('after_membership_id'),
      'after_membership_id',
    )
    const userId = asOptionalUuid(searchParams.get('user_id'), 'user_id')
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_list_tonight_market_memberships_page', {
      p_market_code: market,
      p_limit: 50,
      p_after_membership_id: afterMembershipId,
      p_user_id: userId,
    })
    if (error) return tonightRpcErrorResponse(error)
    const page = normalizeTonightMarketMembershipPage(data, 50)
    return privateJson({
      memberships: page.memberships,
      next_after_membership_id: page.nextAfterMembershipId,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const body = await readStrictJson(request, ['market_code', 'user_id', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_grant_tonight_market_membership', {
      p_market_code: marketCode(body.market_code),
      p_user_id: asUuid(body.user_id, 'user_id'),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ membership_id: data }, 201)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const body = await readStrictJson(request, ['membership_id', 'expected_revision', 'idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_revoke_tonight_market_membership', {
      p_membership_id: asUuid(body.membership_id, 'membership_id'),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', { min: 0, max: 2_147_483_647 }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ membership_id: data, revoked: true })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
