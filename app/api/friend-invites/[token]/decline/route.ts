import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { hashFriendInviteToken, normalizeFriendInviteToken } from '@/lib/friends/invite-token'
import { friendApiFailure, friendPrivateJson, inviteRpcFailure } from '@/lib/friends/http'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asIdempotencyKey, readStrictJson } from '@/lib/server/tonight/api-contract'

type Context = { params: Promise<{ token: string }> }
export async function POST(request: Request, context: Context) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const raw = normalizeFriendInviteToken((await context.params).token)
    if (!raw) return friendPrivateJson({ error: 'invite_not_found' }, 404)
    const input = await readStrictJson(request, ['idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('decline_friend_invite', {
      p_token_hash: hashFriendInviteToken(raw), p_idempotency_key: asIdempotencyKey(input.idempotency_key),
    })
    if (error) return inviteRpcFailure(error)
    return friendPrivateJson({ ok: data === true, status: 'declined' })
  } catch (error) { return friendApiFailure(error) }
}
