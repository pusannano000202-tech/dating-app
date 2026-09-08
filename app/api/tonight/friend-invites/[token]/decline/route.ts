import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { hashTonightFriendInviteToken, normalizeTonightFriendInviteToken, tonightFriendInviteRpcErrorResponse } from '@/lib/server/tonight/friend-invites'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { TonightApiInputError, asIdempotencyKey, privateJson, readStrictJson, tonightInputErrorResponse } from '@/lib/server/tonight/api-contract'

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const token = normalizeTonightFriendInviteToken((await context.params).token)
    if (!token) throw new TonightApiInputError('invalid_field', 'token')
    const body = await readStrictJson(request, ['idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('decline_tonight_friend_invite', {
      p_token_hash: hashTonightFriendInviteToken(token),
      p_idempotency_key: asIdempotencyKey(body.idempotency_key),
    })
    if (error) return tonightFriendInviteRpcErrorResponse(error)
    return privateJson({ invite: Array.isArray(data) ? data[0] ?? null : data })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    if (error instanceof TonightApiInputError) return tonightInputErrorResponse(error)
    return privateJson({ error: 'service_unavailable' }, 503)
  }
}

