import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { hashFriendInviteToken, normalizeFriendInviteToken } from '@/lib/friends/invite-token'
import { firstRpcRow, friendApiFailure, friendPrivateJson, inviteRpcFailure } from '@/lib/friends/http'
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
    const { data, error } = await supabase.rpc('accept_friend_invite', {
      p_token_hash: hashFriendInviteToken(raw), p_idempotency_key: asIdempotencyKey(input.idempotency_key),
    })
    if (error) return inviteRpcFailure(error)
    const row = firstRpcRow(data)
    if (typeof row?.friend_user_id !== 'string') return friendPrivateJson({ error: 'service_unavailable' }, 503)
    return friendPrivateJson({ friend_user_id: row.friend_user_id, status: 'accepted' })
  } catch (error) { return friendApiFailure(error) }
}
