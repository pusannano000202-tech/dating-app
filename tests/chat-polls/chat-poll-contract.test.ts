import test from 'node:test'
import assert from 'node:assert/strict'

import {
  chatPollErrorMessage,
  parseChatPollBoard,
  parseChatPollMutationEnvelope,
  parseCreateChatPollInput,
  parseVoteChatPollInput,
  resolveChatPollRoomKind,
} from '../../lib/chat-polls/contract'
import { safeViewerBindingEqual } from '../../lib/chat-polls/viewer-binding'

const ids = {
  room: '11111111-1111-4111-8111-111111111111',
  poll: '22222222-2222-4222-8222-222222222222',
  first: '33333333-3333-4333-8333-333333333333',
  second: '44444444-4444-4444-8444-444444444444',
  agreement: '55555555-5555-4555-8555-555555555555',
}

test('room routes retain existing scopes and distinguish native study rooms from mentoring', () => {
  for (const [route, kind] of Object.entries({ meetups: 'meetup', friends: 'friend',
    'department-challenges': 'department_challenge', 'league-teams': 'league_team',
    'study-rooms': 'study_room', 'mentoring-rooms': 'mentoring' })) {
    assert.equal(resolveChatPollRoomKind(route), kind)
  }
  for (const value of ['constructor', '__proto__', 'study', 'study_room', 'mentoring', '']) {
    assert.equal(resolveChatPollRoomKind(value), null)
  }
})

test('poll creation trims content while enforcing purpose, mode, 2-8 unique options', () => {
  assert.deepEqual(parseCreateChatPollInput({
    purpose: 'schedule',
    title: '  언제 만날까요?  ',
    selection_mode: 'single',
    options: [' 금요일 7시 ', '토요일 2시'],
    idempotency_key: ids.poll,
  }), {
    purpose: 'schedule', title: '언제 만날까요?', selectionMode: 'single',
    options: ['금요일 7시', '토요일 2시'], idempotencyKey: ids.poll,
  })

  assert.equal(parseCreateChatPollInput({
    purpose: 'schedule', title: '언제 만날까요?', selection_mode: 'single',
    options: ['금요일', '토요일'], idempotency_key: ids.poll, user_id: ids.room,
  }), null, 'caller identity fields and every other unexpected field are rejected')

  for (const input of [
    null,
    { purpose: 'payment', title: '선택', selection_mode: 'single', options: ['1', '2'], idempotency_key: ids.poll },
    { purpose: 'role', title: '선택', selection_mode: 'sequential', options: ['1', '2'], idempotency_key: ids.poll },
    { purpose: 'place', title: '선택', selection_mode: 'single', options: ['하나'], idempotency_key: ids.poll },
    { purpose: 'general', title: '선택', selection_mode: 'multiple', options: ['A', ' a '], idempotency_key: ids.poll },
    { purpose: 'general', title: ' ', selection_mode: 'multiple', options: ['A', 'B'], idempotency_key: ids.poll },
    { purpose: 'general', title: '선택', selection_mode: 'multiple', options: Array.from({ length: 9 }, (_, index) => String(index)), idempotency_key: ids.poll },
    { purpose: 'general', title: '선택', selection_mode: 'multiple', options: ['A', 'B'], idempotency_key: 'not-a-uuid' },
  ]) assert.equal(parseCreateChatPollInput(input), null)
})

test('vote input accepts one single choice or deduplicated multiple choices only', () => {
  assert.deepEqual(parseVoteChatPollInput({ option_ids: [ids.first] }, 'single'), { optionIds: [ids.first] })
  assert.deepEqual(parseVoteChatPollInput({ option_ids: [ids.first, ids.second, ids.first] }, 'multiple'), { optionIds: [ids.first, ids.second] })
  assert.equal(parseVoteChatPollInput({ option_ids: [ids.first, ids.second] }, 'single'), null)
  assert.equal(parseVoteChatPollInput({ option_ids: [] }, 'multiple'), null)
  assert.equal(parseVoteChatPollInput({ option_ids: ['not-a-uuid'] }, 'multiple'), null)
  assert.equal(parseVoteChatPollInput({ option_ids: [ids.first], actor_id: ids.room }, 'single'), null)
})

test('mutation envelopes require the viewer that loaded the board without weakening payload validation', () => {
  const envelope = parseChatPollMutationEnvelope({
    expected_viewer_binding: ids.room,
    option_ids: [ids.first],
  })
  assert.deepEqual(envelope, {
    expectedViewerBinding: ids.room,
    payload: { option_ids: [ids.first] },
  })
  assert.equal(parseChatPollMutationEnvelope({ option_ids: [ids.first] }), null)
  assert.equal(parseChatPollMutationEnvelope({ expected_viewer_binding: 'not-a-uuid', option_ids: [ids.first] }), null)
  assert.deepEqual(parseVoteChatPollInput(envelope?.payload, 'single'), { optionIds: [ids.first] })
  assert.equal(parseVoteChatPollInput({ ...envelope?.payload, actor_id: ids.room }, 'single'), null)
})

test('viewer bindings use a complete UUID comparison', () => {
  assert.equal(safeViewerBindingEqual(ids.room.toUpperCase(), ids.room), true)
  assert.equal(safeViewerBindingEqual(ids.room, ids.poll), false)
  assert.equal(safeViewerBindingEqual('not-a-uuid', ids.room), false)
})

test('board parser retains only complete authoritative results and agreement state', () => {
  const board = parseChatPollBoard({
    room_id: ids.room,
    polls: [{
      id: ids.poll, purpose: 'place', title: '어디서 만날까요?', selection_mode: 'single',
      status: 'closed', revision: 2, creator_alias: '라일락', is_creator: true,
      created_at: '2026-09-09T01:00:00.000Z', closed_at: '2026-09-09T01:10:00.000Z',
      ballot_count: 2,
      options: [
        { id: ids.first, label: '정문', position: 0, vote_count: 2, selected_by_me: true },
        { id: ids.second, label: '북문', position: 1, vote_count: 0, selected_by_me: false },
      ],
      agreement: {
        id: ids.agreement, version: 1, status: 'proposal', selected_option_id: ids.first,
        summary: '정문에서 만나는 제안', confirmation_count: 1, required_count: 2,
        confirmed_by_me: true, membership_current: true,
        proposed_at: '2026-09-09T01:11:00.000Z', confirmed_at: null,
      },
    }],
  })
  assert.ok(board)
  assert.equal(board.polls[0].creatorAlias, '라일락')
  assert.equal(board.polls[0].options[0].voteCount, 2)
  assert.equal(board.polls[0].agreement?.status, 'proposal')

  assert.equal(parseChatPollBoard({ room_id: ids.room, polls: [{ id: ids.poll }] }), null)
  assert.equal(parseChatPollBoard({ room_id: 'guess-me', polls: [] }), null)
})

test('poll errors distinguish retryable service failures from access and stale-version failures', () => {
  assert.match(chatPollErrorMessage('activity_poll_forbidden'), /볼 수 없어요/)
  assert.match(chatPollErrorMessage('activity_poll_stale_version'), /새로고침/)
  assert.match(chatPollErrorMessage('activity_poll_tied'), /동률/)
  assert.match(chatPollErrorMessage('activity_poll_no_response'), /응답/)
  assert.match(chatPollErrorMessage('community_unavailable'), /연결/)
})
