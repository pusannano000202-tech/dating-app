type SupabaseErrorLike = {
  code?: string | null
  message?: string | null
}

export type CommunityApiError = {
  error: string
  status: number
}

const SCHEMA_ERROR_CODES = new Set(['42P01', '42883', 'PGRST202', 'PGRST205'])

export function mapCommunityApiError(error: SupabaseErrorLike): CommunityApiError {
  const code = error.code ?? ''
  const message = error.message ?? ''

  if (SCHEMA_ERROR_CODES.has(code) || /activity_meetups|community_posts|community_post_comments|community_post_likes|community_action_rate_limits/i.test(message)) {
    return { error: 'community_schema_unavailable', status: 503 }
  }
  if (message === 'authentication_required' || code === '42501') {
    return { error: 'Unauthorized', status: 401 }
  }
  if (message === 'profile_required') {
    return { error: 'profile_required', status: 409 }
  }
  if (message === 'rate_limited') {
    return { error: 'rate_limited', status: 429 }
  }
  if (['meetup_full', 'meetup_closed', 'host_cannot_leave'].includes(message)) {
    return { error: message, status: 409 }
  }
  if (['verified_participation_required', 'review_already_exists'].includes(message)) {
    return { error: message, status: 409 }
  }
  if (['meetup_not_found', 'post_not_found', 'comment_not_found'].includes(message)) {
    return { error: message, status: 404 }
  }
  if (message.startsWith('invalid_') || message === 'schedule_too_soon' || code === '22023') {
    return { error: message || 'invalid_request', status: 400 }
  }

  return { error: 'community_request_failed', status: 500 }
}
