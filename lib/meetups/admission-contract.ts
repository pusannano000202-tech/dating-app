/** Application and provider payment are separate facts; neither implies the other. */
export const ADMISSION_ROOM_KINDS = ['custom_meetup', 'study', 'mentoring', 'department_league'] as const
export type AdmissionRoomTarget = { kind: typeof ADMISSION_ROOM_KINDS[number]; id: string }
export type AdmissionState = 'draft' | 'submitted' | 'accepted' | 'declined' | 'withdrawn' | 'expired'
export type AdmissionPaymentState = 'unconfigured' | 'unpaid' | 'pending' | 'held' | 'refund_pending' | 'refunded' | 'failed' | 'reconciliation_required'
export type AdmissionPaymentMethod = 'new' | 'carryover'
export type AdmissionDepositQuote = {
  id: string
  room: AdmissionRoomTarget
  amountKrw: number
  currency: 'KRW'
  policyVersion: string
  expiresAt: string
  paymentMethods: AdmissionPaymentMethod[]
}
export type AdmissionApplicationInput = {
  intro: string
  strength?: string
  paymentMethod: AdmissionPaymentMethod
  consent: true
  policyVersion: string
  quoteId: string
  idempotencyKey: string
}
export type AdmissionValidationResult =
  | { ok: true; value: AdmissionApplicationInput }
  | { ok: false; error: string; field?: string }
export type AdmissionValidationContext = {
  room: AdmissionRoomTarget
  /** Load from the authenticated user's server context, never from the request body. */
  quote: AdmissionDepositQuote | null
  nowMs: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INPUT_KEYS = ['intro', 'strength', 'paymentMethod', 'consent', 'policyVersion', 'quoteId', 'idempotencyKey']
const QUOTE_KEYS = ['id', 'room', 'amountKrw', 'currency', 'policyVersion', 'expiresAt', 'paymentMethods']
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key))
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
const policyVersion = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 80 && value === value.trim()
const method = (value: unknown): value is AdmissionPaymentMethod => value === 'new' || value === 'carryover'
const hiddenText = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/
const safeText = (value: string, multiline = false) => !hiddenText.test(multiline ? value.replace(/\n/g, '') : value)

function timestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40) return false
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/)
  if (!parts || !Number.isFinite(Date.parse(value))) return false
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    && hour < 24 && minute < 60 && second < 60
}

export function parseAdmissionRoomTarget(value: unknown): AdmissionRoomTarget | null {
  const input = record(value)
  if (!input || !onlyKeys(input, ['kind', 'id']) || !uuid(input.id)
    || !ADMISSION_ROOM_KINDS.includes(input.kind as AdmissionRoomTarget['kind'])) return null
  return { kind: input.kind as AdmissionRoomTarget['kind'], id: input.id.toLowerCase() }
}

/** Structural validation only. This does not make a browser-supplied quote authoritative. */
export function parseAdmissionDepositQuote(value: unknown): AdmissionDepositQuote | null {
  const input = record(value)
  if (!input || !onlyKeys(input, QUOTE_KEYS) || !uuid(input.id) || input.currency !== 'KRW'
    || !Number.isSafeInteger(input.amountKrw) || Number(input.amountKrw) <= 0
    || !policyVersion(input.policyVersion) || !timestamp(input.expiresAt)
    || !Array.isArray(input.paymentMethods) || input.paymentMethods.length < 1 || input.paymentMethods.length > 2
    || !input.paymentMethods.every(method) || new Set(input.paymentMethods).size !== input.paymentMethods.length) return null
  const room = parseAdmissionRoomTarget(input.room)
  if (!room) return null
  return { id: input.id.toLowerCase(), room, amountKrw: input.amountKrw as number, currency: 'KRW',
    policyVersion: input.policyVersion, expiresAt: input.expiresAt, paymentMethods: [...input.paymentMethods] }
}

export function parseAdmissionApplicationInput(value: unknown): AdmissionValidationResult {
  const input = record(value)
  if (!input) return { ok: false, error: 'invalid_input' }
  const unknown = Object.keys(input).find(key => !INPUT_KEYS.includes(key))
  if (unknown) return { ok: false, error: 'unknown_field', field: unknown }
  if (typeof input.intro !== 'string' || !input.intro.trim()) return { ok: false, error: 'intro_required', field: 'intro' }
  if (Array.from(input.intro).length > 80) return { ok: false, error: 'intro_too_long', field: 'intro' }
  if (!safeText(input.intro)) return { ok: false, error: 'invalid_intro', field: 'intro' }
  if (input.strength !== undefined && (typeof input.strength !== 'string' || Array.from(input.strength).length > 120 || !safeText(input.strength, true))) return { ok: false, error: 'invalid_strength', field: 'strength' }
  if (!method(input.paymentMethod)) return { ok: false, error: 'invalid_payment_method', field: 'paymentMethod' }
  if (input.consent !== true) return { ok: false, error: 'deposit_consent_required', field: 'consent' }
  if (!policyVersion(input.policyVersion)) return { ok: false, error: 'invalid_policy_version', field: 'policyVersion' }
  if (!uuid(input.quoteId)) return { ok: false, error: 'invalid_quote_id', field: 'quoteId' }
  if (!uuid(input.idempotencyKey)) return { ok: false, error: 'invalid_idempotency_key', field: 'idempotencyKey' }
  return { ok: true, value: {
    intro: input.intro.trim(), ...(typeof input.strength === 'string' ? { strength: input.strength.trim() } : {}),
    paymentMethod: input.paymentMethod, consent: true, policyVersion: input.policyVersion,
    quoteId: input.quoteId.toLowerCase(), idempotencyKey: input.idempotencyKey.toLowerCase(),
  } }
}

/**
 * Validate against a quote loaded for the authenticated account and target room.
 * Success means valid input only: no application, payment, reservation, or refund
 * was persisted. The server must recheck policy, capacity and ownership atomically.
 */
export function validateAdmissionApplication(value: unknown, context: AdmissionValidationContext): AdmissionValidationResult {
  const parsed = parseAdmissionApplicationInput(value)
  if (!parsed.ok) return parsed
  const room = parseAdmissionRoomTarget(context.room)
  if (!room) return { ok: false, error: 'invalid_room' }
  if (context.quote === null) return { ok: false, error: 'deposit_policy_unavailable' }
  const quote = parseAdmissionDepositQuote(context.quote)
  if (!quote) return { ok: false, error: 'deposit_quote_invalid' }
  if (room.kind !== quote.room.kind || room.id !== quote.room.id || parsed.value.quoteId !== quote.id) return { ok: false, error: 'deposit_quote_mismatch' }
  if (parsed.value.policyVersion !== quote.policyVersion) return { ok: false, error: 'deposit_policy_changed' }
  if (!Number.isSafeInteger(context.nowMs) || context.nowMs < 0) return { ok: false, error: 'invalid_server_time' }
  if (Date.parse(quote.expiresAt) <= context.nowMs) return { ok: false, error: 'deposit_quote_expired' }
  if (!quote.paymentMethods.includes(parsed.value.paymentMethod)) return { ok: false, error: 'deposit_payment_method_unavailable' }
  return parsed
}
