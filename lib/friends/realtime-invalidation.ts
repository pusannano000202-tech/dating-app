const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type FriendConversationInvalidation = {
  friendship_user_id: string
  friendship_friend_user_id: string
  revision: number
  changed_at: string
}

export function isFriendConversationInvalidation(
  value: unknown,
  friendUserId?: string,
): value is FriendConversationInvalidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  if (!hasExactKeys(row, [
    'friendship_user_id',
    'friendship_friend_user_id',
    'revision',
    'changed_at',
  ])) return false
  if (!asUuid(row.friendship_user_id) || !asUuid(row.friendship_friend_user_id)) return false
  if (String(row.friendship_user_id).toLowerCase() >= String(row.friendship_friend_user_id).toLowerCase()) return false
  if (!Number.isSafeInteger(row.revision) || Number(row.revision) < 1) return false
  if (typeof row.changed_at !== 'string' || !Number.isFinite(Date.parse(row.changed_at))) return false
  if (friendUserId !== undefined) {
    const friend = asUuid(friendUserId)
    if (!friend || (friend !== String(row.friendship_user_id).toLowerCase()
      && friend !== String(row.friendship_friend_user_id).toLowerCase())) return false
  }
  return true
}

function asUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null
}

function hasExactKeys(row: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(row).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}
