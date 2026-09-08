import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPrivateMatchingMembers } from '../../lib/matching/private-profile-loader'

const validRow = {
  group_id: 'group-1',
  group_gender: 'male',
  group_size: 2,
  department: 'business',
  excluded_group_ids: [],
  user_id: 'user-1',
  age: 22,
  preferred_age_min: 20,
  preferred_age_max: 25,
  preferred_axis_z_vector: { warm: 0.8 },
  preferred_personality_vector: {
    openness: 0.4,
    conscientiousness: 0.6,
    extraversion: 0.5,
    agreeableness: 0.7,
    neuroticism: 0.2,
  },
  big5: {
    openness: 0.6,
    conscientiousness: 0.4,
    extraversion: 0.5,
    agreeableness: 0.3,
    neuroticism: 0.8,
  },
  available_timeslots: {
    slots: [{ day: 'saturday', start: '14:00', end: '18:00' }],
  },
  preference_weights: {
    appearance: 0.4,
    personality: 0.3,
    height: 0.15,
    body_type: 0.15,
  },
  score_normalized: 0.82,
  appearance_type: 'warm',
}

const validRows = [validRow, { ...validRow, user_id: 'user-2' }]

test('private matching loader calls the service RPC and groups complete members', async () => {
  const calls: Array<{ name: string; args: unknown }> = []
  const result = await loadPrivateMatchingMembers(
    {
      async rpc(name, args) {
        calls.push({ name, args })
        return { data: validRows, error: null }
      },
    },
    ['group-1'],
  )

  assert.deepEqual(calls, [
    {
      name: 'get_private_matching_profiles',
      args: { p_group_ids: ['group-1'] },
    },
  ])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.membersByGroupId.get('group-1')?.[0].appearanceScoreNormalized, 0.82)
  assert.deepEqual(result.membersByGroupId.get('group-1')?.[0].appearanceVector, { warm: 1 })
  assert.deepEqual(result.groupsById.get('group-1'), {
    groupId: 'group-1',
    gender: 'male',
    size: 2,
    departmentCodes: ['business'],
    excludedGroupIds: [],
    members: result.membersByGroupId.get('group-1'),
  })
})

test('private matching loader fails closed on query errors or malformed rows', async () => {
  const queryFailure = await loadPrivateMatchingMembers(
    {
      async rpc() {
        return { data: null, error: { message: 'database unavailable' } }
      },
    },
    ['group-1'],
  )
  assert.deepEqual(queryFailure, { ok: false, reason: 'query_failed' })

  const invalidResponse = await loadPrivateMatchingMembers(
    {
      async rpc() {
        return {
          data: [{ ...validRow, score_normalized: null }],
          error: null,
        }
      },
    },
    ['group-1'],
  )
  assert.deepEqual(invalidResponse, { ok: false, reason: 'invalid_response' })

  const invalidInput = await loadPrivateMatchingMembers(
    {
      async rpc() {
        throw new Error('must not query')
      },
    },
    [],
  )
  assert.deepEqual(invalidInput, { ok: false, reason: 'invalid_group_ids' })
})

test('private matching loader rejects missing or unexpected requested groups', async () => {
  const missingGroup = await loadPrivateMatchingMembers(
    {
      async rpc() {
        return { data: validRows, error: null }
      },
    },
    ['group-1', 'group-2'],
  )
  assert.deepEqual(missingGroup, { ok: false, reason: 'incomplete_groups' })

  const unexpectedGroup = await loadPrivateMatchingMembers(
    {
      async rpc() {
        return {
          data: [{ ...validRow, group_id: 'group-outside-request' }],
          error: null,
        }
      },
    },
    ['group-1'],
  )
  assert.deepEqual(unexpectedGroup, { ok: false, reason: 'invalid_response' })
})

test('private matching loader rejects inconsistent group metadata and member counts', async () => {
  const inconsistentMetadata = await loadPrivateMatchingMembers(
    {
      async rpc() {
        return {
          data: [
            { ...validRow, user_id: 'user-1', group_size: 2 },
            { ...validRow, user_id: 'user-2', group_size: 3 },
          ],
          error: null,
        }
      },
    },
    ['group-1'],
  )
  assert.deepEqual(inconsistentMetadata, { ok: false, reason: 'invalid_response' })

  const wrongMemberCount = await loadPrivateMatchingMembers(
    {
      async rpc() {
        return { data: [{ ...validRow, group_size: 2 }], error: null }
      },
    },
    ['group-1'],
  )
  assert.deepEqual(wrongMemberCount, { ok: false, reason: 'incomplete_groups' })
})
