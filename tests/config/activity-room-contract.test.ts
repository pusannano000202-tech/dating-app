import assert from 'node:assert/strict'
import test from 'node:test'
import { activityRoomErrorMessage, getActivityRoomDefinition, parseActivityRoomLobby, isActivityRoomId, parseActivityRoomMessagePage, mergeActivityRoomMessages, isActivityRoomCursor } from '../../lib/meetups/activity-room-contract'

test('chat history keeps precise server cursors and rejects malformed pages', () => {
  const message = { id: '12345678-1234-4234-8234-123456789abc', sender_alias: '푸른별', message: '정문에서 만나요', created_at: '2026-09-07T12:00:00.123456+00:00', is_me: false }
  const page = { room_id: message.id, messages: [message], has_more: true, next_cursor: { id: message.id, created_at: message.created_at } }
  assert.deepEqual(parseActivityRoomMessagePage(page), page)
  assert.equal(isActivityRoomCursor(page.next_cursor), true)
  assert.equal(isActivityRoomCursor({ id: message.id, created_at: 'yesterday' }), false)
  assert.equal(parseActivityRoomMessagePage({ ...page, next_cursor: null }), null)
  assert.equal(parseActivityRoomMessagePage({ ...page, messages: [message, message] }), null)
  assert.equal(parseActivityRoomMessagePage({ ...page, next_cursor: { ...page.next_cursor, created_at: '2026-09-07T12:00:00.123Z' } }), null)
  assert.ok(parseActivityRoomMessagePage({ ...page, messages: [], has_more: false, next_cursor: null }))
})

test('history prepends without duplicates and preserves microsecond ordering on live refresh', () => {
  const base = { sender_alias: '푸른별', message: '약속', is_me: false }
  const earlier = { ...base, id: '22345678-1234-4234-8234-123456789abc', created_at: '2026-09-07T12:00:00.123456+00:00' }
  const later = { ...base, id: '12345678-1234-4234-8234-123456789abc', created_at: '2026-09-07T12:00:00.123457+00:00' }
  const newest = { ...base, id: '32345678-1234-4234-8234-123456789abc', created_at: '2026-09-07T12:01:00Z' }
  assert.deepEqual(mergeActivityRoomMessages([later, earlier], [later, newest]).map(item => item.id), [earlier.id, later.id, newest.id])
})

test('missing rooms explain recovery without claiming a server outage', () => {
  assert.equal(activityRoomErrorMessage('activity_room_not_found'), '이 방은 더 이상 열려 있지 않아요. 방 목록에서 모집 중인 방을 확인해 주세요.')
  assert.equal(activityRoomErrorMessage('invalid_activity_room_cursor'), '대화 목록이 바뀌었어요. 채팅을 새로고침한 뒤 다시 확인해 주세요.')
})

test('automatic rooms use exact activity identity and preserve sport-specific capacity', () => {
  assert.equal(getActivityRoomDefinition('team-gaming')?.capacity, 5)
  assert.equal(getActivityRoomDefinition('evening-badminton')?.capacity, 4)
  assert.equal(getActivityRoomDefinition('gaming'), null)
  assert.equal(getActivityRoomDefinition('invented'), null)
  assert.notEqual(getActivityRoomDefinition('campus-cafe-chat')?.id, getActivityRoomDefinition('campus-small-shop')?.id)
})

test('unavailable or malformed payloads cannot masquerade as empty room counts', () => {
  for (const value of [null, {}, { rooms: [] }, { activity_key: 'team-gaming', capacity: 5, rooms: [] }]) {
    assert.equal(parseActivityRoomLobby(value), null)
  }
  assert.equal(isActivityRoomId('anything'), false)
  assert.equal(isActivityRoomId('12345678-1234-4234-8234-123456789abc'), true)
})

test('room totals, capacities, identity and counts are checked before rendering', () => {
  const lobby = { activity_key: 'team-gaming', gender_mode: 'all', capacity: 5, room_count: 2, rooms: [
    { id: '12345678-1234-4234-8234-123456789abc', room_number: 1, member_count: 5, capacity: 5, joined: false, status: 'full', joinable: false },
    { id: '22345678-1234-4234-8234-123456789abc', room_number: 2, member_count: 0, capacity: 5, joined: false, status: 'recruiting', joinable: true },
  ] }
  assert.ok(parseActivityRoomLobby(lobby))
  assert.equal(parseActivityRoomLobby({ ...lobby, room_count: 3 }), null)
  assert.equal(parseActivityRoomLobby({ ...lobby, rooms: [{ ...lobby.rooms[0], member_count: 6 }, lobby.rooms[1]] }), null)
  assert.equal(parseActivityRoomLobby({ ...lobby, rooms: [lobby.rooms[0], lobby.rooms[0]] }), null)
  assert.equal(parseActivityRoomLobby({ ...lobby, capacity: 4 }), null)
})
