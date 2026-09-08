import { RequestGuardError } from '@/lib/auth/server-guards'
import { TrustedOriginError } from '@/lib/auth/trusted-origin'

export function accountPrivateJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie, Authorization',
    },
  })
}

export function accountApiFailure(error: unknown) {
  if (error instanceof RequestGuardError) return accountPrivateJson({ error: error.code }, error.status)
  if (error instanceof TrustedOriginError) {
    const code = error.status === 503 ? 'service_unavailable' : 'forbidden'
    return accountPrivateJson({ error: code }, error.status)
  }
  return accountPrivateJson({ error: 'service_unavailable' }, 503)
}
