import test from 'node:test'
import assert from 'node:assert/strict'

import {
  RequestGuardError,
  requireRequestAccess,
  type AccessGuardClient,
  type RequestGuardDependencies,
} from '../../lib/auth/server-guards'

const APP_ORIGIN = 'http://localhost:3004'
const USER_ID = '20000000-0000-4000-8000-000000000001'
const VENUE_ID = '30000000-0000-4000-8000-000000000001'

function clientFor(
  accessRole: 'user' | 'partner' | 'admin' | 'super_admin' = 'user',
  partnerVenueIds: string[] = [],
  isPartner = true,
  hasRecentSession = true,
  hasAdminMfa = true,
): AccessGuardClient {
  return {
    auth: {
      async getUser() {
        return { data: { user: { id: USER_ID } }, error: null }
      },
    },
    async rpc(name: string) {
      if (name === 'get_server_access_context') {
        return { data: [{ access_role: accessRole, partner_venue_ids: partnerVenueIds }], error: null }
      }
      if (name === 'is_venue_partner') {
        return { data: isPartner, error: null }
      }
      if (name === 'verify_recent_super_admin_session') {
        return { data: hasRecentSession, error: null }
      }
      if (name === 'verify_admin_aal2_session') {
        return { data: hasAdminMfa, error: null }
      }
      throw new Error(`unexpected RPC: ${name}`)
    },
  }
}

function dependencies(
  client: AccessGuardClient,
  configured = true,
): RequestGuardDependencies {
  return {
    isConfigured: () => configured,
    appOrigin: APP_ORIGIN,
    createClient: () => client,
  }
}

async function rejectsStatus(action: () => Promise<unknown>, status: number) {
  await assert.rejects(action, (error: unknown) => error instanceof RequestGuardError && error.status === status)
}

test('request guard authenticates Cookie and exact single Bearer sessions', async () => {
  const cookieRequest = new Request(`${APP_ORIGIN}/api/access/context`, {
    headers: { cookie: 'sb-session=fake' },
  })
  const bearerRequest = new Request(`${APP_ORIGIN}/api/access/context`, {
    headers: { authorization: 'Bearer mobile-token' },
  })

  assert.equal((await requireRequestAccess(cookieRequest, {}, dependencies(clientFor()))).authMode, 'cookie')
  assert.equal((await requireRequestAccess(bearerRequest, {}, dependencies(clientFor()))).authMode, 'bearer')
})

test('malformed or ambiguous Authorization is 401 and never falls back to Cookie', async () => {
  for (const authorization of [
    'Basic value',
    'Bearer ',
    'Bearer first second',
    'Bearer first, Bearer second',
    'Bearer first,Bearer-second',
  ]) {
    await rejectsStatus(
      () => requireRequestAccess(
        new Request(`${APP_ORIGIN}/api/access/context`, {
          headers: { authorization, cookie: 'sb-session=fake' },
        }),
        {},
        dependencies(clientFor()),
      ),
      401,
    )
  }
})

test('request guard distinguishes unauthenticated, role, cross-venue and dependency failures', async () => {
  const unauthenticated = clientFor()
  unauthenticated.auth.getUser = async () => ({ data: { user: null }, error: { status: 401 } })
  await rejectsStatus(
    () => requireRequestAccess(new Request(`${APP_ORIGIN}/api/x`), {}, dependencies(unauthenticated)),
    401,
  )

  await rejectsStatus(
    () => requireRequestAccess(
      new Request(`${APP_ORIGIN}/api/x`),
      { allowedRoles: ['admin'] },
      dependencies(clientFor('user')),
    ),
    403,
  )

  await rejectsStatus(
    () => requireRequestAccess(
      new Request(`${APP_ORIGIN}/api/x`),
      { allowedRoles: ['partner'], partnerVenueId: VENUE_ID },
      dependencies(clientFor('partner', [])),
    ),
    404,
  )

  await rejectsStatus(
    () => requireRequestAccess(new Request(`${APP_ORIGIN}/api/x`), {}, dependencies(clientFor(), false)),
    503,
  )

  const authDependencyFailure = clientFor()
  authDependencyFailure.auth.getUser = async () => ({
    data: { user: null },
    error: new Error('auth service unavailable'),
  })
  await rejectsStatus(
    () => requireRequestAccess(new Request(`${APP_ORIGIN}/api/x`), {}, dependencies(authDependencyFailure)),
    503,
  )

  const brokenContext = clientFor()
  brokenContext.rpc = async () => ({ data: null, error: new Error('db unavailable') })
  await rejectsStatus(
    () => requireRequestAccess(new Request(`${APP_ORIGIN}/api/x`), {}, dependencies(brokenContext)),
    503,
  )
})

