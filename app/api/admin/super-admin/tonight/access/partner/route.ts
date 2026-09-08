import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { assertStrictSearchParams } from '@/lib/server/tonight/access-directory'
import { normalizeTonightPartnerMembershipPage } from '@/lib/server/tonight/access-page'
import { asIdempotencyKey, asInteger, asOptionalUuid, asRequiredString, asUuid, privateJson, readStrictJson, tonightInputErrorResponse, tonightRpcErrorResponse } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const searchParams = assertStrictSearchParams(request, [
      'venue_id', 'user_id', 'after_membership_id', 'include_revoked',
    ])
    const venueId = asOptionalUuid(searchParams.get('venue_id'), 'venue_id')
    const userId = asOptionalUuid(searchParams.get('user_id'), 'user_id')
    const afterMembershipId = asOptionalUuid(
      searchParams.get('after_membership_id'),
      'after_membership_id',
    )
    const includeRevokedRaw = searchParams.get('include_revoked')
    if (includeRevokedRaw !== null && !/^(?:true|false)$/.test(includeRevokedRaw)) {
      return privateJson({ error: 'invalid_request' }, 400)
    }
    const includeRevoked = includeRevokedRaw === 'true'
    const supabase = createSupabaseRequestClient(request)
    let membershipState: unknown = null
    if (userId && venueId && afterMembershipId === null) {
      const { data: stateData, error: stateError } = await supabase.rpc(
        'super_admin_get_venue_partner_membership_state',
        {
          p_user_id: userId,
          p_venue_id: venueId,
        },
      )
      if (stateError) return tonightRpcErrorResponse(stateError)
      if (!Array.isArray(stateData) || stateData.length !== 1) {
        return privateJson({ error: 'service_unavailable' }, 503)
      }
      membershipState = stateData[0]
    }
    const { data, error } = await supabase.rpc('super_admin_list_venue_partner_memberships_page', {
      p_limit: 50,
      p_after_membership_id: afterMembershipId,
      p_venue_id: venueId,
      p_user_id: userId,
      p_include_revoked: includeRevoked,
    })
    if (error) return tonightRpcErrorResponse(error)
    const page = normalizeTonightPartnerMembershipPage(data, 50)
    return privateJson({
      memberships: page.memberships,
      membership_state: membershipState,
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
    const body = await readStrictJson(request, [
      'user_id', 'venue_id', 'role', 'expected_revision', 'idempotency_key',
    ])
    const role = asRequiredString(body.role, 'role', { maxLength: 8, pattern: /^(?:owner|staff)$/ })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('grant_venue_partner_membership', {
      p_user_id: asUuid(body.user_id, 'user_id'),
      p_venue_id: asUuid(body.venue_id, 'venue_id'),
      p_role: role,
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', {
        min: 0,
        max: 2_147_483_647,
      }),
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
    const body = await readStrictJson(request, [
      'membership_id', 'expected_revision', 'idempotency_key',
    ])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('revoke_venue_partner_membership', {
      p_membership_id: asUuid(body.membership_id, 'membership_id'),
      p_expected_revision: asInteger(body.expected_revision, 'expected_revision', {
        min: 1,
        max: 2_147_483_647,
      }),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightRpcErrorResponse(error)
    return privateJson({ revoked: data === true })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
