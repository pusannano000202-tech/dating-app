import test from 'node:test'
import assert from 'node:assert/strict'
import { createPrivatePendingMatch } from '../../lib/matching/private-match-orchestrator'

const availability = {
  slots: [{ day: 'saturday', start: '14:00', end: '18:00' }],
}

const big5 = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
}

function memberRow(
  groupId: string,
  userId: string,
  groupGender: 'male' | 'female',
  department: string,
  appearanceType: 'warm' | 'chic',
  preferredType: 'warm' | 'chic',
  score: number,
) {
  return {
    group_id: groupId,
    group_gender: groupGender,
    group_size: 2,
    department,
    excluded_group_ids: [],
    user_id: userId,
    age: 22,
    preferred_age_min: 20,
    preferred_age_max: 25,
    preferred_axis_z_vector: { [preferredType]: 1 },
    preferred_personality_vector: big5,
    big5,
    available_timeslots: availability,
    preference_weights: {
      appearance: 0.4,
      personality: 0.3,
      height: 0.15,
      body_type: 0.15,
    },
    score_normalized: score,
    appearance_type: appearanceType,
  }
}

const matchableRows = [
  memberRow('group-a', 'user-a1', 'male', 'business', 'warm', 'chic', 0.6),
  memberRow('group-a', 'user-a2', 'male', 'business', 'warm', 'chic', 0.62),
  memberRow('group-b', 'user-b1', 'female', 'design', 'chic', 'warm', 0.63),
  memberRow('group-b', 'user-b2', 'female', 'design', 'chic', 'warm', 0.61),
]

test('private match orchestration computes score server-side before atomic creation', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const result = await createPrivatePendingMatch(
    {
      async rpc(name, args) {
        calls.push({ name, args })
        if (name === 'get_private_matching_profiles') {
          return { data: matchableRows, error: null }
        }
        if (name === 'has_blocked_member_pair_between_groups') {
          return { data: false, error: null }
        }
        return { data: 'match-1', error: null }
      },
    },
    { groupAId: 'group-a', groupBId: 'group-b', isForced: false },
  )

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.matchId, 'match-1')
  assert.ok(result.score >= 0.45)

  assert.equal(calls.length, 3)
  assert.deepEqual(calls[0], {
    name: 'get_private_matching_profiles',
    args: { p_group_ids: ['group-a', 'group-b'] },
  })
  assert.deepEqual(calls[1], {
    name: 'has_blocked_member_pair_between_groups',
    args: { p_group_a: 'group-a', p_group_b: 'group-b' },
  })
  assert.equal(calls[2].name, 'admin_create_pending_match')
  assert.equal(calls[2].args.p_group_a, 'group-a')
  assert.equal(calls[2].args.p_group_b, 'group-b')
  assert.equal(calls[2].args.p_is_forced, false)
  assert.equal(calls[2].args.p_score, result.score)
  assert.deepEqual(calls[2].args.p_breakdown, result.breakdown)
})

test('private match orchestration excludes groups containing a hidden friend pair', async () => {
  const calls: string[] = []
  const result = await createPrivatePendingMatch(
    {
      async rpc(name) {
        calls.push(name)
        if (name === 'get_private_matching_profiles') {
          return { data: matchableRows, error: null }
        }
        if (name === 'has_blocked_member_pair_between_groups') {
          return { data: true, error: null }
        }
        return { data: 'must-not-create', error: null }
      },
    },
    { groupAId: 'group-a', groupBId: 'group-b', isForced: false },
  )

  assert.deepEqual(result, { ok: false, reason: 'excluded_pair' })
  assert.deepEqual(calls, ['get_private_matching_profiles', 'has_blocked_member_pair_between_groups'])
})

test('private match orchestration fails closed before DB creation for blocked pairs', async () => {
  const calls: string[] = []
  const sameDepartmentRows = matchableRows.map((row) => ({
    ...row,
    department: 'business',
  }))

  const result = await createPrivatePendingMatch(
    {
      async rpc(name) {
        calls.push(name)
        return { data: sameDepartmentRows, error: null }
      },
    },
    { groupAId: 'group-a', groupBId: 'group-b', isForced: false },
  )

  assert.deepEqual(result, { ok: false, reason: 'department_blocked' })
  assert.deepEqual(calls, ['get_private_matching_profiles'])
})

test('private match orchestration rejects inconsistent private group metadata', async () => {
  const inconsistentRows = matchableRows.map((row, index) => (
    index === 1 ? { ...row, group_size: 3 } : row
  ))

  const result = await createPrivatePendingMatch(
    {
      async rpc() {
        return { data: inconsistentRows, error: null }
      },
    },
    { groupAId: 'group-a', groupBId: 'group-b', isForced: false },
  )

  assert.deepEqual(result, { ok: false, reason: 'invalid_response' })
})
