import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchRequiredMatchingResource } from '../../lib/matching/fetch-required-resource'

function response(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  }
}

test('required matching reads retry one transient server failure', async () => {
  const statuses = [500, 200]
  let calls = 0
  const result = await fetchRequiredMatchingResource(
    '/api/groups',
    async () => response(statuses[calls++] ?? 500),
    async () => {},
  )

  assert.equal(result.status, 200)
  assert.equal(calls, 2)
})

test('required matching reads do not retry authentication or request failures', async () => {
  let calls = 0
  const result = await fetchRequiredMatchingResource(
    '/api/groups',
    async () => { calls += 1; return response(401) },
    async () => {},
  )

  assert.equal(result.status, 401)
  assert.equal(calls, 1)
})

test('required matching reads fail closed after one retry', async () => {
  let calls = 0
  const result = await fetchRequiredMatchingResource(
    '/api/groups',
    async () => { calls += 1; return response(503) },
    async () => {},
  )

  assert.equal(result.status, 503)
  assert.equal(calls, 2)
})
