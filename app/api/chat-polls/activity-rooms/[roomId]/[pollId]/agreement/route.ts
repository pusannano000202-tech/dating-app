import { isChatPollId, parseAgreementProposalInput, parseChatPollMutationEnvelope } from '@/lib/chat-polls/contract'
import { chatPollJson, chatPollMutation, withChatPollMutation } from '@/lib/chat-polls/server'

type Context = { params: Promise<{ roomId: string; pollId: string }> }

export async function POST(request: Request, context: Context) {
  const { roomId, pollId } = await context.params
  if (!isChatPollId(roomId) || !isChatPollId(pollId)) {
    return chatPollJson({ error: 'invalid_request' }, 400)
  }
  return withChatPollMutation(request, (mutation) => {
    const envelope = parseChatPollMutationEnvelope(mutation.body)
    const input = envelope && parseAgreementProposalInput(envelope.payload)
    if (!envelope || !input) return chatPollJson({ error: 'invalid_request' }, 400)
    return chatPollMutation(mutation, 'propose_activity_room_poll_agreement', {
      p_room_id: roomId,
      p_poll_id: pollId,
      p_selected_option_id: input.selectedOptionId,
      p_expected_revision: input.expectedRevision,
      p_idempotency_key: input.idempotencyKey,
      p_summary: input.summary,
    }, envelope.expectedViewerBinding)
  })
}
