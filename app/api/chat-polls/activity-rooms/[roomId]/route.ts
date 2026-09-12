import {
  isChatPollId,
  parseChatPollMutationEnvelope,
  parseCreateChatPollInput,
} from '@/lib/chat-polls/contract'
import { chatPollJson, chatPollMutation, chatPollRpc, withChatPollMutation } from '@/lib/chat-polls/server'

type Context = { params: Promise<{ roomId: string }> }

export async function GET(request: Request, context: Context) {
  const { roomId } = await context.params
  if (!isChatPollId(roomId)) return chatPollJson({ error: 'invalid_request' }, 400)
  return chatPollRpc(request, 'get_activity_room_polls', { p_room_id: roomId })
}

export async function POST(request: Request, context: Context) {
  const { roomId } = await context.params
  if (!isChatPollId(roomId)) return chatPollJson({ error: 'invalid_request' }, 400)
  return withChatPollMutation(request, (mutation) => {
    const envelope = parseChatPollMutationEnvelope(mutation.body)
    const input = envelope && parseCreateChatPollInput(envelope.payload)
    if (!envelope || !input) return chatPollJson({ error: 'invalid_request' }, 400)
    return chatPollMutation(mutation, 'create_activity_room_poll', {
      p_room_id: roomId,
      p_purpose: input.purpose,
      p_title: input.title,
      p_selection_mode: input.selectionMode,
      p_options: input.options,
      p_idempotency_key: input.idempotencyKey,
    }, envelope.expectedViewerBinding, 201)
  })
}
