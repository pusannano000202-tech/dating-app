import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createPartnerOnboardingToken, partnerOnboardingRpcError } from '@/lib/server/tonight/account-onboarding'
import { asIdempotencyKey, asInteger, asRequiredString, asUuid, privateJson, readStrictJson, tonightInputErrorResponse } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('super_admin_list_tonight_partner_invites')
    if (error) return partnerOnboardingRpcError(error)
    return privateJson({ invites: Array.isArray(data) ? data : [] })
  } catch (error) {
    return error instanceof RequestGuardError ? requestGuardErrorResponse(error) : tonightInputErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['super_admin'], requireRecentAuth: true })
    const body = await readStrictJson(request, [
      'venue_id', 'invited_user_id', 'partner_role', 'expires_in_hours',
      'expected_membership_revision', 'idempotency_key',
    ])
    const venueId = asUuid(body.venue_id, 'venue_id')
    const invitedUserId = asUuid(body.invited_user_id, 'invited_user_id')
    const partnerRole = asRequiredString(body.partner_role, 'partner_role', { pattern: /^(?:owner|staff)$/, maxLength: 8 })
    const expiresInHours = asInteger(body.expires_in_hours, 'expires_in_hours', { min: 1, max: 168 })
    const expectedRevision = asInteger(body.expected_membership_revision, 'expected_membership_revision', { min: 0, max: 2_147_483_647 })
    const idempotencyKey = asIdempotencyKey(body.idempotency_key)
    const { rawToken, tokenHash } = createPartnerOnboardingToken()
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('create_tonight_partner_invite', {
      p_venue_id: venueId,
      p_invited_user_id: invitedUserId,
      p_partner_role: partnerRole,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
      p_expected_membership_revision: expectedRevision,
      p_idempotency_key: idempotencyKey,
    })
    if (error) return partnerOnboardingRpcError(error)
    const invite = Array.isArray(data) ? data[0] ?? null : data
    if (!invite || typeof invite !== 'object' || invite.created !== true) {
      return privateJson({ error: 'invite_link_not_recoverable' }, 409)
    }
    return privateJson({
      invite,
      token: rawToken,
      invite_path: `/onboarding/partner/${rawToken}`,
      token_recoverable: false,
    }, 201)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}
