import { assertTrustedMutationOrigin, TrustedOriginError } from '../auth/trusted-origin'

/** Run before constructing any session/service client on deposit mutations. */
export function guardDepositMutation(request: Request, requireJson = true): Response | null {
  try {
    assertTrustedMutationOrigin(request)
  } catch (error) {
    return Response.json({ error: 'deposit_request_not_allowed' }, {
      status: error instanceof TrustedOriginError ? error.status : 503,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
  if (requireJson && request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return Response.json({ error: 'json_content_required' }, {
      status: 415, headers: { 'Cache-Control': 'private, no-store' },
    })
  }
  return null
}
