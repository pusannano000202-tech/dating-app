import { requireRequestAccess, RequestGuardError, requestGuardErrorResponse } from '@/lib/auth/server-guards'
import { assertTrustedMutationOrigin, TrustedOriginError } from '@/lib/auth/trusted-origin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { asUuid, readStrictJson, TonightApiInputError } from '@/lib/server/tonight/api-contract'
import { isFriendDirectChatUserId, mapFriendChatRpcError, parseFriendDirectChatInput } from '@/lib/matching/friend-direct-chat'
import { parseFriendChatPage } from '@/lib/friends/conversation-state'
import { parseFriendCursor } from '@/lib/friends/pagination'

type Context = { params: Promise<{ id: string }> }

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'private, no-store',
    ...(status === 429 ? { 'Retry-After': '60' } : {}),
  } })
}

function failure(error: unknown) {
  if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
  if (error instanceof TrustedOriginError) return json({ error: 'forbidden' }, error.status)
  if (error instanceof TonightApiInputError) return json({ error: 'invalid_request' }, 400)
  return json({ error: 'service_unavailable' }, 503)
}

export async function GET(request: Request, context: Context) {
  try {
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const { id } = await context.params
    const url = new URL(request.url)
    const limit = url.searchParams.get('limit') ?? '50'
    if (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) return json({ error: 'invalid_limit' }, 400)
    const beforeText = url.searchParams.get('before')
    const before = beforeText == null ? null : parseFriendCursor(beforeText)
    if (beforeText != null && !before) return json({ error: 'invalid_cursor' }, 400)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('get_my_friend_direct_messages_page', {
      p_friend_user_id: asUuid(id, 'friend_user_id'),
      p_before_created_at: before?.createdAt ?? null,
      p_before_message_id: before?.id ?? null,
      p_limit: Number(limit),
    })
    if (error) { const mapped = mapFriendChatRpcError(error); return json({ error: mapped.error }, mapped.status) }
    const page = parseFriendChatPage(data)
    if (!page) return json({ error: 'service_unavailable' }, 503)
    return json({
      friend: { user_id: page.friend.userId, display_name: page.friend.displayName, friend_recognition_name: page.friend.friendRecognitionName },
      messages: page.messages.map(row => ({ id: row.id, is_mine: row.isMine, body: row.body, created_at: row.createdAt })),
      next_cursor: page.nextCursor,
      my_last_read_message_id: page.myLastReadMessageId,
      peer_last_read_message_id: page.peerLastReadMessageId,
    })
  } catch (error) { return failure(error) }
}

export async function POST(request: Request, context: Context) {
  try {
    assertTrustedMutationOrigin(request)
    await requireRequestAccess(request, { allowedRoles: ['user'], checkMutationOrigin: false })
    const { id } = await context.params
    const input = parseFriendDirectChatInput(await readStrictJson(request, ['message', 'idempotency_key']))
    if (!input) return json({ error: 'invalid_message' }, 400)
    const supabase = createSupabaseRequestClient(request)
    const { data, error } = await supabase.rpc('send_my_friend_direct_message', {
      p_friend_user_id: asUuid(id, 'friend_user_id'), p_body: input.message, p_idempotency_key: input.idempotencyKey,
    })
    if (error) { const mapped = mapFriendChatRpcError(error); return json({ error: mapped.error }, mapped.status) }
    if (!isFriendDirectChatUserId(data)) return json({ error: 'service_unavailable' }, 503)
    return json({ message_id: data }, 201)
  } catch (error) { return failure(error) }
}
