import { requireRequestAccess } from '@/lib/auth/server-guards'
import { parseFriendSceneList } from '@/lib/friends/scene'
import { friendApiFailure, friendPrivateJson } from '@/lib/friends/http'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_friend_scene_summaries')
    if (error) return friendPrivateJson({ error: 'friend_scene_lookup_failed' }, 503)
    const friends = parseFriendSceneList({ friends: Array.isArray(data) ? data : [] })
    if (!friends) return friendPrivateJson({ error: 'friend_scene_invalid_response' }, 503)
    return friendPrivateJson({
      friends: friends.map((row) => ({
        friend_user_id: row.friendUserId,
        scene_kind: row.kind,
        evidence_kind: row.evidence,
      })),
    })
  } catch (error) {
    return friendApiFailure(error)
  }
}
