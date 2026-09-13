import test from 'node:test'
import assert from 'node:assert/strict'

import { mapChatPollRpcError } from '../../lib/chat-polls/errors'

test('poll RPC errors preserve actionable status without leaking database details', () => {
  assert.deepEqual(mapChatPollRpcError({ message: 'activity_poll_forbidden detail secret' }), { status: 403, code: 'activity_poll_forbidden' })
  assert.deepEqual(mapChatPollRpcError({ message: 'activity_poll_not_found' }), { status: 404, code: 'activity_poll_not_found' })
  assert.deepEqual(mapChatPollRpcError({ message: 'activity_poll_rate_limited' }), { status: 429, code: 'activity_poll_rate_limited' })
  assert.deepEqual(mapChatPollRpcError({ message: 'activity_poll_stale_revision' }), { status: 409, code: 'activity_poll_stale_revision' })
  assert.deepEqual(mapChatPollRpcError({ message: 'activity_poll_tied' }), { status: 409, code: 'activity_poll_tied' })
  assert.deepEqual(mapChatPollRpcError({ message: 'invalid_activity_poll_options' }), { status: 400, code: 'invalid_activity_poll_options' })
  assert.deepEqual(mapChatPollRpcError({ message: 'relation does not exist' }), { status: 503, code: 'community_schema_unavailable' })
  assert.deepEqual(mapChatPollRpcError({ message: 'postgres detail that must stay private' }), { status: 503, code: 'community_unavailable' })
})
