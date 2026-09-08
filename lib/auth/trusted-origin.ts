import { getBearerAccessToken } from './api-request-auth'
import { parseStrictAppOrigin } from './strict-app-origin'

export type RequestAuthMode = 'cookie' | 'bearer'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export class TrustedOriginError extends Error {
  readonly status: 401 | 403 | 503

  constructor(status: 401 | 403 | 503) {
    super(status === 503 ? 'Request security configuration is unavailable' : 'Request is not allowed')
    this.name = 'TrustedOriginError'
    this.status = status
  }
}

export function resolveRequestAuthMode(authorization: string | null): RequestAuthMode {
  if (authorization === null) return 'cookie'
  if (authorization.includes(',') || !getBearerAccessToken(authorization)) {
    throw new TrustedOriginError(401)
  }
  return 'bearer'
}

export function resolveExpectedAppOrigin(configuredOrigin: string | undefined): string {
  const url = parseStrictAppOrigin(configuredOrigin)
  if (!url) throw new TrustedOriginError(503)
  return url.origin
}

/**
 * Browser cookie mutations require exact Origin equality. Native Bearer
 * requests may omit Origin; if they send it, it must still match exactly.
 * Host and X-Forwarded-* are deliberately never consulted.
 */
export function assertTrustedMutationOrigin(
  request: Request,
  configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN,
): RequestAuthMode {
  const authMode = resolveRequestAuthMode(request.headers.get('authorization'))
  if (SAFE_METHODS.has(request.method.toUpperCase())) return authMode

  const expectedOrigin = resolveExpectedAppOrigin(configuredOrigin)
  const requestOrigin = request.headers.get('origin')

  if (authMode === 'cookie' && requestOrigin !== expectedOrigin) {
    throw new TrustedOriginError(403)
  }
  if (authMode === 'bearer' && requestOrigin !== null && requestOrigin !== expectedOrigin) {
    throw new TrustedOriginError(403)
  }

  return authMode
}
