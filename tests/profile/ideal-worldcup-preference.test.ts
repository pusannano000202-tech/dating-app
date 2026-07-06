import test from 'node:test'
import assert from 'node:assert/strict'

import type { IdealImageItem } from '../../lib/appearance/metadata'
import {
  computePreference,
  ROUND_WEIGHT,
  type ChoiceLog,
  type RoundLabel,
} from '../../lib/appearance/preference'
import {
  type AppearanceVector,
  neutralVector,
  zeroVector,
} from '../../lib/appearance/vector'

function vector(overrides: Record<string, number>): AppearanceVector {
  return {
    ...neutralVector('female'),
    ...overrides,
  }
}

function item(
  id: string,
  finalBucket: string,
  appearanceVector: AppearanceVector,
): IdealImageItem {
  return {
    id,
    gender: 'female',
    file: '',
    status: 'active',
    generation_round: 1,
    target: {
      score: 70,
      type: finalBucket,
      subtype: '',
      prompt: '',
    },
    measured: {
      subject_gender: 'female',
      appearance_score_normalized: 70,
      score_confidence: 1,
      primary_type: finalBucket,
      secondary_types: [],
      appearance_vector: appearanceVector,
    },
    bucket_scores: null,
    final_bucket: finalBucket,
    matching_vector_source: 'measured.appearance_vector',
    review: {
      target_measured_mismatch: false,
      accepted_reason: '',
      rejection_reason: '',
    },
  }
}

function choice(
  round: RoundLabel,
  matchIndex: number,
  winner: IdealImageItem,
  loser: IdealImageItem,
): ChoiceLog {
  const winnerVector = winner.measured!.appearance_vector
  const loserVector = loser.measured!.appearance_vector
  const delta: AppearanceVector = {}
  for (const axis of Object.keys(winnerVector)) {
    delta[axis] = (winnerVector[axis] ?? 0) - (loserVector[axis] ?? 0)
  }

  return {
    round,
    match_index: matchIndex,
    winner_id: winner.id,
    loser_id: loser.id,
    winner_vector: winnerVector,
    loser_vector: loserVector,
    choice_delta_vector: delta,
    weight: ROUND_WEIGHT[round],
    created_at: '2026-07-06T00:00:00.000Z',
  }
}

test('ideal worldcup preference follows decisive late picks instead of early forced bucket noise', () => {
  const pure = item(
    'pure-noise',
    '청순/자연형',
    vector({
      청순함: 0.95,
      자연스러움: 0.92,
      부드러운인상: 0.9,
      스타일리시함: 0.2,
      화려함: 0.2,
    }),
  )
  const stylish = item(
    'stylish-final',
    '스타일리시/화려형',
    vector({
      스타일리시함: 0.96,
      화려함: 0.92,
      시크함: 0.88,
      청순함: 0.25,
      자연스러움: 0.3,
    }),
  )
  const neutral = item('neutral-loser', '따뜻한/부드러운형', neutralVector('female'))

  const earlyForcedPureChoices = Array.from({ length: 20 }, (_, index) =>
    choice('64강', index, pure, neutral),
  )
  const decisiveStylishChoices = [
    choice('8강', 0, stylish, pure),
    choice('4강', 0, stylish, pure),
    choice('결승', 0, stylish, pure),
  ]

  const result = computePreference({
    gender: 'female',
    choiceLogs: [...earlyForcedPureChoices, ...decisiveStylishChoices],
    poolMeanVector: zeroVector('female'),
    poolAxisStats: {},
    winnerItems: [pure, stylish, neutral],
    finalWinnerId: stylish.id,
  })

  const topBucket = Object.entries(result.preferred_bucket_weights)
    .sort((a, b) => b[1] - a[1])[0]?.[0]

  assert.equal(topBucket, '스타일리시/화려형')
  assert.ok(
    result.preferred_appearance_vector.스타일리시함 >
      result.preferred_appearance_vector.청순함,
  )
})
