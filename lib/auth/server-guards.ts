import { createSupabaseRequestClient } from '../supabase-request'
import { getPublicAppOrigin, isSupabaseConfigured } from '../utils'
import {
  AccessContextUnavailableError,
  getLiveAccessContext,
  type AccessContext,
  type AccessRole,
} from './access-context'
import {
  TrustedOriginError,
  assertTrustedMutationOrigin,
  resolveRequestAuthMode,
  type RequestAuthMode,
} from './trusted-origin'

export interface AccessGuardUser {
  id: string
}

export interface AccessGuardClient {
  auth: {
    getUser(): PromiseLike<{
      data: { user: AccessGuardUser | null }
      error: unknown
    }>
  }
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>
}

export interface RequestGuardOptions {
  allowedRoles?: readonly AccessRole[]
  partnerVenueId?: string
  checkMutationOrigin?: boolean
  requireRecentAuth?: boolean
}

export interface RequestGuardDependencies {
  isConfigured: () => boolean
  appOrigin?: string
  createClient: (request: Request) => AccessGuardClient
}

export interface GuardedAccess {
  userId: string
  access: AccessContext
  authMode: RequestAuthMode
}

type GuardStatus = 401 | 403 | 404 | 503

export class RequestGuardError extends Error {
  readonly status: GuardStatus
  readonly code: 'unauthenticated' | 'forbidden' | 'mfa_required' | 'reauthentication_required' | 'not_found' | 'service_unavailable'

  constructor(status: GuardStatus, explicitCode?: 'mfa_required' | 'reauthentication_required') {
    const code = explicitCode ?? (status === 401
      ? 'unauthenticated'
      : status === 403
        ? 'forbidden'
        : status === 404
          ? 'not_found'
          : 'service_unavailable')
    super(code)
    this.name = 'RequestGuardError'
    this.status = status
    this.code = code
  }
}

const DEFAULT_DEPENDENCIES: RequestGuardDependencies = {
  isConfigured: isSupabaseConfigured,
  appOrigin: getPublicAppOrigin(),
  createClient: (request) => createSupabaseRequestClient(request) as unknown as AccessGuardClient,
}

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object' || !('message' in error)) return ''
  return typeof error.message === 'string' ? error.message.toLowerCase() : ''
}

async function requireRecentAuthentication(client: AccessGuardClient): Promise<void> {
  let result: { data: unknown; error: unknown }
  try {
    result = await client.rpc('verify_recent_super_admin_session')
  } catch {
    throw new RequestGuardError(503)
  }

  if (result.error) {
    if (/reauthentication_required|super_admin_required/.test(getErrorMessage(result.error))) {
      throw new RequestGuardError(403, 'reauthentication_required')
    }
    throw new RequestGuardError(503)
  }
  if (result.data !== true) throw new RequestGuardError(403, 'reauthentication_required')
}

async function requireAdminMfa(client: AccessGuardClient): Promise<void> {
  let result: { data: unknown; error: unknown }
  try {
    result = await client.rpc('verify_admin_aal2_session')
  } catch {
    throw new RequestGuardError(503)
  }

  if (result.error) {
    if (/mfa_required/.test(getErrorMessage(result.error))) {
      throw new RequestGuardError(403, 'mfa_required')
    }
    throw new RequestGuardError(503)
  }
  if (result.data !== true) throw new RequestGuardError(403, 'mfa_required')
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null
  return typeof error.status === 'number' ? error.status : null
}

async function authenticateClient(client: AccessGuardClient): Promise<AccessGuardUser> {
  let result: Awaited<ReturnType<AccessGuardClient['auth']['getUser']>>
  try {
    result = await client.auth.getUser()
  } catch {
    throw new RequestGuardError(503)
  }

  if (!result.data.user) {
    const status = getErrorStatus(result.error)
    const isCredentialFailure = !result.error || status === 400 || status === 401 || status === 403
    throw new RequestGuardError(isCredentialFailure ? 401 : 503)
  }
  if (result.error) throw new RequestGuardError(503)

  return result.data.user
}

async function requireLivePartnerVenue(
  client: AccessGuardClient,
  access: AccessContext,
  venueId: string,
): Promise<void> {
  if (!access.partnerVenueIds.includes(venueId)) {
    throw new RequestGuardError(404)
  }

  let result: { data: unknown; error: unknown }
  try {
    result = await client.rpc('is_venue_partner', { p_venue_id: venueId })
  } catch {
    throw new RequestGuardError(503)
  }
  if (result.error) throw new RequestGuardError(503)
  if (result.data !== true) throw new RequestGuardError(404)
}

export async function requireServerAccess(
  client: AccessGuardClient,
  options: RequestGuardOptions = {},
): Promise<Omit<GuardedAccess, 'authMode'>> {
  const user = await authenticateClient(client)

  let access: AccessContext
  try {
    access = await getLiveAccessContext(client)
  } catch (error) {
    if (error instanceof AccessContextUnavailableError) throw new RequestGuardError(503)
    throw error
  }

  if (options.allowedRoles && !options.allowedRoles.includes(access.accessRole)) {
    throw new RequestGuardError(403)
  }

  const isAdminAccess = access.accessRole === 'admin' || access.accessRole === 'super_admin'
  const isPrivilegedRoute = options.allowedRoles?.some(
    (role) => role === 'admin' || role === 'super_admin',
  ) ?? false
  if (isAdminAccess && isPrivilegedRoute) {
    await requireAdminMfa(client)
  }

  if (options.requireRecentAuth) {
    await requireRecentAuthentication(client)
  }

  if (options.partnerVenueId) {
    if (access.accessRole !== 'partner') throw new RequestGuardError(403)
    await requireLivePartnerVenue(client, access, options.partnerVenueId)
  }

  return { userId: user.id, access }
}

export async function requireRequestAccess(
  request: Request,
  options: RequestGuardOptions = {},
  dependencies: RequestGuardDependencies = DEFAULT_DEPENDENCIES,
): Promise<GuardedAccess> {
  let authMode: RequestAuthMode
  try {
    authMode = resolveRequestAuthMode(request.headers.get('authorization'))
  } catch (error) {
    if (error instanceof TrustedOriginError) throw new RequestGuardError(error.status)
    throw error
  }

  if (!dependencies.isConfigured()) throw new RequestGuardError(503)

  if (options.checkMutationOrigin !== false) {
    try {
      assertTrustedMutationOrigin(request, dependencies.appOrigin)
    } catch (error) {
      if (error instanceof TrustedOriginError) throw new RequestGuardError(error.status)
      throw error
    }
  }

  let client: AccessGuardClient
  try {
    client = dependencies.createClient(request)
  } catch {
    throw new RequestGuardError(503)
  }

  const guarded = await requireServerAccess(client, options)
  return { ...guarded, authMode }
}

export function requestGuardErrorResponse(error: unknown): Response {
  const guarded = error instanceof RequestGuardError ? error : new RequestGuardError(503)
  return Response.json(
    { error: guarded.code },
    {
      status: guarded.status,
      headers: { 'Cache-Control': 'private, no-store' },
    },
  )
}
