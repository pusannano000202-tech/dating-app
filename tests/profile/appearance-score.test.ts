import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractSelfAppearanceScore,
  normalizeProfileAppearanceScore,
  resolveSelfAppearanceScore,
} from '../../lib/profile/appearance-score'

test('resolveSelfAppearanceScore uses override before auto and legacy scores', () => {
  assert.deepEqual(
    resolveSelfAppearanceScore({
      auto: 72,
      override: 88,
      legacy: 64,
    }),
    { score: 88, source: 'override' }
  )
})

test('resolveSelfAppearanceScore uses auto before legacy scores', () => {
  assert.deepEqual(
    resolveSelfAppearanceScore({
      auto: 72,
      override: null,
      legacy: 64,
    }),
    { score: 72, source: 'auto' }
  )
})

test('resolveSelfAppearanceScore keeps legacy score when no source score exists', () => {
  assert.deepEqual(
    resolveSelfAppearanceScore({
      auto: null,
      override: null,
      legacy: 64,
    }),
    { score: 64, source: 'legacy' }
  )
})

test('resolveSelfAppearanceScore returns null when every score is invalid', () => {
  assert.equal(
    resolveSelfAppearanceScore({
      auto: 101,
      override: null,
      legacy: Number.NaN,
    }),
    null
  )
})

test('extractSelfAppearanceScore reads direct score fields', () => {
  assert.equal(extractSelfAppearanceScore({ self_appearance_score: 76 }), 76)
  assert.equal(extractSelfAppearanceScore({ appearance_score: 81.25 }), 81.25)
  assert.equal(extractSelfAppearanceScore({ score: '69' }), 69)
})

test('extractSelfAppearanceScore converts normalized direct fields to a 0-100 score', () => {
  assert.equal(extractSelfAppearanceScore({ appearance_score_normalized: 0.82 }), 82)
  assert.equal(extractSelfAppearanceScore({ appearance_score_normalized: 74 }), 74)
})

test('normalizeProfileAppearanceScore accepts legacy 0-1 and current 0-100 scales', () => {
  assert.equal(normalizeProfileAppearanceScore(0.74), 74)
  assert.equal(normalizeProfileAppearanceScore(74), 74)
  assert.equal(normalizeProfileAppearanceScore('88'), 88)
  assert.equal(normalizeProfileAppearanceScore(101), null)
})

test('extractSelfAppearanceScore reads nested AI response payloads', () => {
  assert.equal(extractSelfAppearanceScore({ data: { result: { score: 71 } } }), 71)
  assert.equal(extractSelfAppearanceScore({ result: { self_appearance_score: 67 } }), 67)
})

test('extractSelfAppearanceScore rejects invalid or out-of-range payloads', () => {
  assert.equal(extractSelfAppearanceScore({ score: -1 }), null)
  assert.equal(extractSelfAppearanceScore({ score: 120 }), null)
  assert.equal(extractSelfAppearanceScore({ score: 'high' }), null)
  assert.equal(extractSelfAppearanceScore(null), null)
})
