import { requireRequestAccess } from '@/lib/auth/server-guards'
import { hashFriendInviteToken, normalizeFriendInviteToken } from '@/lib/friends/invite-token'
import { firstRpcRow, friendApiFailure, friendPrivateJson, inviteRpcFailure } from '@/lib/friends/http'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

type Context = { params: Promise<{ token: string }> }

export async function GET(request: Request, context: Context) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const raw = normalizeFriendInviteToken((await context.params).token)
    if (!raw) return friendPrivateJson({ error: 'invite_not_found' }, 404)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('preview_friend_invite', { p_token_hash: hashFriendInviteToken(raw) })
    if (error) return inviteRpcFailure(error)
    const invite = firstRpcRow(data)
    if (!invite) return friendPrivateJson({ error: 'invite_not_found' }, 404)
    return friendPrivateJson({ invite })
  } catch (error) { return friendApiFailure(error) }
}
