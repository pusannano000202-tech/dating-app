import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createTonightFriendInviteToken, tonightFriendInviteRpcErrorResponse } from '@/lib/server/tonight/friend-invites'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  TonightApiInputError,
  asIdempotencyKey,
  asOptionalUuid,
  asUuid,
  privateJson,
  readStrictJson,
  tonightInputErrorResponse,
} from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const roundId = asUuid(new URL(request.url).searchParams.get('round_id'), 'round_id')
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_tonight_friend_invites', { p_round_id: roundId })
    if (error) return tonightFriendInviteRpcErrorResponse(error)
    return privateJson({ invites: Array.isArray(data) ? data : [] })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return tonightInputErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const body = await readStrictJson(request, ['round_id', 'invited_user_id', 'idempotency_key'])
    const roundId = asUuid(body.round_id, 'round_id')
    const invitedUserId = asOptionalUuid(body.invited_user_id, 'invited_user_id')
    const idempotencyKey = asIdempotencyKey(body.idempotency_key)
    const { rawToken, tokenHash } = createTonightFriendInviteToken()
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('create_tonight_friend_invite', {
      p_round_id: roundId,
      p_invited_user_id: invitedUserId,
      p_token_hash: tokenHash,
      p_idempotency_key: idempotencyKey,
    })
    if (error) return tonightFriendInviteRpcErrorResponse(error)
    const invite = Array.isArray(data) ? data[0] ?? null : data
    const inviteId = invite && typeof invite === 'object' && 'id' in invite && typeof invite.id === 'string'
      ? invite.id
      : null
    if (!invite || typeof invite !== 'object' || !('created' in invite) || invite.created !== true) {
      return privateJson({
        error: 'invite_link_not_recoverable',
        invite_id: inviteId,
      }, 409)
    }
    return privateJson({
      invite,
      token: rawToken,
      invite_path: `/tonight/invite/${rawToken}`,
      token_recoverable: false,
    }, 201)
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightApiInputError) return tonightInputErrorResponse(error)
    return privateJson({ error: 'service_unavailable' }, 503)
  }
}
