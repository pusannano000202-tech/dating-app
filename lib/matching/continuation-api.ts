export type ContinuationPublicError =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'stale_state'
  | 'not_ready'
  | 'invalid_request'
  | 'service_unavailable'

function errorMessage(error: unknown) {
  if (!error || typeof error !== 'object' || !('message' in error)) return ''
  return typeof error.message === 'string' ? error.message.toLowerCase() : ''
}

export function mapContinuationRpcError(error: unknown): {
  status: 400 | 401 | 403 | 404 | 409 | 503
  error: ContinuationPublicError
} {
  const message = errorMessage(error)
  if (message.includes('dating_participation_unavailable')) return { status: 409, error: 'not_ready' }
  if (/not_authenticated|unauthenticated/.test(message)) return { status: 401, error: 'unauthenticated' }
  if (/attendee_required|service_role_required|forbidden/.test(message)) return { status: 403, error: 'forbidden' }
  if (/_not_found|not found/.test(message)) return { status: 404, error: 'not_found' }
  if (/stale_/.test(message)) return { status: 409, error: 'stale_state' }
  if (/provider_verification_failed|invalid_|payment_context_mismatch|idempotency_key_reused/.test(message)) {
    return { status: 400, error: 'invalid_request' }
  }
  if (/not_ready|not_completed|not_supported|not_preparable|not_writable|not_allowed|unknown|mismatch|conflict|locked|closed|cutoff|minimum|recovery|replayed|required|disabled/.test(message)) {
    return { status: 409, error: 'not_ready' }
  }
  return { status: 503, error: 'service_unavailable' }
}

export function continuationJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export function continuationRpcErrorResponse(error: unknown) {
  const mapped = mapContinuationRpcError(error)
  return continuationJson({ error: mapped.error }, mapped.status)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
