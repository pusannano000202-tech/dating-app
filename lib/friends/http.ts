import { RequestGuardError, requestGuardErrorResponse } from '../auth/server-guards'
import { TrustedOriginError } from '../auth/trusted-origin'
import { TonightApiInputError } from '../server/tonight/api-contract'

export function friendPrivateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
  })
}

export function friendApiFailure(error: unknown): Response {
  if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
  if (error instanceof TrustedOriginError) return friendPrivateJson({ error: 'forbidden' }, error.status)
  if (error instanceof TonightApiInputError) return friendPrivateJson({ error: 'invalid_request' }, 400)
  return friendPrivateJson({ error: 'service_unavailable' }, 503)
}

export function firstRpcRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : null
}

export function rpcMessage(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : ''
}

export function inviteRpcFailure(error: unknown): Response {
  const message = rpcMessage(error)
  if (/not_authenticated/.test(message)) return friendPrivateJson({ error: 'unauthenticated' }, 401)
  if (/invite_not_found/.test(message)) return friendPrivateJson({ error: 'invite_not_found' }, 404)
  if (/invite_(expired|cancelled|declined|already_claimed)/.test(message)) return friendPrivateJson({ error: message.match(/invite_(expired|cancelled|declined|already_claimed)/)?.[0] }, 409)
  if (/blocked_pair|cannot_invite_self/.test(message)) return friendPrivateJson({ error: message.match(/blocked_pair|cannot_invite_self/)?.[0] }, 403)
  if (/idempotency_conflict/.test(message)) return friendPrivateJson({ error: 'idempotency_conflict' }, 409)
  if (/friend_name_required/.test(message)) return friendPrivateJson({ error: 'friend_name_required' }, 409)
  if (/rate_limited/.test(message)) return friendPrivateJson({ error: 'rate_limited' }, 429)
  return friendPrivateJson({ error: 'service_unavailable' }, 503)
}
