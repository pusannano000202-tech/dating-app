import {
  isChatPollId,
  parseAgreementConfirmationInput,
  parseAgreementProposalInput,
  parseChatPollMutationEnvelope,
  parseCreateChatPollInput,
  parseExpectedRevision,
  parseVoteOptionIds,
  resolveChatPollRoomKind,
} from '@/lib/chat-polls/contract'
import { chatPollJson, chatPollMutation, chatPollRpc, withChatPollMutation } from '@/lib/chat-polls/server'

type Context = { params: Promise<{ roomKind: string; roomId: string; action?: string[] }> }

export async function GET(request: Request, context: Context) {
  const { roomKind, roomId, action = [] } = await context.params
  const kind = resolveChatPollRoomKind(roomKind)
  if (!kind || !isChatPollId(roomId) || action.length !== 0) {
    return chatPollJson({ error: 'invalid_request' }, 400)
  }
  return chatPollRpc(request, 'get_chat_room_polls', {
    p_room_kind: kind, p_room_ref_id: roomId,
  })
}

export async function POST(request: Request, context: Context) {
  const { roomKind, roomId, action = [] } = await context.params
  const kind = resolveChatPollRoomKind(roomKind)
  if (!kind || !isChatPollId(roomId)) return chatPollJson({ error: 'invalid_request' }, 400)
  return withChatPollMutation(request, (mutation) => {
    const envelope = parseChatPollMutationEnvelope(mutation.body)
    if (!envelope) return chatPollJson({ error: 'invalid_request' }, 400)
    const body = envelope.payload

    if (action.length === 0) {
      const input = parseCreateChatPollInput(body)
      if (!input) return chatPollJson({ error: 'invalid_request' }, 400)
      return chatPollMutation(mutation, 'create_chat_room_poll', {
        p_room_kind: kind, p_room_ref_id: roomId, p_purpose: input.purpose,
        p_title: input.title, p_selection_mode: input.selectionMode,
        p_options: input.options, p_idempotency_key: input.idempotencyKey,
      }, envelope.expectedViewerBinding, 201)
    }

    const pollId = action[0]
    if (!isChatPollId(pollId)) return chatPollJson({ error: 'invalid_request' }, 400)
    if (action.length === 2 && action[1] === 'vote') {
      const input = parseVoteOptionIds(body)
      if (!input) return chatPollJson({ error: 'invalid_request' }, 400)
      return chatPollMutation(mutation, 'vote_chat_room_poll', {
        p_room_kind: kind, p_room_ref_id: roomId, p_poll_id: pollId, p_option_ids: input.optionIds,
      }, envelope.expectedViewerBinding)
    }
    if (action.length === 2 && (action[1] === 'close' || action[1] === 'cancel')) {
      const expectedRevision = parseExpectedRevision(body)
      if (expectedRevision === null) return chatPollJson({ error: 'invalid_request' }, 400)
      const rpc = action[1] === 'close' ? 'close_chat_room_poll' : 'cancel_chat_room_poll'
      return chatPollMutation(mutation, rpc, {
        p_room_kind: kind, p_room_ref_id: roomId, p_poll_id: pollId,
        p_expected_revision: expectedRevision,
      }, envelope.expectedViewerBinding)
    }
    if (action.length === 2 && action[1] === 'agreement') {
      const input = parseAgreementProposalInput(body)
      if (!input) return chatPollJson({ error: 'invalid_request' }, 400)
      return chatPollMutation(mutation, 'propose_chat_room_poll_agreement', {
        p_room_kind: kind, p_room_ref_id: roomId, p_poll_id: pollId,
        p_selected_option_id: input.selectedOptionId, p_expected_revision: input.expectedRevision,
        p_idempotency_key: input.idempotencyKey, p_summary: input.summary,
      }, envelope.expectedViewerBinding)
    }
    if (action.length === 4 && action[1] === 'agreement' && action[3] === 'confirm') {
      const agreementId = action[2]
      const input = parseAgreementConfirmationInput(body)
      if (!isChatPollId(agreementId) || !input) return chatPollJson({ error: 'invalid_request' }, 400)
      return chatPollMutation(mutation, 'confirm_chat_room_poll_agreement', {
        p_room_kind: kind, p_room_ref_id: roomId, p_poll_id: pollId,
        p_agreement_id: agreementId, p_expected_version: input.expectedVersion,
      }, envelope.expectedViewerBinding)
    }
    return chatPollJson({ error: 'invalid_request' }, 400)
  })
}
