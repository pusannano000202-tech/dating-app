import assert from 'node:assert/strict'
import test from 'node:test'

import { meetupRpcErrorResponse } from '../../lib/meetups/http'

test('meetup RPC mapper exposes retryable state conflicts instead of generic 500', async () => {
  for (const message of [
    'opponent_not_available',
    'roster_not_pending',
    'challenge_result_not_available',
    'captain_cannot_leave',
    'department_identity_changed',
  ]) {
    const response = meetupRpcErrorResponse({ message })
    assert.equal(response.status, 409, message)
    assert.deepEqual(await response.json(), { error: message })
  }
})

test('meetup RPC mapper keeps current department readiness explicit', async () => {
  const response = meetupRpcErrorResponse({ message: 'department_identity_required' })
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'department_identity_required' })
})
