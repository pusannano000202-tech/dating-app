import { TonightApiInputError } from './api-contract'

type UnknownRecord = Record<string, unknown>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function roundKey(value: UnknownRecord): { startsAt: string; id: string } | null {
  const startsAt = typeof value.starts_at === 'string' ? value.starts_at : ''
  const id = typeof value.id === 'string' ? value.id.toLowerCase() : ''
  if (!UUID_PATTERN.test(id) || !Number.isFinite(Date.parse(startsAt))) return null
  return { startsAt: new Date(startsAt).toISOString(), id }
}

export type TonightRoundCursor = Readonly<{
  startsAt: string
  id: string
}>

export function encodeTonightRoundCursor(cursor: TonightRoundCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, s: cursor.startsAt, i: cursor.id }), 'utf8')
    .toString('base64url')
}

export function decodeTonightRoundCursor(value: string | null | undefined): TonightRoundCursor | null {
  if (value === null || value === undefined || value === '') return null
  try {
    if (value.length > 256 || !CURSOR_PATTERN.test(value)) throw new Error('invalid_cursor')
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as UnknownRecord
    if (parsed.v !== 1) throw new Error('invalid_cursor')
    const key = roundKey({ starts_at: parsed.s, id: parsed.i })
    if (!key) throw new Error('invalid_cursor')
    return key
  } catch {
    throw new TonightApiInputError('invalid_field', 'cursor')
  }
}

export function normalizeTonightRoundPage(rowsValue: unknown, limit = 50): {
  rounds: UnknownRecord[]
  nextCursor: string | null
} {
  const boundedLimit = Math.min(Math.max(Number.isSafeInteger(limit) ? limit : 50, 1), 50)
  const rows = Array.isArray(rowsValue)
    ? rowsValue.map(asRecord).filter((row) => roundKey(row) !== null)
    : []
  const rounds = rows.slice(0, boundedLimit)
  const nextKey = rows.length > boundedLimit ? roundKey(rounds.at(-1) ?? {}) : null
  return {
    rounds,
    nextCursor: nextKey ? encodeTonightRoundCursor(nextKey) : null,
  }
}
