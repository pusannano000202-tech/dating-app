import { createHash, createHmac, randomBytes } from 'node:crypto'

const TOKEN = /^[0-9a-f]{64}$/i

export function normalizeFriendInviteToken(value: unknown): string | null {
  return typeof value === 'string' && TOKEN.test(value) ? value.toLowerCase() : null
}

export function hashFriendInviteToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function createFriendInviteToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('hex')
  return { rawToken, tokenHash: hashFriendInviteToken(rawToken) }
}

export function createRetrySafeFriendInviteToken(idempotencyKey: string, secret: string): { rawToken: string; tokenHash: string } {
  if (secret.length < 32) throw new Error('friend_invite_secret_unavailable')
  const rawToken = createHmac('sha256', secret).update(`friend-invite:${idempotencyKey}`, 'utf8').digest('hex')
  return { rawToken, tokenHash: hashFriendInviteToken(rawToken) }
}
