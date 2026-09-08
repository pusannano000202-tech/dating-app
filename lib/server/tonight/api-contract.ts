export type TonightPublicErrorCode =
  | 'invalid_request'
  | 'unauthenticated'
  | 'reauthentication_required'
  | 'forbidden'
  | 'not_found'
  | 'stale_revision'
  | 'applications_closed'
  | 'conflict'
  | 'service_unavailable'

export class TonightApiInputError extends Error {
  readonly code: 'invalid_body' | 'unexpected_field' | 'invalid_field'
  readonly field: string | null

  constructor(
    code: 'invalid_body' | 'unexpected_field' | 'invalid_field',
    field: string | null = null,
  ) {
    super(code)
    this.name = 'TonightApiInputError'
    this.code = code
    this.field = field
  }
}

export function validateStrictRecord(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TonightApiInputError('invalid_body')
  }

  const record = value as Record<string, unknown>
  const allowed = new Set(allowedKeys)
  const unexpected = Object.keys(record).find((key) => !allowed.has(key))
  if (unexpected) throw new TonightApiInputError('unexpected_field', unexpected)
  return record
}

export async function readStrictJson(
  request: Request,
  allowedKeys: readonly string[],
): Promise<Record<string, unknown>> {
  let value: unknown
  try {
    value = await request.json()
  } catch {
    throw new TonightApiInputError('invalid_body')
  }
  return validateStrictRecord(value, allowedKeys)
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/

export function asUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new TonightApiInputError('invalid_field', field)
  }
  return value.toLowerCase()
}

export function asOptionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null
  return asUuid(value, field)
}

export function asInteger(
  value: unknown,
  field: string,
  bounds: { min: number; max: number },
): number {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < bounds.min
    || value > bounds.max
  ) {
    throw new TonightApiInputError('invalid_field', field)
  }
  return value
}

export function asNumber(
  value: unknown,
  field: string,
  bounds: { min: number; max: number },
): number {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < bounds.min
    || value > bounds.max
  ) {
    throw new TonightApiInputError('invalid_field', field)
  }
  return value
}

export function asOptionalString(
  value: unknown,
  field: string,
  options: { minLength?: number; maxLength: number; pattern?: RegExp },
): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new TonightApiInputError('invalid_field', field)
  const normalized = value.trim()
  const minLength = options.minLength ?? 1
  if (
    normalized.length < minLength
    || normalized.length > options.maxLength
    || (options.pattern && !options.pattern.test(normalized))
  ) {
    throw new TonightApiInputError('invalid_field', field)
  }
  return normalized
}

export function asRequiredString(
  value: unknown,
  field: string,
  options: { minLength?: number; maxLength: number; pattern?: RegExp },
): string {
  const result = asOptionalString(value, field, options)
  if (result === null) throw new TonightApiInputError('invalid_field', field)
  return result
}

export function asIdempotencyKey(value: unknown): string {
  return asRequiredString(value, 'idempotency_key', {
    minLength: 8,
    maxLength: 128,
    pattern: IDEMPOTENCY_PATTERN,
  })
}

export function asIsoTimestamp(value: unknown, field: string): string {
  const text = asRequiredString(value, field, { maxLength: 64 })
  const timestamp = Date.parse(text)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)
    || !Number.isFinite(timestamp)
  ) {
    throw new TonightApiInputError('invalid_field', field)
  }
  return new Date(timestamp).toISOString()
}

function rpcMessage(error: unknown): string {
  if (!error || typeof error !== 'object' || !('message' in error)) return ''
  return typeof error.message === 'string' ? error.message.toLowerCase() : ''
}

export function mapTonightRpcError(error: unknown): {
  status: 400 | 401 | 403 | 404 | 409 | 503
  code: TonightPublicErrorCode
} {
  const message = rpcMessage(error)
  if (/not_authenticated|unauthenticated/.test(message)) return { status: 401, code: 'unauthenticated' }
  if (/reauthentication_required/.test(message)) {
    return { status: 403, code: 'reauthentication_required' }
  }
  if (/super_admin_required|admin_required|partner_required|membership_required|owner_mismatch/.test(message)) {
    return { status: 403, code: 'forbidden' }
  }
  if (/_not_found|not found/.test(message)) return { status: 404, code: 'not_found' }
  if (/venue_partner_obligation_state_unavailable/.test(message)) {
    return { status: 503, code: 'service_unavailable' }
  }
  if (/stale_revision/.test(message)) return { status: 409, code: 'stale_revision' }
  if (/tonight_applications_closed/.test(message)) {
    return { status: 409, code: 'applications_closed' }
  }
  if (
    /conflict|locked|closed|exhausted|unavailable|already_|cannot_change_own_admin_role|last_super_admin_required|forfeit_policy_not_approved|time_gate|gate_(?:closed|not_due|not_satisfied)|not_(?:accepting_capacity|allocatable|dead_lettered|eligible|enabled|expirable|held|in_round|payable|preparable|prepared|ready_for_partner_acceptance|refundable|retryable|revealed|serviceable)|below_reserved|bundle_split|last_active_has_live_obligations|snapshot_mismatch|service_date_mismatch|swap_size_mismatch/.test(message)
  ) {
    return { status: 409, code: 'conflict' }
  }
  if (/invalid_|duplicate_|_required|too_large|too_long/.test(message)) {
    return { status: 400, code: 'invalid_request' }
  }
  return { status: 503, code: 'service_unavailable' }
}

export function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export function privateRedirect(location: string, status: 302 | 303 = 303): Response {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Location: location,
    },
  })
}

export function tonightInputErrorResponse(error: unknown): Response {
  if (!(error instanceof TonightApiInputError)) return privateJson({ error: 'invalid_request' }, 400)
  return privateJson({
    error: 'invalid_request',
    code: error.code,
    ...(error.field ? { field: error.field } : {}),
  }, 400)
}

export function tonightRpcErrorResponse(error: unknown): Response {
  const mapped = mapTonightRpcError(error)
  return privateJson({ error: mapped.code }, mapped.status)
}
