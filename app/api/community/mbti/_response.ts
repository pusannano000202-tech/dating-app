import { MbtiInputError } from '@/lib/community/mbti/input'
import { MbtiRepositoryError } from '@/lib/community/mbti/repository'

export function mbtiPrivateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export function mbtiPublicJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export function mbtiErrorResponse(error: unknown): Response {
  if (error instanceof MbtiInputError) {
    return mbtiPrivateJson({
      error: 'invalid_request',
      code: error.code,
      ...(error.field ? { field: error.field } : {}),
    }, 400)
  }
  if (error instanceof MbtiRepositoryError) {
    const status = error.code === 'unauthenticated'
      ? 401
      : error.code === 'forbidden'
        ? 403
        : error.code === 'not_found'
          ? 404
          : error.code === 'stale_revision' || error.code === 'idempotency_conflict' || error.code === 'idempotency_result_unavailable'
            ? 409
            : error.code === 'invalid_request'
              ? 400
              : 503
    return mbtiPrivateJson({ error: error.code }, status)
  }
  return mbtiPrivateJson({ error: 'service_unavailable' }, 503)
}
