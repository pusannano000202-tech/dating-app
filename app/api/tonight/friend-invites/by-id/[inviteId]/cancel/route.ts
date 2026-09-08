import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { tonightFriendInviteRpcErrorResponse } from '@/lib/server/tonight/friend-invites'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { TonightApiInputError, asIdempotencyKey, asUuid, privateJson, readStrictJson, tonightInputErrorResponse } from '@/lib/server/tonight/api-contract'

export async function DELETE(request: Request, context: { params: Promise<{ inviteId: string }> }) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'] })
    const inviteId = asUuid((await context.params).inviteId, 'invite_id')
    const body = await readStrictJson(request, ['idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('cancel_tonight_friend_invite', {
      p_invite_id: inviteId,
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

