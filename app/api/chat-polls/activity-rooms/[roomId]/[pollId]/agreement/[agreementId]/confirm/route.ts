import { isChatPollId, parseAgreementConfirmationInput, parseChatPollMutationEnvelope } from '@/lib/chat-polls/contract'
import { chatPollJson, chatPollMutation, withChatPollMutation } from '@/lib/chat-polls/server'

type Context = { params: Promise<{ roomId: string; pollId: string; agreementId: string }> }

export async function POST(request: Request, context: Context) {
  const { roomId, pollId, agreementId } = await context.params
  if (!isChatPollId(roomId) || !isChatPollId(pollId) || !isChatPollId(agreementId)) {
    return chatPollJson({ error: 'invalid_request' }, 400)
  }
  return withChatPollMutation(request, (mutation) => {
    const envelope = parseChatPollMutationEnvelope(mutation.body)
    const input = envelope && parseAgreementConfirmationInput(envelope.payload)
    if (!envelope || !input) return chatPollJson({ error: 'invalid_request' }, 400)
    return chatPollMutation(mutation, 'confirm_activity_room_poll_agreement', {
      p_room_id: roomId,
      p_poll_id: pollId,
      p_agreement_id: agreementId,
      p_expected_version: input.expectedVersion,
    }, envelope.expectedViewerBinding)
  })
}
