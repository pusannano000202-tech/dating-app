import type { MatchingConfig } from './config'
import { isMatchable } from './filter'
import { countOverlapDays, intersectWeekdaySlots } from './time'
import type {
  Big5Vector,
  GroupSummary,
  MatchingPreferenceWeights,
  NumericVector,
  PairScore,
  PairScoreBreakdown,
} from './types'

const EMPTY_BREAKDOWN: PairScoreBreakdown = {
  appearanceAB: 0,
  appearanceBA: 0,
  appearance: 0,
  personality: 0,
  time: 0,
  scoreBand: 0,
  weightAlignment: 0,
  asymmetryPenalty: 0,
}

export function pairScore(
  a: GroupSummary,
  b: GroupSummary,
  config: MatchingConfig,
): PairScore {
  const matchable = isMatchable(a, b, config)
  if (!matchable.ok) {
    return {
      groupAId: a.groupId,
      groupBId: b.groupId,
      score: 0,
      matchable,
      breakdown: EMPTY_BREAKDOWN,
    }
  }

  const appearanceAB = cosineSimilarity(a.avgPreferredAxisZVector!, b.avgAppearanceVector!)
  const appearanceBA = cosineSimilarity(b.avgPreferredAxisZVector!, a.avgAppearanceVector!)
  const asymmetryPenalty = Math.abs(appearanceAB - appearanceBA) * config.threshold.ASYMMETRY_PENALTY
  const appearance = clamp01((appearanceAB + appearanceBA) / 2 - asymmetryPenalty)
  const personality = (
    big5Compatibility(a.preferredBig5!, b.avgBig5!) +
    big5Compatibility(b.preferredBig5!, a.avgBig5!)
  ) / 2
  const time = clamp01(countOverlapDays(intersectWeekdaySlots(a.availability, b.availability)) / 7)
  const scoreBand = clamp01(
    1 -
      Math.abs(a.avgSelfAppearanceScore! - b.avgSelfAppearanceScore!) /
        config.hardFilter.SCORE_BAND_WIDTH,
  )
  const weightAlignment = preferenceWeightAlignment(a.preferenceWeights, b.preferenceWeights)

  const score = clamp01(
    config.weights.APPEARANCE * appearance +
      config.weights.PERSONALITY * personality +
      config.weights.SCORE_BAND_PROXIMITY * scoreBand +
      config.weights.PREFERENCE_WEIGHT_ALIGN * weightAlignment,
  )

  return {
    groupAId: a.groupId,
    groupBId: b.groupId,
    score,
    matchable,
    breakdown: {
      appearanceAB,
      appearanceBA,
      appearance,
      personality,
      time,
      scoreBand,
      weightAlignment,
      asymmetryPenalty,
    },
  }
}

export function cosineSimilarity(a: NumericVector, b: NumericVector): number {
  const keys = Object.keys(a).filter((key) => key in b)
  let dot = 0
  let aMagnitude = 0
  let bMagnitude = 0

  for (const key of keys) {
    dot += a[key] * b[key]
    aMagnitude += a[key] * a[key]
    bMagnitude += b[key] * b[key]
  }

  if (aMagnitude === 0 || bMagnitude === 0) return 0
  return clamp01(dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude)))
}

function big5Compatibility(preferred: Big5Vector, actual: Big5Vector): number {
  const keys = Object.keys(preferred) as (keyof Big5Vector)[]
  const distance = keys.reduce((sum, key) => sum + Math.abs(preferred[key] - actual[key]), 0)
  return clamp01(1 - distance / keys.length)
}

function preferenceWeightAlignment(
  a: MatchingPreferenceWeights,
  b: MatchingPreferenceWeights,
): number {
  const keys = Object.keys(a) as (keyof MatchingPreferenceWeights)[]
  const distance = keys.reduce((sum, key) => sum + Math.abs(a[key] - b[key]), 0)
  return clamp01(1 - distance / keys.length)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
