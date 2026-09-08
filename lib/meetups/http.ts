import { TonightApiInputError } from '../server/tonight/api-contract'
import { TrustedOriginError } from '../auth/trusted-origin'

export function meetupJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export function meetupInputErrorResponse(error: unknown): Response {
  if (error instanceof TrustedOriginError) return meetupJson({ error: 'request_not_allowed' }, error.status)
  if (error instanceof TonightApiInputError) {
    return meetupJson({ error: 'invalid_request', code: error.code, ...(error.field ? { field: error.field } : {}) }, 400)
  }
  return meetupJson({ error: 'invalid_request' }, 400)
}

export function meetupRpcErrorResponse(error: unknown): Response {
  const message = rpcMessage(error)
  if (/not_authenticated|unauthorized/.test(message)) return meetupJson({ error: 'Unauthorized' }, 401)
  if (/(_not_found|not found)/.test(message)) return meetupJson({ error: normalized(message, 'not_found') }, 404)
  if (/wrong_school|department_restricted|membership_required|host_required|captain_required|forbidden/.test(message)) {
    return meetupJson({ error: normalized(message, 'forbidden') }, 403)
  }
  if (/profile_required|department_identity_required/.test(message)) {
    return meetupJson({ error: normalized(message, 'profile_required') }, 409)
  }
  if (/stale_revision|idempotency_key_reused|_closed|_full|_conflict|already_|result_mismatch|schedule_mismatch|not_available|not_active|not_pending|not_started|cannot_leave|identity_changed/.test(message)) {
    return meetupJson({ error: normalized(message, 'conflict') }, 409)
  }
  if (/community_schema_unavailable|does not exist|schema cache|undefined_(?:table|function)|42p01|42883/.test(message)) {
    return meetupJson({ error: 'community_schema_unavailable' }, 503)
  }
  if (/invalid_|_required|too_(?:soon|late|long|large)/.test(message)) {
    return meetupJson({ error: normalized(message, 'invalid_request') }, 400)
  }
  return meetupJson({ error: 'community_request_failed' }, 500)
}

function rpcMessage(error: unknown) {
  if (!error || typeof error !== 'object' || !('message' in error) || typeof error.message !== 'string') return ''
  return error.message.toLowerCase()
}

function normalized(message: string, fallback: string) {
  const value = message.match(/[a-z][a-z0-9_]{2,80}/)?.[0]
  return value ?? fallback
}
