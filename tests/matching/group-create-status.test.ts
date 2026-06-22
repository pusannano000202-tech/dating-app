import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getGroupCompositionSummary,
  getFriendMatchLabel,
  getFriendMatchState,
  getGroupExitActionState,
  getMemberStatusLabel,
  getQueueStatusText,
} from '../../components/matching/group-create/status'
import type { FriendSummary, GroupMemberRecord, GroupRecord } from '../../components/matching/group-create/types'

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

function member(overrides: Partial<GroupMemberRecord>): GroupMemberRecord {
  return {
    group_id: 'group-1',
    user_id: 'user-1',
    display_name: 'Member',
    role: 'member',
    joined_at: '2026-06-23T00:00:00.000Z',
    left_at: null,
    match_setup_ready: false,
    pre_match_card_ready: false,
    gender: null,
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
    '멤버마다 성향/시간/비중/사전 카드 준비가 필요해요',
  )
  assert.equal(
    getQueueStatusText({ group, membersLength: 3, needsSetupCount: 0 }),
    '매칭 큐 진입 준비 완료',
  )
})

test('getQueueStatusText makes a 2:2 group look open again after a friend leaves', () => {
  const twoPersonGroup = { ...group, size: 2 }

  assert.equal(
    getQueueStatusText({ group: twoPersonGroup, membersLength: 1, needsSetupCount: 0 }),
    '친구 1명이 더 필요해요',
  )
})

test('getGroupCompositionSummary recalculates from active member genders', () => {
  assert.deepEqual(
    getGroupCompositionSummary([
      member({ user_id: 'male-1', gender: 'male' }),
      member({ user_id: 'male-left', gender: 'male', left_at: '2026-06-23T00:00:00.000Z' }),
      member({ user_id: 'female-1', gender: 'female' }),
    ]),
    {
      male: 1,
      female: 1,
      unknown: 0,
      label: '혼성 그룹',
      detail: '남자 1명 · 여자 1명',
    },
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
  assert.equal(getFriendMatchLabel(friend({ group_status: 'invited' }), readyByUserId), '수락 대기')
  assert.equal(getFriendMatchLabel(friend({ group_status: 'available' }), readyByUserId), '초대 가능')
})

test('getGroupExitActionState gives non-leaders a clear leave action', () => {
  const state = getGroupExitActionState({
    isLeader: false,
    groupStatus: 'forming',
    activeMemberCount: 2,
    capacity: 2,
    transferableMemberCount: 0,
  })

  assert.equal(state.kind, 'member_can_leave')
  assert.equal(state.primaryLabel, '그룹 나가기')
  assert.match(state.description, /다시 친구를 초대해야/)
})

test('getGroupExitActionState blocks direct leader leave and points to transfer or disband', () => {
  const state = getGroupExitActionState({
    isLeader: true,
    groupStatus: 'forming',
    activeMemberCount: 2,
    capacity: 2,
    transferableMemberCount: 1,
  })

  assert.equal(state.kind, 'leader_needs_transfer')
  assert.equal(state.primaryLabel, '리더 위임하기')
  assert.match(state.description, /리더를 넘기거나 그룹을 해체/)
})

test('getGroupExitActionState locks leaving once matching is already underway', () => {
  const state = getGroupExitActionState({
    isLeader: false,
    groupStatus: 'matched',
    activeMemberCount: 2,
    capacity: 2,
    transferableMemberCount: 0,
  })

  assert.equal(state.kind, 'locked')
  assert.equal(state.primaryLabel, '진행 중')
})
