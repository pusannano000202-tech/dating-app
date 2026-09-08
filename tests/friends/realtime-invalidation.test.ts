import assert from 'node:assert/strict'
import test from 'node:test'

import { isFriendConversationInvalidation } from '../../lib/friends/realtime-invalidation'

const LOW = '11111111-1111-4111-8111-111111111111'
const HIGH = '22222222-2222-4222-8222-222222222222'

test('realtime invalidation accepts only the minimal pair revision projection', () => {
  const event = {
    friendship_user_id: LOW,
    friendship_friend_user_id: HIGH,
    revision: 7,
    changed_at: '2026-09-07T01:02:03.000Z',
  }
  assert.equal(isFriendConversationInvalidation(event), true)
  assert.equal(isFriendConversationInvalidation(event, HIGH), true)
  assert.equal(isFriendConversationInvalidation(event, '33333333-3333-4333-8333-333333333333'), false)
})

test('realtime invalidation rejects message bodies, names, malformed pairs, and revisions', () => {
  const base = {
    friendship_user_id: LOW,
    friendship_friend_user_id: HIGH,
    revision: 1,
    changed_at: '2026-09-07T01:02:03.000Z',
  }
  assert.equal(isFriendConversationInvalidation({ ...base, body: '비공개 메시지' }), false)
  assert.equal(isFriendConversationInvalidation({ ...base, friend_recognition_name: '실명' }), false)
  assert.equal(isFriendConversationInvalidation({ ...base, friendship_user_id: HIGH }), false)
  assert.equal(isFriendConversationInvalidation({ ...base, revision: 0 }), false)
  assert.equal(isFriendConversationInvalidation({ ...base, changed_at: 'not-a-date' }), false)
})
