export type ChatPollPublicError =
  | 'activity_poll_forbidden'
  | 'activity_poll_not_found'
  | 'activity_poll_agreement_not_found'
  | 'activity_poll_creator_required'
  | 'activity_poll_not_open'
  | 'activity_poll_not_closed'
  | 'activity_poll_stale_revision'
  | 'activity_poll_stale_version'
  | 'activity_poll_tied'
  | 'activity_poll_no_response'
  | 'activity_poll_winning_option_required'
  | 'activity_poll_agreement_membership_changed'
  | 'activity_poll_membership_changed'
  | 'activity_poll_single_choice_required'
  | 'activity_poll_idempotency_key_reused'
  | 'activity_poll_rate_limited'
  | 'invalid_activity_poll_purpose'
  | 'invalid_activity_poll_selection_mode'
  | 'invalid_activity_poll_title'
  | 'invalid_activity_poll_options'
  | 'invalid_activity_poll_agreement'
  | 'invalid_request'
  | 'community_schema_unavailable'
  | 'community_unavailable'

type ChatPollStatus = 400 | 403 | 404 | 409 | 429 | 503

function errorMessage(error: unknown): string {
  if (!error || typeof error !== 'object' || !('message' in error)) return ''
  return typeof error.message === 'string' ? error.message.toLowerCase() : ''
}

export function mapChatPollRpcError(error: unknown): { status: ChatPollStatus; code: ChatPollPublicError } {
  const message = errorMessage(error)
  if (/does not exist|schema cache|undefined_(?:table|function)|42p01|42883/.test(message)) {
    return { status: 503, code: 'community_schema_unavailable' }
  }
  const code = message.match(/(?:invalid_)?activity_poll_[a-z_]+/)?.[0] as ChatPollPublicError | undefined
  if (!code) return { status: 503, code: 'community_unavailable' }
  if (code === 'activity_poll_rate_limited') return { status: 429, code }
  if (/forbidden|creator_required/.test(code)) return { status: 403, code }
  if (/not_found/.test(code)) return { status: 404, code }
  if (/stale_|not_open|not_closed|tied|no_response|winning_option_required|membership_changed|idempotency_key_reused/.test(code)) {
    return { status: 409, code }
  }
  if (/^invalid_|single_choice_required/.test(code)) return { status: 400, code }
  return { status: 503, code: 'community_unavailable' }
}
