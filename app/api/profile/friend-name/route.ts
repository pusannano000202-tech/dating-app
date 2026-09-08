import { requireRequestAccess } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { parseFriendRecognitionName } from '@/lib/friends/recognition-name'
import { firstRpcRow, friendApiFailure, friendPrivateJson } from '@/lib/friends/http'
import { readStrictJson } from '@/lib/server/tonight/api-contract'

export async function GET(request: Request) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_friend_recognition_name')
    if (error) return friendPrivateJson({ error: 'friend_name_lookup_failed' }, 503)
    const row = firstRpcRow(data)
    return friendPrivateJson({ friend_recognition_name: parseFriendRecognitionName(row?.friend_recognition_name) })
  } catch (error) { return friendApiFailure(error) }
}

export async function PUT(request: Request) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const body = await readStrictJson(request, ['friend_recognition_name'])
    const name = parseFriendRecognitionName(body.friend_recognition_name)
    if (!name) return friendPrivateJson({ error: 'invalid_friend_recognition_name' }, 400)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('set_my_friend_recognition_name', { p_friend_recognition_name: name })
    if (error) return friendPrivateJson({ error: 'friend_name_save_failed' }, 503)
    return friendPrivateJson({ ok: data === true, friend_recognition_name: name })
  } catch (error) { return friendApiFailure(error) }
}