test('partner venue guard rechecks live membership for the requested venue', async () => {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = []
  const client = clientFor('partner', [VENUE_ID])
  const rpc = client.rpc.bind(client)
  client.rpc = async (name, args) => {
    calls.push({ name, args })
    return rpc(name, args)
  }

  const result = await requireRequestAccess(
    new Request(`${APP_ORIGIN}/api/partner/venues/${VENUE_ID}`),
    { allowedRoles: ['partner'], partnerVenueId: VENUE_ID },
    dependencies(client),
  )
  assert.equal(result.userId, USER_ID)
  assert.deepEqual(calls.at(-1), { name: 'is_venue_partner', args: { p_venue_id: VENUE_ID } })

  await rejectsStatus(
    () => requireRequestAccess(
      new Request(`${APP_ORIGIN}/api/partner/venues/${VENUE_ID}`),
      { allowedRoles: ['partner'], partnerVenueId: VENUE_ID },
      dependencies(clientFor('partner', [VENUE_ID], false)),
    ),
    404,
  )
})

test('cookie mutation guard enforces configured Origin while Bearer native requests may omit it', async () => {
  await rejectsStatus(
    () => requireRequestAccess(
      new Request(`${APP_ORIGIN}/api/x`, { method: 'POST', headers: { cookie: 'sb=fake' } }),
      {},
      dependencies(clientFor()),
    ),
    403,
  )
  assert.equal(
    (await requireRequestAccess(
      new Request(`${APP_ORIGIN}/api/x`, { method: 'POST', headers: { authorization: 'Bearer mobile-token' } }),
      {},
      dependencies(clientFor()),
    )).authMode,
    'bearer',
  )
})

test('sensitive super-admin access requires a recent database-verified current session', async () => {
  const request = new Request(`${APP_ORIGIN}/api/admin/super-admin/tonight/profile`, {
    headers: { cookie: 'sb-session=fake' },
  })

  const recent = await requireRequestAccess(
    request,
    { allowedRoles: ['super_admin'], requireRecentAuth: true },
    dependencies(clientFor('super_admin', [], true, true)),
  )
  assert.equal(recent.userId, USER_ID)

  await assert.rejects(
    () => requireRequestAccess(
      request,
      { allowedRoles: ['super_admin'], requireRecentAuth: true },
      dependencies(clientFor('super_admin', [], true, false)),
    ),
    (error: unknown) => error instanceof RequestGuardError
      && error.status === 403
      && error.code === 'reauthentication_required',
  )

  const unavailable = clientFor('super_admin')
  const rpc = unavailable.rpc.bind(unavailable)
  unavailable.rpc = async (name, args) => name === 'verify_recent_super_admin_session'
    ? { data: null, error: new Error('database unavailable') }
    : rpc(name, args)
  await rejectsStatus(
    () => requireRequestAccess(
      request,
      { allowedRoles: ['super_admin'], requireRecentAuth: true },
      dependencies(unavailable),
    ),
    503,
  )
})

test('admin and super-admin routes require database-verified AAL2 before privileged access', async () => {
  const request = new Request(`${APP_ORIGIN}/api/admin/tonight/summary`, {
    headers: { cookie: 'sb-session=fake' },
  })

  for (const accessRole of ['admin', 'super_admin'] as const) {
    const guarded = await requireRequestAccess(
      request,
      { allowedRoles: ['admin', 'super_admin'] },
      dependencies(clientFor(accessRole, [], true, true, true)),
    )
    assert.equal(guarded.access.accessRole, accessRole)

    await assert.rejects(
      () => requireRequestAccess(
        request,
        { allowedRoles: ['admin', 'super_admin'] },
        dependencies(clientFor(accessRole, [], true, true, false)),
      ),
      (error: unknown) => error instanceof RequestGuardError
        && error.status === 403
        && (error as { code: string }).code === 'mfa_required',
    )
  }
})

test('admin MFA verification fails closed while partner access remains unchanged', async () => {
  const unavailable = clientFor('admin')
  const rpc = unavailable.rpc.bind(unavailable)
  unavailable.rpc = async (name, args) => name === 'verify_admin_aal2_session'
    ? { data: null, error: new Error('database unavailable') }
    : rpc(name, args)

  await rejectsStatus(
    () => requireRequestAccess(
      new Request(`${APP_ORIGIN}/api/admin/tonight/summary`),
      { allowedRoles: ['admin', 'super_admin'] },
      dependencies(unavailable),
    ),
    503,
  )

  const partner = await requireRequestAccess(
    new Request(`${APP_ORIGIN}/api/partner/venues/${VENUE_ID}`),
    { allowedRoles: ['partner'], partnerVenueId: VENUE_ID },
    dependencies(clientFor('partner', [VENUE_ID])),
  )
  assert.equal(partner.access.accessRole, 'partner')

  await rejectsStatus(
    () => requireRequestAccess(
      new Request(`${APP_ORIGIN}/api/admin/tonight/summary`),
      { allowedRoles: ['admin', 'super_admin'] },
      dependencies(clientFor('user')),
    ),
    403,
  )
})
