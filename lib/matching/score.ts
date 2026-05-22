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
  ageFit: 0,
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
  const ageFit = ageFitScore(a, b, config)

  const score = clamp01(
    config.weights.APPEARANCE * appearance +
      config.weights.PERSONALITY * personality +
      config.weights.SCORE_BAND_PROXIMITY * scoreBand +
      config.weights.PREFERENCE_WEIGHT_ALIGN * weightAlignment +
      config.weights.AGE_FIT * ageFit,
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
      ageFit,
    },
  }
}

/**
 * 그룹 평균 나이 + 양 그룹이 명시한 선호 나이 범위로 적합도 산출.
 *
 * 1. 양 그룹 모두 avgAge 가 없으면 중립 1.0 (정보 부족 페널티 X)
 * 2. 각 그룹의 effective tolerance = (preferredAgeMax - preferredAgeMin)/2,
 *    명시 없으면 DEFAULT_AGE_TOLERANCE (3) 사용
 * 3. fit_a = a 의 관점에서 b 의 평균 나이가 a 의 선호 범위 안인지
 *      안: 1.0
 *      밖: max(0, 1 - excess / SOFT_AGE_DECAY)
 * 4. fit_b 동일하게 계산
 * 5. 최종 ageFit = (fit_a + fit_b) / 2  (양방향 평균)
 */
function ageFitScore(
  a: GroupSummary,
  b: GroupSummary,
  config: MatchingConfig,
): number {
  if (a.avgAge == null || b.avgAge == null) return 1.0
  const tolDef = config.ageFit.DEFAULT_AGE_TOLERANCE
  const decay = config.ageFit.SOFT_AGE_DECAY

  const fitOneSide = (
    self: GroupSummary,
    opp: GroupSummary,
  ): number => {
    if (self.avgAge == null || opp.avgAge == null) return 1.0
    let minPref = self.preferredAgeMin
    let maxPref = self.preferredAgeMax
    if (minPref == null) minPref = Math.round(self.avgAge) - tolDef
    if (maxPref == null) maxPref = Math.round(self.avgAge) + tolDef
    if (minPref > maxPref) {
      const swap = minPref
      minPref = maxPref
      maxPref = swap
    }
    if (opp.avgAge >= minPref && opp.avgAge <= maxPref) return 1.0
    const excess = opp.avgAge < minPref ? (minPref - opp.avgAge) : (opp.avgAge - maxPref)
    return Math.max(0, 1 - excess / decay)
  }

  return clamp01((fitOneSide(a, b) + fitOneSide(b, a)) / 2)
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
