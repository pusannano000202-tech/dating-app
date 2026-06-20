import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getFriendMatchLabel,
  getFriendMatchState,
  getMemberStatusLabel,
  getQueueStatusText,
} from '../../components/matching/group-create/status'
import type { FriendSummary, GroupRecord } from '../../components/matching/group-create/types'

const group: GroupRecord = {
  id: 'group-1',
  leader_user_id: 'user-1',
  name: null,
  size: 3,
  gender: 'male',
  status: 'forming',
}

function friend(overrides: Partial<FriendSummary>): FriendSummary {
  return {
    user_id: 'friend-1',
    display_name: 'Friend',
    phone: null,
    status: 'active',
    group_status: 'available',
    ...overrides,
  }
}

test('getQueueStatusText explains the blocking setup state before queue entry', () => {
  assert.equal(
    getQueueStatusText({ group: null, membersLength: 0, needsSetupCount: 0 }),
    '그룹 상태를 불러오지 못했어요.',
  )
  assert.equal(
    getQueueStatusText({ group, membersLength: 1, needsSetupCount: 0 }),
    '친구 2명이 더 필요해요',
  )
  assert.equal(
    getQueueStatusText({ group, membersLength: 2, needsSetupCount: 0 }),
    '친구 1명이 더 필요해요',
  )
  assert.equal(
    getQueueStatusText({ group, membersLength: 3, needsSetupCount: 1 }),
    '멤버마다 성향/시간/비중 입력이 필요해요',
  )
  assert.equal(
    getQueueStatusText({ group, membersLength: 3, needsSetupCount: 0 }),
    '매칭 큐 진입 준비 완료',
  )
})

test('getMemberStatusLabel reflects readiness map values', () => {
  const readyByUserId = new Map([
    ['ready-user', true],
    ['setup-user', false],
  ])

  assert.equal(getMemberStatusLabel('ready-user', readyByUserId), '준비 완료')
  assert.equal(getMemberStatusLabel('setup-user', readyByUserId), '준비 필요')
  assert.equal(getMemberStatusLabel('unknown-user', readyByUserId), '준비 필요')
})

test('friend match labels preserve invited, in-group, and available copy', () => {
  const readyByUserId = new Map([
    ['friend-ready', true],
    ['friend-setup', false],
  ])

  assert.equal(
    getFriendMatchState(friend({ user_id: 'friend-ready', group_status: 'in_group' }), readyByUserId),
    'ready',
  )
  assert.equal(
    getFriendMatchLabel(friend({ user_id: 'friend-ready', group_status: 'in_group' }), readyByUserId),
    '준비 완료',
  )
  assert.equal(
    getFriendMatchLabel(friend({ user_id: 'friend-setup', group_status: 'in_group' }), readyByUserId),
    '준비 필요',
  )
  assert.equal(getFriendMatchLabel(friend({ group_status: 'invited' }), readyByUserId), '초대중')
  assert.equal(getFriendMatchLabel(friend({ group_status: 'available' }), readyByUserId), '초대 가능')
})
