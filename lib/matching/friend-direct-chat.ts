export interface FriendDirectChatMessage {
  id: string
  isMine: boolean
  body: string
  createdAt: string
}

export type FriendDirectChatAccess = 'active' | 'revoked'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isFriendDirectChatUserId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function parseFriendDirectChatInput(value: unknown): { message: string; idempotencyKey: string } | null {
  if (!isRecord(value) || Object.keys(value).length !== 2
      || typeof value.message !== 'string' || !isFriendDirectChatUserId(value.idempotency_key)) return null
  const message = value.message.replace(/\r\n?/g, '\n').trim()
  if (!message || [...message].length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message)) return null
  return { message, idempotencyKey: value.idempotency_key }
}

export function parseFriendDirectChatMessages(value: unknown): FriendDirectChatMessage[] | null {
  if (!Array.isArray(value) || value.length > 100) return null
  const ids = new Set<string>()
  const result: FriendDirectChatMessage[] = []
  for (const row of value) {
    if (!isRecord(row) || !isFriendDirectChatUserId(row.id) || ids.has(row.id)
        || typeof row.is_mine !== 'boolean' || typeof row.body !== 'string' || !row.body
        || [...row.body].length > 1000 || typeof row.created_at !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T/.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at))) return null
    ids.add(row.id)
    result.push({ id: row.id, isMine: row.is_mine, body: row.body, createdAt: row.created_at })
  }
  return result
}

export function revokeFriendDirectChatState(refreshSequence: number): {
  access: 'revoked'; draft: ''; messages: FriendDirectChatMessage[]; refreshSequence: number
} {
  return { access: 'revoked', draft: '', messages: [], refreshSequence: refreshSequence + 1 }
}

export function mapFriendChatRpcError(error: unknown): { status: number; error: string } {
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : ''
  if (message === 'not_authenticated') return { status: 401, error: 'unauthenticated' }
  if (message === 'active_friendship_required') return { status: 403, error: 'friendship_required' }
  if (message === 'idempotency_conflict') return { status: 409, error: 'retry_conflict' }
  if (message === 'friend_chat_rate_limited') return { status: 429, error: 'rate_limited' }
  if (message === 'friend_chat_capacity_reached') return { status: 409, error: 'capacity_reached' }
  if (/^invalid_(friend_user_id|idempotency_key|friend_chat_message)$/.test(message)) return { status: 400, error: 'invalid_message' }
  return { status: 503, error: 'service_unavailable' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
