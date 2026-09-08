import { createHash, randomBytes } from 'node:crypto'

import { privateJson } from './api-contract'

const RAW_TOKEN_PATTERN = /^[0-9a-f]{64}$/

export function createPartnerOnboardingToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('hex')
  return { rawToken, tokenHash: hashPartnerOnboardingToken(rawToken) }
}

export function normalizePartnerOnboardingToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const token = value.trim().toLowerCase()
  return RAW_TOKEN_PATTERN.test(token) ? token : null
}

export function hashPartnerOnboardingToken(value: string): string {
  const token = normalizePartnerOnboardingToken(value)
  if (!token) throw new Error('invalid_partner_invite_token')
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function partnerOnboardingRpcError(error: unknown): Response {
  const message = error && typeof error === 'object' && 'message' in error
    && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''
  if (/not_authenticated/.test(message)) return privateJson({ error: 'unauthenticated' }, 401)
  if (/super_admin_required|ordinary_user_role_required|recent.*auth/.test(message)) {
    return privateJson({ error: /recent.*auth/.test(message) ? 'reauthentication_required' : 'forbidden' }, 403)
  }
  if (/not_found|target_mismatch/.test(message)) return privateJson({ error: 'not_found' }, 404)
  if (/expired/.test(message)) return privateJson({ error: 'invite_expired' }, 410)
  if (/stale|revision/.test(message)) return privateJson({ error: 'stale_revision' }, 409)
  if (/already|duplicate|conflict|not_claimed/.test(message)) return privateJson({ error: 'invite_conflict' }, 409)
  if (/invalid|required/.test(message)) return privateJson({ error: 'invalid_request' }, 400)
  return privateJson({ error: 'service_unavailable' }, 503)
}
