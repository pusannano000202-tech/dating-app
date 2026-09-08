import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { createRetrySafeFriendInviteToken } from '@/lib/friends/invite-token'
import { firstRpcRow, friendApiFailure, friendPrivateJson, inviteRpcFailure } from '@/lib/friends/http'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asIdempotencyKey, readStrictJson } from '@/lib/server/tonight/api-contract'

// friendPrivateJson applies `Cache-Control: private, no-store` to every branch.

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_friend_invites')
    if (error) return inviteRpcFailure(error)
    return friendPrivateJson({ invites: Array.isArray(data) ? data : [] })
  } catch (error) { return friendApiFailure(error) }
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const input = await readStrictJson(request, ['idempotency_key'])
    const idempotencyKey = asIdempotencyKey(input.idempotency_key)
    const secret = process.env.FRIEND_INVITE_TOKEN_SECRET
    if (!secret) return friendPrivateJson({ error: 'service_unavailable' }, 503)
    const token = createRetrySafeFriendInviteToken(idempotencyKey, secret)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('create_my_friend_invite', {
      p_token_hash: token.tokenHash,
      p_idempotency_key: idempotencyKey,
    })
    if (error) return inviteRpcFailure(error)
    const row = firstRpcRow(data)
    if (typeof row?.invite_id !== 'string' || typeof row.expires_at !== 'string') return friendPrivateJson({ error: 'service_unavailable' }, 503)
    return friendPrivateJson({
      invite_id: row.invite_id,
      invite_url: `/friend-invites/${token.rawToken}`,
      expires_at: row.expires_at,
    }, 201)
  } catch (error) { return friendApiFailure(error) }
}
