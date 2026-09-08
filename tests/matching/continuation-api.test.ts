import test from 'node:test'
import assert from 'node:assert/strict'

import { mapContinuationRpcError } from '../../lib/matching/continuation-api'

test('continuation API maps privacy, stale state, and infrastructure failures without leaking DB text', () => {
  assert.deepEqual(mapContinuationRpcError({ message: 'source_attendee_required' }), { status: 403, error: 'forbidden' })
  assert.deepEqual(mapContinuationRpcError({ message: 'stale_roster_revision' }), { status: 409, error: 'stale_state' })
  assert.deepEqual(mapContinuationRpcError({ message: 'actual_attendance_unknown' }), { status: 409, error: 'not_ready' })
  assert.deepEqual(mapContinuationRpcError({ message: 'provider_verification_failed' }), { status: 400, error: 'invalid_request' })
  assert.deepEqual(mapContinuationRpcError({ message: 'connection terminated' }), { status: 503, error: 'service_unavailable' })
})
