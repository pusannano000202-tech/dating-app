import { parseAccessContextRpcPayload, type AccessContextRpcClient } from './access-context'

export function hasConflictingApiActors(cookieUserId: string | null, bearerUserId: string | null): boolean {
  // Legacy cookie routes and request-aware bearer routes must never act as
  // different users for the same HTTP request (including an invalid bearer).
  return cookieUserId !== null && cookieUserId !== bearerUserId
}

/** Only recovery/status and legal routes remain reachable during deletion. */
export function requiresAccountAccessCheck(pathname: string, isReauthentication: boolean): boolean {
  if (pathname === '/login' && isReauthentication) return false
  return ![
    '/account', '/account/delete', '/api/account/deletion', '/terms', '/privacy',
    '/auth/callback', '/auth/unavailable', '/auth/service-unavailable',
    '/api/auth/phone/start', '/api/auth/phone/verify',
  ].includes(pathname)
}

export async function checkAccountAccess(
  client: AccessContextRpcClient,
): Promise<'allowed' | 'deletion_pending' | 'unavailable'> {
  try {
    const result = await client.rpc('get_access_context')
    if (result.error) {
      const error = result.error
      return typeof error === 'object' && error !== null
        && 'message' in error && error.message === 'account_deletion_pending'
        ? 'deletion_pending' : 'unavailable'
    }
    parseAccessContextRpcPayload(result.data)
    return 'allowed'
  } catch {
    return 'unavailable'
  }
}
