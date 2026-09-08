import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  ACTIVITY_ROOM_FIXTURE_IDS,
  createActivityRoomFixtureState,
  parseActivityRoomFixtureMode,
  routeActivityRoomFixture,
} from '../../scripts/qa/serve-activity-room-fixture.mjs'

const LOBBY = '/api/meetups/activities/team-gaming/rooms?gender_mode=all'

test('activity room fixture follows the review journey from a nearly-full room to chat and the next room', () => {
  const state = createActivityRoomFixtureState(() => '2026-09-07T12:00:00.000Z')

  const initial = routeActivityRoomFixture({ method: 'POST', url: LOBBY, state })
  assert.equal(initial.status, 200)
  assert.deepEqual(initial.body.data.rooms, [{
    id: ACTIVITY_ROOM_FIXTURE_IDS.roomOne,
    room_number: 1,
    member_count: 4,
    capacity: 5,
    joined: false,
    status: 'recruiting',
    joinable: true,
  }])

  const joined = routeActivityRoomFixture({
    method: 'POST',
    url: `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}/join`,
    state,
  })
  assert.deepEqual(joined.body, { data: { room_id: ACTIVITY_ROOM_FIXTURE_IDS.roomOne } })

  const chat = routeActivityRoomFixture({
    method: 'POST',
    url: `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}/chat`,
    body: { message: '저는 8시가 좋아요!', idempotency_key: '50000000-0000-4000-8000-000000000005' },
    state,
  })
  assert.equal(chat.status, 200)

  const detail = routeActivityRoomFixture({
    method: 'GET',
    url: `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}`,
    state,
  })
  assert.equal(detail.body.data.joined, true)
  assert.equal(detail.body.data.member_count, 5)
  assert.equal(detail.body.data.status, 'full')
  assert.equal(detail.body.data.joinable, false)
  assert.equal(detail.body.data.messages.at(-1)?.message, '저는 8시가 좋아요!')

  const after = routeActivityRoomFixture({ method: 'GET', url: LOBBY, state })
  assert.deepEqual(after.body.data.rooms, [
    {
      id: ACTIVITY_ROOM_FIXTURE_IDS.roomOne,
      room_number: 1,
      member_count: 5,
      capacity: 5,
      joined: true,
      status: 'full',
      joinable: false,
    },
    {
      id: ACTIVITY_ROOM_FIXTURE_IDS.roomTwo,
      room_number: 2,
      member_count: 0,
      capacity: 5,
      joined: false,
      status: 'recruiting',
      joinable: false,
    },
  ])
})

test('activity room fixture applies the chat endpoint request shape before changing review state', () => {
  const state = createActivityRoomFixtureState()
  routeActivityRoomFixture({ method: 'POST', url: `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}/join`, state })

  const invalid = routeActivityRoomFixture({
    method: 'POST',
    url: `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}/chat`,
    body: { message: '메시지', idempotency_key: 'not-a-uuid' },
    state,
  })
  assert.deepEqual(invalid, { status: 400, body: { error: 'invalid_message' } })
  assert.equal(state.messages.length, 1)
})

test('leaving the fixture room recalculates joinability for every visible room', () => {
  const state = createActivityRoomFixtureState()
  const roomOnePath = `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}/join`
  routeActivityRoomFixture({ method: 'POST', url: roomOnePath, state })

  const left = routeActivityRoomFixture({ method: 'DELETE', url: roomOnePath, state })
  assert.equal(left.status, 200)

  const rooms = routeActivityRoomFixture({ method: 'GET', url: LOBBY, state }).body.data.rooms
  assert.deepEqual(rooms.map((room) => ({
    room_number: room.room_number,
    member_count: room.member_count,
    status: room.status,
    joined: room.joined,
    joinable: room.joinable,
  })), [
    { room_number: 1, member_count: 4, status: 'recruiting', joined: false, joinable: true },
    { room_number: 2, member_count: 0, status: 'recruiting', joined: false, joinable: true },
  ])
})

