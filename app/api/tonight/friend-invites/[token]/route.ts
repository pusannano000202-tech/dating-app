import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { hashTonightFriendInviteToken, normalizeTonightFriendInviteToken, tonightFriendInviteRpcErrorResponse } from '@/lib/server/tonight/friend-invites'
import { privateJson, tonightInputErrorResponse } from '@/lib/server/tonight/api-contract'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const token = normalizeTonightFriendInviteToken((await context.params).token)
    if (!token) return tonightInputErrorResponse(null)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_tonight_friend_invite', {
      p_token_hash: hashTonightFriendInviteToken(token),
    })
    if (error) return tonightFriendInviteRpcErrorResponse(error)
    return privateJson({ invite: Array.isArray(data) ? data[0] ?? null : data })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return privateJson({ error: 'service_unavailable' }, 503)
  }
}

