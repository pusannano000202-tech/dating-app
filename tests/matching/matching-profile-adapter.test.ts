import test from 'node:test'
import assert from 'node:assert/strict'

// The module is intentionally loaded at runtime so this test can establish RED before it exists.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { toGroupMemberSummary } = require('../../lib/matching/profile-adapter') as {
  toGroupMemberSummary: (
    profile: Record<string, unknown>,
    privateAppearance?: Record<string, unknown>,
  ) => unknown
}

const completeProfile = {
  user_id: 'user-1',
  gender: 'female',
  age: 22,
  preferred_age_min: 20,
  preferred_age_max: 25,
  preferred_axis_z_vector: { warm: 0.8, chic: -0.2 },
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
  self_appearance_score: 5,
}

const privateAppearance = {
  score_normalized: 0.82,
  appearance_type: 'warm',
}

test('profile adapter uses only the private appearance input for engine score data', () => {
  const member = toGroupMemberSummary(
    {
      ...completeProfile,
      appearance_score_normalized: 0.11,
      appearance_type: 'chic',
    },
    privateAppearance,
  ) as Record<string, unknown>

  assert.equal(member.appearanceScoreNormalized, 0.82)
  assert.equal('selfAppearanceScore' in member, false)
  assert.deepEqual(member.appearanceVector, { warm: 1 })
  assert.deepEqual(member.preferenceWeights, {
    appearance: 0.4,
    personality: 0.3,
    height: 0.15,
    bodyType: 0.15,
  })
})

test('profile adapter rejects incomplete matching inputs instead of inventing engine data', () => {
  assert.equal(
    toGroupMemberSummary(completeProfile, {
      ...privateAppearance,
      score_normalized: 1.1,
    }),
    null,
  )
  assert.equal(
    toGroupMemberSummary(
      {
        ...completeProfile,
        preferred_personality_vector: null,
      },
      privateAppearance,
    ),
    null,
  )
  assert.equal(
    toGroupMemberSummary(
      {
        ...completeProfile,
        available_timeslots: {
          slots: [{ day: 'saturday', start: '18:00', end: '14:00' }],
        },
      },
      privateAppearance,
    ),
    null,
  )
  assert.equal(toGroupMemberSummary(completeProfile), null)
  assert.equal(
    toGroupMemberSummary(completeProfile, {
      score_normalized: 0.82,
      appearance_type: 'unknown',
    }),
    null,
  )
})
