import { createHmac, timingSafeEqual } from 'node:crypto'

const ALIAS_TICKET_TTL_SECONDS = 10 * 60
const ALIAS_OPTION_COUNT = 3

const ADJECTIVES = [
  '기분좋은', '느긋한', '다정한', '맑은', '반짝이는', '부드러운',
  '산뜻한', '수줍은', '신나는', '여유로운', '용기있는', '차분한',
] as const

const NOUNS = [
  '강아지', '고래', '구름', '달빛', '라벤더', '모래성',
  '바람', '병아리', '봄날', '살구', '새벽', '수달',
  '오렌지', '은하수', '파도', '해바라기',
] as const

type AliasTicketPayload = {
  version: 1
  userId: string
  options: string[]
  issuedAt: number
  expiresAt: number
}

export function generateAliasOptions(random: () => number = Math.random): string[] {
  const options = new Set<string>()
  let cursor = 0
  while (options.size < ALIAS_OPTION_COUNT && cursor < ADJECTIVES.length * NOUNS.length) {
    const sample = normalizeRandom(random())
    const adjective = ADJECTIVES[(Math.floor(sample * ADJECTIVES.length) + cursor) % ADJECTIVES.length]
    const noun = NOUNS[(Math.floor(sample * NOUNS.length * 7) + cursor * 5) % NOUNS.length]
    options.add(`${adjective}${noun}`)
    cursor += 1
  }
  return [...options]
}

export function issueAliasTicket({
  userId,
  options,
  now = new Date(),
  secret,
}: {
  userId: string
  options: string[]
  now?: Date
  secret: string
}): string {
  if (!isUuid(userId) || !isValidSecret(secret) || !Number.isFinite(now.getTime())) {
    throw new Error('alias_ticket_config_invalid')
  }
  const safeOptions = normalizeOptions(options)
  if (safeOptions.length !== ALIAS_OPTION_COUNT) throw new Error('alias_options_invalid')

  const issuedAt = Math.floor(now.getTime() / 1000)
  const payload: AliasTicketPayload = {
    version: 1,
    userId,
    options: safeOptions,
    issuedAt,
    expiresAt: issuedAt + ALIAS_TICKET_TTL_SECONDS,
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${encoded}.${sign(encoded, secret)}`
}

export function verifyAliasTicket({
  ticket,
  selectedAlias,
  userId,
  now = new Date(),
  secret,
}: {
  ticket: string
  selectedAlias: string
  userId: string
  now?: Date
  secret: string
}): { ok: true; displayName: string } | { ok: false; error: 'alias_ticket_invalid' } {
  if (!isUuid(userId) || !isValidSecret(secret) || !Number.isFinite(now.getTime())) return invalidTicket()
  const parts = ticket.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return invalidTicket()

  const expected = sign(parts[0], secret)
  if (!safeEqual(expected, parts[1])) return invalidTicket()

  let payload: AliasTicketPayload
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as AliasTicketPayload
  } catch {
    return invalidTicket()
  }
  const options = normalizeOptions(payload.options)
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const selected = selectedAlias.trim()
  if (
    payload.version !== 1
    || payload.userId !== userId
    || !Number.isInteger(payload.issuedAt)
    || !Number.isInteger(payload.expiresAt)
    || payload.expiresAt !== payload.issuedAt + ALIAS_TICKET_TTL_SECONDS
    || nowSeconds < payload.issuedAt
    || nowSeconds > payload.expiresAt
    || options.length !== ALIAS_OPTION_COUNT
    || !options.includes(selected)
  ) return invalidTicket()

  return { ok: true, displayName: selected }
}

export function getAliasSigningSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidate = env.PROFILE_ALIAS_SIGNING_SECRET
    ?? env.SUPABASE_SECRET_KEY
    ?? env.SUPABASE_SERVICE_ROLE_KEY
  return candidate && isValidSecret(candidate) ? candidate : null
}

function normalizeOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const options = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
  if (
    options.length !== ALIAS_OPTION_COUNT
    || new Set(options).size !== options.length
    || options.some((item) => item.length < 2 || item.length > 20)
  ) return []
  return options
}

function normalizeRandom(value: number): number {
  if (!Number.isFinite(value)) return 0
  const fraction = value - Math.floor(value)
  return fraction < 0 ? fraction + 1 : fraction
}

function sign(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(`quantum-profile-alias:v1:${encoded}`).digest('base64url')
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function isValidSecret(value: string): boolean {
  return value.length >= 24 && !/\s/.test(value)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function invalidTicket(): { ok: false; error: 'alias_ticket_invalid' } {
  return { ok: false, error: 'alias_ticket_invalid' }
}
