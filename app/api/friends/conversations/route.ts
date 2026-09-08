import { requireRequestAccess } from '@/lib/auth/server-guards'
import { parseConversationList } from '@/lib/friends/conversation-state'
import { friendApiFailure, friendPrivateJson } from '@/lib/friends/http'
import { parseFriendCursor } from '@/lib/friends/pagination'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const url = new URL(request.url)
    const limitText = url.searchParams.get('limit') ?? '30'
    if (!/^\d{1,3}$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > 100) return friendPrivateJson({ error: 'invalid_limit' }, 400)
    const beforeText = url.searchParams.get('before')
    const before = beforeText == null ? null : parseFriendCursor(beforeText)
    if (beforeText != null && !before) return friendPrivateJson({ error: 'invalid_cursor' }, 400)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_friend_conversations', {
      p_before_created_at: before?.createdAt ?? null,
      p_before_friend_user_id: before?.id ?? null,
      p_limit: Number(limitText),
    })
    if (error) return friendPrivateJson({ error: 'conversation_lookup_failed' }, 503)
    if (!parseConversationList(data)) return friendPrivateJson({ error: 'service_unavailable' }, 503)
    return friendPrivateJson(data)
  } catch (error) { return friendApiFailure(error) }
}
