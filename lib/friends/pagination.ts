const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type FriendCursor = { createdAt: string; id: string }

export function encodeFriendCursor(cursor: FriendCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id]), 'utf8').toString('base64url')
}

export function parseFriendCursor(value: unknown): FriendCursor | null {
  if (typeof value !== 'string' || value.length < 8 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string'
        || !Number.isFinite(Date.parse(parsed[0])) || typeof parsed[1] !== 'string' || !UUID.test(parsed[1])) return null
    return { createdAt: parsed[0], id: parsed[1] }
  } catch { return null }
}
