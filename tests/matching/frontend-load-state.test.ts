import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getMatchingFrontendLoadFailure,
  getMatchingFrontendLoadMessage,
  getMatchingFrontendPayloadFailure,
} from '../../lib/matching/frontend-load-state'

test('required matching responses fail closed when group state is unavailable', () => {
  const failure = getMatchingFrontendLoadFailure({
    groups: { ok: false, status: 500 },
    matches: { ok: true, status: 200 },
  })

  assert.equal(failure, 'group_state_unavailable')
  assert.match(getMatchingFrontendLoadMessage(failure), /잘못된 매칭을 시작하지 않도록/)
})

test('required matching responses fail closed when match state is unavailable', () => {
  const failure = getMatchingFrontendLoadFailure({
    groups: { ok: true, status: 200 },
    matches: { ok: false, status: 503 },
  })

  assert.equal(failure, 'match_state_unavailable')
  assert.match(getMatchingFrontendLoadMessage(failure), /중복 시작을 막기 위해/)
})

test('an unauthorized required response takes priority over other failures', () => {
  const failure = getMatchingFrontendLoadFailure({
    groups: { ok: false, status: 500 },
    matches: { ok: false, status: 401 },
  })

  assert.equal(failure, 'unauthorized')
  assert.match(getMatchingFrontendLoadMessage(failure), /다시 로그인/)
})

test('required matching responses pass only when both resources are available', () => {
  assert.equal(
    getMatchingFrontendLoadFailure({
      groups: { ok: true, status: 200 },
      matches: { ok: true, status: 200 },
    }),
    null,
  )
})

test('network failures have a dedicated recovery message', () => {
  assert.match(getMatchingFrontendLoadMessage('network_unavailable'), /다시 시도/)
})

test('matching recovery messages remain readable UTF-8 Korean', () => {
  const messages = [
    getMatchingFrontendLoadMessage('unauthorized'),
    getMatchingFrontendLoadMessage('group_state_unavailable'),
    getMatchingFrontendLoadMessage('match_state_unavailable'),
    getMatchingFrontendLoadMessage('network_unavailable'),
  ]

  assert.deepEqual(messages, [
    '로그인이 만료됐어요. 다시 로그인한 뒤 현재 상태를 확인해주세요.',
    '그룹 상태를 확인하지 못했어요. 잘못된 매칭을 시작하지 않도록 잠시 멈췄어요.',
    '진행 중인 매칭을 확인하지 못했어요. 중복 시작을 막기 위해 잠시 멈췄어요.',
    '서버와 연결되지 않았어요. 연결을 확인한 뒤 다시 시도해주세요.',
  ])
  assert.doesNotMatch(messages.join(' '), /[?�]|로그인이 만료됬|그룹 상태를 확인하지 못햇/)
})

test('required matching payloads fail closed when the response shape is incomplete', () => {
  assert.equal(
    getMatchingFrontendPayloadFailure({
      groups: {
        group: null,
        members: [],
        invites: [],
        friends: [],
      },
      matches: { matches: [] },
    }),
    'group_state_unavailable',
  )

  assert.equal(
    getMatchingFrontendPayloadFailure({
      groups: {
        group: null,
        match_pool_status: null,
        members: [],
        invites: [],
        friends: [],
        current_user_match_setup: {
          personality: false,
          schedule: false,
          preferences: false,
          allDone: false,
        },
      },
      matches: {},
    }),
    'match_state_unavailable',
  )
})

test('required matching payloads reject malformed nested group state', () => {
  const validSetup = {
    personality: false,
    schedule: false,
    preferences: false,
    allDone: false,
  }

  assert.equal(
    getMatchingFrontendPayloadFailure({
      groups: {
        group: null,
        match_pool_status: null,
        members: [null],
        invites: [],
        friends: [],
        current_user_match_setup: validSetup,
      },
      matches: { matches: [] },
    }),
    'group_state_unavailable',
  )

  assert.equal(
    getMatchingFrontendPayloadFailure({
      groups: {
        group: null,
        match_pool_status: null,
        members: [],
        invites: [],
        friends: [],
        current_user_match_setup: null,
      },
      matches: { matches: [] },
    }),
    'group_state_unavailable',
  )
})

test('required matching payloads reject malformed nested match rows', () => {
  assert.equal(
    getMatchingFrontendPayloadFailure({
      groups: {
        group: null,
        match_pool_status: null,
        members: [],
        invites: [],
        friends: [],
        current_user_match_setup: {
          personality: false,
          schedule: false,
          preferences: false,
          allDone: false,
        },
      },
      matches: {
        matches: [{
          match_id: 'match-1',
          match_status: 'pending',
        }],
      },
    }),
    'match_state_unavailable',
  )
})

test('required matching payloads accept the minimum complete contract', () => {
  assert.equal(
    getMatchingFrontendPayloadFailure({
      groups: {
        group: null,
        match_pool_status: null,
        members: [],
        invites: [],
        friends: [],
        current_user_match_setup: {
          personality: false,
          schedule: false,
          preferences: false,
          allDone: false,
        },
      },
      matches: { matches: [] },
    }),
    null,
  )
})
