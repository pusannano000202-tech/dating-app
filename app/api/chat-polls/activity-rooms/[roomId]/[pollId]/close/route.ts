import { isChatPollId, parseChatPollMutationEnvelope, parseExpectedRevision } from '@/lib/chat-polls/contract'
import { chatPollJson, chatPollMutation, withChatPollMutation } from '@/lib/chat-polls/server'

type Context = { params: Promise<{ roomId: string; pollId: string }> }

export async function POST(request: Request, context: Context) {
  const { roomId, pollId } = await context.params
  if (!isChatPollId(roomId) || !isChatPollId(pollId)) {
    return chatPollJson({ error: 'invalid_request' }, 400)
  }
  return withChatPollMutation(request, (mutation) => {
    const envelope = parseChatPollMutationEnvelope(mutation.body)
    const expectedRevision = envelope ? parseExpectedRevision(envelope.payload) : null
    if (!envelope || expectedRevision === null) return chatPollJson({ error: 'invalid_request' }, 400)
    return chatPollMutation(mutation, 'close_activity_room_poll', {
      p_room_id: roomId, p_poll_id: pollId, p_expected_revision: expectedRevision,
    }, envelope.expectedViewerBinding)
  })
}
