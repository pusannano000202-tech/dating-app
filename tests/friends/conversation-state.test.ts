import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const ID_B = '22222222-2222-4222-8222-222222222222'
const MESSAGE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function state() {
  assert.ok(existsSync(resolve('lib/friends/conversation-state.ts')), 'conversation state contract must exist')
  return require('../../lib/friends/conversation-state') as {
    parseConversationList(value: unknown): unknown
    parseFriendChatPage(value: unknown): {
      messages: Array<{ id: string }>
      nextCursor: string | null
      myLastReadMessageId: string | null
      peerLastReadMessageId: string | null
      friend: { userId: string; friendRecognitionName: string | null }
    } | null
    mergeMessages(current: Array<{ id: string; createdAt: string }>, incoming: Array<{ id: string; createdAt: string }>): Array<{ id: string }>
  }
}

test('conversation list accepts only bounded private projections', () => {
  const payload = {
    conversations: [{
      friend: { user_id: ID_B, display_name: '살구새벽', friend_recognition_name: '김친구', photo_url: null },
      last_message: { id: MESSAGE_A, body: '안녕', is_mine: false, created_at: '2026-09-07T01:00:00.000Z' },
      unread_count: 1,
      my_last_read_message_id: null,
      peer_last_read_message_id: MESSAGE_A,
    }],
    next_cursor: null,
  }
  assert.ok(state().parseConversationList(payload))
  assert.equal(state().parseConversationList({ ...payload, conversations: Array(101).fill(payload.conversations[0]) }), null)
  assert.equal(state().parseConversationList({ ...payload, conversations: [{ ...payload.conversations[0], unread_count: -1 }] }), null)
  assert.equal(state().parseConversationList({ ...payload, conversations: [{ ...payload.conversations[0], friend: { ...payload.conversations[0].friend, phone: '010' } }] }), null)
})

test('chat page carries authorized identity, pagination, and both read cursors', () => {
  const parsed = state().parseFriendChatPage({
    friend: { user_id: ID_B, display_name: '살구새벽', friend_recognition_name: '김친구' },
    messages: [{ id: MESSAGE_A, is_mine: false, body: '안녕', created_at: '2026-09-07T01:00:00.000Z' }],
    next_cursor: 'opaque-cursor',
    my_last_read_message_id: MESSAGE_A,
    peer_last_read_message_id: null,
  })
  assert.equal(parsed?.friend.userId, ID_B)
  assert.equal(parsed?.friend.friendRecognitionName, '김친구')
  assert.equal(parsed?.nextCursor, 'opaque-cursor')
  assert.equal(parsed?.myLastReadMessageId, MESSAGE_A)
})

test('message page merge is chronological, stable, and duplicate free', () => {
  const current = [{ id: MESSAGE_A, createdAt: '2026-09-07T01:00:00.000Z' }]
  const older = [
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', createdAt: '2026-09-07T00:00:00.000Z' },
    { id: MESSAGE_A, createdAt: '2026-09-07T01:00:00.000Z' },
  ]
  assert.deepEqual(state().mergeMessages(current, older).map((row) => row.id), [older[0].id, MESSAGE_A])
})
