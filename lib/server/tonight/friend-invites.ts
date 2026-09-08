import { createHash, randomBytes } from 'node:crypto'

import { privateJson } from './api-contract'

const RAW_TOKEN_PATTERN = /^[0-9a-f]{64}$/

export function createTonightFriendInviteToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('hex')
  return { rawToken, tokenHash: hashTonightFriendInviteToken(rawToken) }
}

export function normalizeTonightFriendInviteToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return RAW_TOKEN_PATTERN.test(normalized) ? normalized : null
}

export function hashTonightFriendInviteToken(rawToken: string): string {
  const normalized = normalizeTonightFriendInviteToken(rawToken)
  if (!normalized) throw new Error('invalid_friend_invite_token')
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

export function tonightFriendInviteRpcErrorResponse(error: unknown): Response {
  const message = error && typeof error === 'object' && 'message' in error
    && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''

  if (/not_authenticated/.test(message)) return privateJson({ error: 'unauthenticated' }, 401)
  if (/access_role_required|market_membership_required/.test(message)) return privateJson({ error: 'forbidden' }, 403)
  if (/invite_not_found|target_mismatch/.test(message)) return privateJson({ error: 'not_found' }, 404)
  if (/invite_expired/.test(message)) return privateJson({ error: 'friend_invite_expired' }, 410)
  if (/profile_not_ready/.test(message)) return privateJson({ error: 'profile_not_ready' }, 409)
  if (/applications_closed/.test(message)) return privateJson({ error: 'applications_closed' }, 409)
  if (/self|blocked|duplicate|limit|full|already_|unavailable|idempotency_conflict/.test(message)) {
    return privateJson({ error: 'friend_invite_conflict' }, 409)
  }
  if (/invalid_|_required/.test(message)) return privateJson({ error: 'invalid_request' }, 400)
  return privateJson({ error: 'service_unavailable' }, 503)
}

