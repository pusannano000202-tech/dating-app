import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPersonalityPreferenceStoragePayload,
  buildPersonalityPreferenceProfile,
  personalityImpressionPriorFromBig5,
  scorePersonalityFit,
  toPreferredBig5,
} from '../../lib/matching/personality-preference'

test('buildPersonalityPreferenceProfile turns 상대 성격 답변 into preferred vector and public types', () => {
  const profile = buildPersonalityPreferenceProfile([
    { axis: 'openness', answer: 3, questionId: 'open_1' },
    { axis: 'conscientiousness', answer: 3, questionId: 'plan_1' },
    { axis: 'extraversion', answer: 5, questionId: 'social_1' },
    { axis: 'agreeableness', answer: 5, questionId: 'care_1' },
    { axis: 'emotional_stability', answer: 4, questionId: 'stable_1' },
  ])

  assert.deepEqual(profile.vector, {
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 1,
    agreeableness: 1,
    emotional_stability: 0.75,
  })
  assert.equal(profile.primaryType, 'active_social')
  assert.equal(profile.secondaryType, 'warm_empathic')
  assert.equal(profile.confidence, 1)
  assert.equal(Math.round(Object.values(profile.typeWeights).reduce((sum, value) => sum + value, 0) * 1000), 1000)
})

test('toPreferredBig5 keeps Big5 compatibility while exposing emotional stability publicly', () => {
  const preferredBig5 = toPreferredBig5({
    openness: 0.7,
    conscientiousness: 0.4,
    extraversion: 0.8,
    agreeableness: 0.9,
    emotional_stability: 0.75,
  })

  assert.deepEqual(preferredBig5, {
    openness: 0.7,
    conscientiousness: 0.4,
    extraversion: 0.8,
    agreeableness: 0.9,
    neuroticism: 0.25,
  })
})

test('scorePersonalityFit rewards actual personalities that match preferred emotional stability', () => {
  const preferred = {
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    emotional_stability: 0.9,
  }

  const stableActual = scorePersonalityFit(preferred, {
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    neuroticism: 0.1,
  })
  const sensitiveActual = scorePersonalityFit(preferred, {
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    neuroticism: 0.9,
  })

  assert.ok(stableActual > sensitiveActual)
  assert.equal(stableActual, 1)
})

test('personalityImpressionPriorFromBig5 maps 웃음 많고 외향적인 성격 toward warm/cute impression', () => {
  const socialWarm = personalityImpressionPriorFromBig5({
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.9,
    agreeableness: 0.9,
    neuroticism: 0.2,
  })
  const quietChic = personalityImpressionPriorFromBig5({
    openness: 0.7,
    conscientiousness: 0.5,
    extraversion: 0.1,
    agreeableness: 0.4,
    neuroticism: 0.2,
  })

  assert.ok(socialWarm.warm > socialWarm.chic)
  assert.ok(socialWarm.cute > quietChic.cute)
  assert.ok(quietChic.chic > socialWarm.chic)
  assert.equal(Math.round(Object.values(socialWarm).reduce((sum, value) => sum + value, 0) * 1000), 1000)
})

test('buildPersonalityPreferenceStoragePayload stores Sungjun preferred 상대성격 vector contract', () => {
  const profile = buildPersonalityPreferenceProfile([
    { axis: 'openness', answer: 5, questionId: 'open_1' },
    { axis: 'conscientiousness', answer: 3, questionId: 'plan_1' },
    { axis: 'extraversion', answer: 4, questionId: 'social_1' },
    { axis: 'agreeableness', answer: 5, questionId: 'care_1' },
    { axis: 'emotional_stability', answer: 2, questionId: 'stable_1' },
  ])

  const payload = buildPersonalityPreferenceStoragePayload(profile, {
    openness: 0.25,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.75,
    neuroticism: 0.5,
  })

  assert.deepEqual(payload.preferred_personality_vector, {
    openness: 1,
    conscientiousness: 0.5,
    extraversion: 0.75,
    agreeableness: 1,
    emotional_stability: 0.25,
  })
  assert.deepEqual(payload.preferred_personality_delta_vector, {
    openness: 0.75,
    conscientiousness: 0,
    extraversion: 0.25,
    agreeableness: 0.25,
    emotional_stability: -0.25,
  })
  assert.equal(payload.preferred_personality_primary_type, profile.primaryType)
  assert.equal(payload.preferred_personality_secondary_type, profile.secondaryType)
  assert.equal(payload.personality_preference_confidence, 1)
  assert.equal(payload.personality_preference_answer_logs.length, 5)
})
