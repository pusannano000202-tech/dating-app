import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AccessContextUnavailableError,
  getLiveAccessContext,
  parseAccessContextRpcPayload,
} from '../../lib/auth/access-context'

const VENUE_ONE = '10000000-0000-4000-8000-000000000001'
const VENUE_TWO = '10000000-0000-4000-8000-000000000002'

test('access context accepts exactly one strict database row', () => {
  assert.deepEqual(
    parseAccessContextRpcPayload([
      { access_role: 'partner', partner_venue_ids: [VENUE_ONE, VENUE_TWO] },
    ]),
    { accessRole: 'partner', partnerVenueIds: [VENUE_ONE, VENUE_TWO] },
  )
})

test('access context rejects malformed, duplicate, unknown and over-broad payloads', () => {
  const invalidPayloads: unknown[] = [
    null,
    [],
    [{ access_role: 'admin', partner_venue_ids: [] }, { access_role: 'user', partner_venue_ids: [] }],
    [{ access_role: 'owner', partner_venue_ids: [] }],
    [{ access_role: 'partner', partner_venue_ids: ['not-a-uuid'] }],
    [{ access_role: 'partner', partner_venue_ids: [VENUE_ONE, VENUE_ONE] }],
    [{ access_role: 'user', partner_venue_ids: [], user_phone: '010-0000-0000' }],
  ]

  for (const payload of invalidPayloads) {
    assert.throws(() => parseAccessContextRpcPayload(payload), AccessContextUnavailableError)
  }
})

test('getLiveAccessContext performs a fresh routing RPC and fails closed on dependency errors', async () => {
  let calls = 0
  const client = {
    async rpc(name: string) {
      calls += 1
      assert.equal(name, 'get_server_access_context')
      return {
        data: [{ access_role: 'super_admin', partner_venue_ids: [] }],
        error: null,
      }
    },
  }

  assert.equal((await getLiveAccessContext(client)).accessRole, 'super_admin')
  assert.equal((await getLiveAccessContext(client)).accessRole, 'super_admin')
  assert.equal(calls, 2, 'access context must not be process-cached')

  await assert.rejects(
    () => getLiveAccessContext({ async rpc() { return { data: null, error: new Error('db unavailable') } } }),
    AccessContextUnavailableError,
  )
})

test('live access context falls back only when the routing RPC is absent on an older database', async () => {
  const calls: string[] = []
  const client = {
    async rpc(name: string) {
      calls.push(name)
      if (name === 'get_server_access_context') {
        return {
          data: null,
          error: {
            code: 'PGRST202',
            message: 'Could not find the function public.get_server_access_context without parameters',
          },
        }
      }
      return { data: [{ access_role: 'partner', partner_venue_ids: [VENUE_ONE] }], error: null }
    },
  }

  assert.deepEqual(await getLiveAccessContext(client), {
    accessRole: 'partner',
    partnerVenueIds: [VENUE_ONE],
  })
  assert.deepEqual(calls, ['get_server_access_context', 'get_access_context'])

  const postgresCalls: string[] = []
  const postgresClient = {
    async rpc(name: string) {
      postgresCalls.push(name)
      return name === 'get_server_access_context'
        ? {
            data: null,
            error: { code: '42883', message: 'function public.get_server_access_context() does not exist' },
          }
        : { data: [{ access_role: 'user', partner_venue_ids: [] }], error: null }
    },
  }
  assert.equal((await getLiveAccessContext(postgresClient)).accessRole, 'user')
  assert.deepEqual(postgresCalls, ['get_server_access_context', 'get_access_context'])
})

test('live access context never downgrades network or permission errors into the legacy fallback', async () => {
  for (const error of [
    { code: '42501', message: 'permission denied' },
    { code: 'PGRST301', message: 'JWT expired' },
    { code: '42883', message: 'function public.some_other_function() does not exist' },
    new Error('network unavailable'),
  ]) {
    const calls: string[] = []
    const client = {
      async rpc(name: string) {
        calls.push(name)
        return { data: null, error }
      },
    }
    await assert.rejects(() => getLiveAccessContext(client), AccessContextUnavailableError)
    assert.deepEqual(calls, ['get_server_access_context'])
  }
})
