import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { friendApiFailure, friendPrivateJson } from '@/lib/friends/http'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asUuid, readStrictJson } from '@/lib/server/tonight/api-contract'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const friendUserId = asUuid((await context.params).id, 'friend_user_id')
    const input = await readStrictJson(request, ['last_message_id'])
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('mark_my_friend_direct_messages_read', {
      p_friend_user_id: friendUserId,
      p_last_message_id: asUuid(input.last_message_id, 'last_message_id'),
    })
    if (error) return friendPrivateJson({ error: error.message === 'active_friendship_required' ? 'friendship_required' : 'read_cursor_failed' }, error.message === 'active_friendship_required' ? 403 : 503)
    return friendPrivateJson({ ok: data === true })
  } catch (error) { return friendApiFailure(error) }
}
