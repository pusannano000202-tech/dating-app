import { RequestGuardError, requestGuardErrorResponse } from '@/lib/auth/server-guards'
import { TrustedOriginError } from '@/lib/auth/trusted-origin'
import { continuationJson } from '@/lib/matching/continuation-api'
import { TonightApiInputError, tonightInputErrorResponse } from '@/lib/server/tonight/api-contract'

export function continuationRouteErrorResponse(error: unknown) {
  if (error instanceof TrustedOriginError) {
    return continuationJson(
      { error: error.status === 503 ? 'service_unavailable' : 'forbidden' },
      error.status,
    )
  }
  if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
  if (error instanceof TonightApiInputError) return tonightInputErrorResponse(error)
  return continuationJson({ error: 'invalid_request' }, 400)
}