test('activity room fixture only recognizes the approved gaming endpoints', () => {
  const state = createActivityRoomFixtureState()

  assert.equal(routeActivityRoomFixture({ method: 'POST', url: '/api/profile/basic', state }), null)
  assert.equal(routeActivityRoomFixture({ method: 'POST', url: '/api/meetups/activities/team-gaming/rooms?gender_mode=male_only', state }), null)
  assert.equal(routeActivityRoomFixture({ method: 'PATCH', url: LOBBY, state }), null)
})

test('fixture review banner remains fixed at the viewport top while scrolling', () => {
  const source = readFileSync('scripts/qa/serve-activity-room-fixture.mjs', 'utf8')

  assert.match(source, /position:fixed;top:0;left:0;right:0/)
})

test('refill-history mode starts with two recruiting rooms and preserves the second room when room one fills', () => {
  const state = createActivityRoomFixtureState(() => '2026-09-07T12:00:00.000Z', 'refill-history')

  const initial = routeActivityRoomFixture({ method: 'POST', url: LOBBY, state }).body.data.rooms
  assert.deepEqual(initial.map((room) => ({ room_number: room.room_number, member_count: room.member_count, status: room.status, joinable: room.joinable })), [
    { room_number: 1, member_count: 4, status: 'recruiting', joinable: true },
    { room_number: 2, member_count: 2, status: 'recruiting', joinable: true },
  ])

  routeActivityRoomFixture({ method: 'POST', url: `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}/join`, state })
  const joined = routeActivityRoomFixture({ method: 'GET', url: LOBBY, state }).body.data.rooms
  assert.deepEqual(joined.map((room) => ({ room_number: room.room_number, member_count: room.member_count, status: room.status, joinable: room.joinable })), [
    { room_number: 1, member_count: 5, status: 'full', joinable: false },
    { room_number: 2, member_count: 2, status: 'recruiting', joinable: false },
  ])
})

test('refill-history mode exposes only the latest hundred messages and a guarded chronological previous page', () => {
  const state = createActivityRoomFixtureState(() => '2026-09-07T12:00:00.000Z', 'refill-history')
  const messagesPath = `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}/messages`

  assert.deepEqual(routeActivityRoomFixture({ method: 'GET', url: messagesPath, state }), {
    status: 403,
    body: { error: 'membership_required' },
  })

  routeActivityRoomFixture({ method: 'POST', url: `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}/join`, state })
  const detail = routeActivityRoomFixture({ method: 'GET', url: `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}`, state }).body.data
  assert.equal(detail.messages.length, 100)

  const latest = routeActivityRoomFixture({ method: 'GET', url: messagesPath, state })
  assert.equal(latest.status, 200)
  assert.equal(latest.body.data.room_id, ACTIVITY_ROOM_FIXTURE_IDS.roomOne)
  assert.equal(latest.body.data.messages.length, 100)
  assert.equal(latest.body.data.has_more, true)
  assert.ok(latest.body.data.next_cursor)
  assert.deepEqual(latest.body.data.messages, [...latest.body.data.messages].sort((left, right) => left.created_at.localeCompare(right.created_at)))

  const cursor = latest.body.data.next_cursor
  const older = routeActivityRoomFixture({
    method: 'GET',
    url: `${messagesPath}?before_created_at=${encodeURIComponent(cursor.created_at)}&before_message_id=${cursor.id}`,
    state,
  })
  assert.equal(older.status, 200)
  assert.equal(older.body.data.messages.length, 5)
  assert.equal(older.body.data.has_more, false)
  assert.equal(older.body.data.next_cursor, null)
  assert.ok(older.body.data.messages.some((message) => message.message === '오늘 저녁 8시, 부산대 정문 앞에서 만나요.'))
})

test('refill-history mode is an explicit optional server start flag', () => {
  assert.equal(parseActivityRoomFixtureMode([]), 'default')
  assert.equal(parseActivityRoomFixtureMode(['--refill-history']), 'refill-history')
  assert.throws(() => parseActivityRoomFixtureMode(['--unexpected']), /activity_room_fixture_invalid_arguments/)
})
