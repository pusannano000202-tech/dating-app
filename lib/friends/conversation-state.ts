const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISO = /^\d{4}-\d{2}-\d{2}T/

export interface FriendIdentity {
  userId: string
  displayName: string
  friendRecognitionName: string | null
  photoUrl?: string | null
}

export interface ConversationMessage {
  id: string
  isMine: boolean
  body: string
  createdAt: string
}

export interface FriendConversation {
  friend: FriendIdentity
  lastMessage: ConversationMessage | null
  unreadCount: number
  myLastReadMessageId: string | null
  peerLastReadMessageId: string | null
}

export interface ConversationList {
  conversations: FriendConversation[]
  nextCursor: string | null
}

export interface FriendChatPage {
  friend: FriendIdentity
  messages: ConversationMessage[]
  nextCursor: string | null
  myLastReadMessageId: string | null
  peerLastReadMessageId: string | null
}

export function parseConversationList(value: unknown): ConversationList | null {
  if (!exactRecord(value, ['conversations', 'next_cursor']) || !Array.isArray(value.conversations)
      || value.conversations.length > 100 || !cursor(value.next_cursor)) return null
  const conversations: FriendConversation[] = []
  for (const row of value.conversations) {
    if (!exactRecord(row, ['friend', 'last_message', 'unread_count', 'my_last_read_message_id', 'peer_last_read_message_id'])
        || !Number.isSafeInteger(row.unread_count) || (row.unread_count as number) < 0
        || (row.unread_count as number) > 1_000_000) return null
    const friend = parseIdentity(row.friend, true)
    const lastMessage = row.last_message == null ? null : parseMessage(row.last_message)
    if (!friend || (row.last_message != null && !lastMessage)
        || !nullableUuid(row.my_last_read_message_id) || !nullableUuid(row.peer_last_read_message_id)) return null
    conversations.push({
      friend,
      lastMessage,
      unreadCount: row.unread_count as number,
      myLastReadMessageId: row.my_last_read_message_id as string | null,
      peerLastReadMessageId: row.peer_last_read_message_id as string | null,
    })
  }
  return { conversations, nextCursor: value.next_cursor as string | null }
}

export function parseFriendChatPage(value: unknown): FriendChatPage | null {
  if (!exactRecord(value, ['friend', 'messages', 'next_cursor', 'my_last_read_message_id', 'peer_last_read_message_id'])
      || !Array.isArray(value.messages) || value.messages.length > 100 || !cursor(value.next_cursor)
      || !nullableUuid(value.my_last_read_message_id) || !nullableUuid(value.peer_last_read_message_id)) return null
  const friend = parseIdentity(value.friend, false)
  const messages = value.messages.map(parseMessage)
  if (!friend || messages.some((message) => !message)) return null
  return {
    friend,
    messages: messages as ConversationMessage[],
    nextCursor: value.next_cursor as string | null,
    myLastReadMessageId: value.my_last_read_message_id as string | null,
    peerLastReadMessageId: value.peer_last_read_message_id as string | null,
  }
}

export function mergeMessages<T extends { id: string; createdAt: string }>(current: T[], incoming: T[]): T[] {
  const rows = new Map<string, T>()
  for (const row of [...current, ...incoming]) rows.set(row.id, row)
  return [...rows.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

function parseIdentity(value: unknown, photo: boolean): FriendIdentity | null {
  const keys = photo
    ? ['user_id', 'display_name', 'friend_recognition_name', 'photo_url']
    : ['user_id', 'display_name', 'friend_recognition_name']
  if (!exactRecord(value, keys) || !UUID.test(String(value.user_id))
      || !boundedText(value.display_name, 2, 40)
      || !(value.friend_recognition_name == null || boundedText(value.friend_recognition_name, 2, 40))
      || (photo && !(value.photo_url == null || boundedText(value.photo_url, 1, 2048)))) return null
  return {
    userId: value.user_id as string,
    displayName: value.display_name as string,
    friendRecognitionName: value.friend_recognition_name as string | null,
    ...(photo ? { photoUrl: value.photo_url as string | null } : {}),
  }
}

function parseMessage(value: unknown): ConversationMessage | null {
  if (!exactRecord(value, ['id', 'is_mine', 'body', 'created_at']) || !UUID.test(String(value.id))
      || typeof value.is_mine !== 'boolean' || !boundedText(value.body, 1, 1000)
      || typeof value.created_at !== 'string' || !ISO.test(value.created_at)
      || !Number.isFinite(Date.parse(value.created_at))) return null
  return { id: value.id as string, isMine: value.is_mine, body: value.body as string, createdAt: value.created_at }
}

function exactRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}
function nullableUuid(value: unknown) { return value == null || (typeof value === 'string' && UUID.test(value)) }
function cursor(value: unknown) { return value == null || (typeof value === 'string' && value.length > 0 && value.length <= 512) }
function boundedText(value: unknown, min: number, max: number) { return typeof value === 'string' && [...value].length >= min && [...value].length <= max }
