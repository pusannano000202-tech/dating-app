import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { requiresAccountAccessCheck, checkAccountAccess, hasConflictingApiActors } from '../../lib/auth/account-access'

test('a retained cookie route cannot substitute another actor behind bearer authentication', () => {
  assert.equal(hasConflictingApiActors('pending-cookie', 'active-bearer'), true)
  assert.equal(hasConflictingApiActors('pending-cookie', null), true)
  assert.equal(hasConflictingApiActors('same-user', 'same-user'), false)
  assert.equal(hasConflictingApiActors(null, 'mobile-user'), false)
  assert.equal(hasConflictingApiActors(null, null), false)
})

test('pending-account exceptions are exact status, legal and reauthentication routes', () => {
  for (const path of ['/account', '/account/delete', '/api/account/deletion', '/terms', '/privacy', '/auth/callback', '/api/auth/phone/start', '/api/auth/phone/verify']) {
    assert.equal(requiresAccountAccessCheck(path, false), false, path)
  }
  assert.equal(requiresAccountAccessCheck('/login', true), false)
  for (const path of ['/login', '/auth/continue', '/community', '/api/mbti/stats', '/api/account/deletion/export', '/account-other', '/friends', '/match']) {
    assert.equal(requiresAccountAccessCheck(path, false), true, path)
  }
})

test('live access distinguishes a pending account and fails closed on malformed or unavailable RPC', async () => {
  const run = (data: unknown, error: unknown) => checkAccountAccess({ rpc: async () => ({ data, error }) })
  assert.equal(await run([{ access_role: 'user', partner_venue_ids: [] }], null), 'allowed')
  assert.equal(await run(null, { message: 'account_deletion_pending', code: '42501' }), 'deletion_pending')
  assert.equal(await run(null, { message: 'other error' }), 'unavailable')
  assert.equal(await run([], null), 'unavailable')
  assert.equal(await run([{ access_role: 'super_admin', partner_venue_ids: [], unexpected: true }], null), 'unavailable')
  assert.equal(await checkAccountAccess({ rpc: async () => { throw new Error('network') } }), 'unavailable')
})

test('middleware checks the API bearer actor and blocks pending reads before route execution', () => {
  const source = readFileSync('middleware.ts', 'utf8')
  assert.match(source, /pathname\.startsWith\('\/api\/'\) && request\.headers\.has\('authorization'\)/)
  assert.match(source, /createSupabaseRequestClient\(request\)/)
  assert.match(source, /hasConflictingApiActors\(cookieAuth\.data\.user\?\.id \?\? null, user\?\.id \?\? null\)/)
  assert.match(source, /await checkAccountAccess\(supabase\)/)
  assert.match(source, /code: 'account_deletion_pending'/)
  assert.match(source, /new URL\('\/account', appOrigin\)/)
})
