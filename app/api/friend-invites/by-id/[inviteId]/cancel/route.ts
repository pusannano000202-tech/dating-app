import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { friendApiFailure, friendPrivateJson, inviteRpcFailure } from '@/lib/friends/http'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asIdempotencyKey, asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'

type Context = { params: Promise<{ inviteId: string }> }
export async function POST(request: Request, context: Context) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const inviteId = asUuid((await context.params).inviteId, 'invite_id')
    const input = await readStrictJson(request, ['idempotency_key'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('cancel_my_friend_invite', {
      p_invite_id: inviteId, p_idempotency_key: asIdempotencyKey(input.idempotency_key),
    })
    if (error) return inviteRpcFailure(error)
    return friendPrivateJson({ ok: data === true, status: 'cancelled' })
  } catch (error) { return friendApiFailure(error) }
}
