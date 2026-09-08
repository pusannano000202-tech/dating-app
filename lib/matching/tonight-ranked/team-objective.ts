import { hasDepartmentAssignmentConflict } from '../department-identity'
import type {
  TonightAllocationApplicant,
  TonightPairQuality,
  TonightSex,
  TonightTeamObjective,
} from './contracts'

export const TONIGHT_APPEARANCE_WEIGHT_BP = 7_500
export const TONIGHT_AGE_WEIGHT_BP = 2_500
export const TONIGHT_MAX_OPPOSITE_SEX_AGE_GAP = 5
export const TONIGHT_IDEAL_MALE_AGE_OFFSET = 2
export const TONIGHT_AGE_DEVIATION_PENALTY_BP = 1_250

const BASIS_POINTS = 10_000

function clampBasisPoints(value: number): number {
  return Math.max(0, Math.min(BASIS_POINTS, Math.trunc(value)))
}

function roundWeightedBasisPoints(appearanceBp: number, ageBp: number): number {
  const numerator =
    appearanceBp * TONIGHT_APPEARANCE_WEIGHT_BP + ageBp * TONIGHT_AGE_WEIGHT_BP
  return Math.floor((numerator + BASIS_POINTS / 2) / BASIS_POINTS)
}

function asMaleFemalePair(
  left: TonightAllocationApplicant,
  right: TonightAllocationApplicant,
): { male: TonightAllocationApplicant; female: TonightAllocationApplicant } | null {
  if (left.sex === right.sex) return null
  return left.sex === 'male'
    ? { male: left, female: right }
    : { male: right, female: left }
}

/**
 * Scores one opposite-sex pair using integer arithmetic only.
 *
 * The hard age boundary is inclusive at five years and rejects six or more.
 * Within that boundary, male age = female age + 2 is the 10,000bp ideal.
 */
export function scoreOppositeSexPair(
  left: TonightAllocationApplicant,
  right: TonightAllocationApplicant,
): TonightPairQuality | null {
  const pair = asMaleFemalePair(left, right)
  if (!pair) return null

  const absoluteAgeGap = Math.abs(pair.male.age - pair.female.age)
  if (absoluteAgeGap > TONIGHT_MAX_OPPOSITE_SEX_AGE_GAP) return null

  const appearanceCompatibilityBp = clampBasisPoints(
    BASIS_POINTS - Math.abs(pair.male.appearanceScoreBp - pair.female.appearanceScoreBp),
  )
  const maleAgeOffset = pair.male.age - pair.female.age
  const ageCompatibilityBp = clampBasisPoints(
    BASIS_POINTS -
      Math.abs(maleAgeOffset - TONIGHT_IDEAL_MALE_AGE_OFFSET) *
        TONIGHT_AGE_DEVIATION_PENALTY_BP,
  )

  return {
    appearanceCompatibilityBp,
    ageCompatibilityBp,
    qualityBp: roundWeightedBasisPoints(appearanceCompatibilityBp, ageCompatibilityBp),
  }
}

export function countTonightSexes(
  members: readonly TonightAllocationApplicant[],
): Record<TonightSex, number> {
  let male = 0
  let female = 0
  for (const member of members) {
    if (member.sex === 'male') male += 1
    else female += 1
  }
  return { male, female }
}

export function isExactTonightSexComposition(
  counts: Readonly<Record<TonightSex, number>>,
): boolean {
  return counts.male === 3 && counts.female === 2
}

function hasAtomicThreeWomanBundle(
  members: readonly TonightAllocationApplicant[],
): boolean {
  const women = members.filter((member) => member.sex === 'female')
  if (women.length !== 3) return false

  const bundleId = women[0].friendBundleId
  return (
    bundleId !== null &&
    women.every((member) => member.friendBundleId === bundleId) &&
    members.filter((member) => member.friendBundleId === bundleId).length === 3
  )
}

function isExactTonightTeamComposition(
  members: readonly TonightAllocationApplicant[],
): boolean {
  const counts = countTonightSexes(members)
  if (members.length === 5) return isExactTonightSexComposition(counts)
  return (
    members.length === 6 &&
    counts.male === 3 &&
    counts.female === 3 &&
    hasAtomicThreeWomanBundle(members)
  )
}

export function isTonightPartialTeamFeasible(
  members: readonly TonightAllocationApplicant[],
): boolean {
  if (members.length > 6) return false
  if (hasDepartmentAssignmentConflict(members)) return false
  const counts = countTonightSexes(members)
  if (counts.male > 3 || counts.female > 3) return false

  const canReachNormalTeam =
    members.length <= 5 && counts.male <= 3 && counts.female <= 2
  const canReachBundleException =
    counts.male <= 3 &&
    counts.female <= 3 &&
    (counts.female < 3 || hasAtomicThreeWomanBundle(members))
  if (!canReachNormalTeam && !canReachBundleException) return false

  for (let leftIndex = 0; leftIndex < members.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
      const left = members[leftIndex]
      const right = members[rightIndex]
      if (left.sex !== right.sex && scoreOppositeSexPair(left, right) === null) return false
    }
  }

  return true
}

/** Returns null unless all hard team constraints are satisfied. */
export function scoreTonightTeamObjective(
  members: readonly TonightAllocationApplicant[],
): TonightTeamObjective | null {
  if (!isExactTonightTeamComposition(members)) return null
  if (!isTonightPartialTeamFeasible(members)) return null

  const pairScores: number[] = []
  for (let leftIndex = 0; leftIndex < members.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
      if (members[leftIndex].sex === members[rightIndex].sex) continue
      const score = scoreOppositeSexPair(members[leftIndex], members[rightIndex])
      if (!score) return null
      pairScores.push(score.qualityBp)
    }
  }

  const totalPairQualityBp = pairScores.reduce((sum, score) => sum + score, 0)
  const signature = JSON.stringify(
    members
      .map((member) => member.applicantId)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
  )

  return {
    minimumPairQualityBp: Math.min(...pairScores),
    totalPairQualityBp,
    averagePairQualityBp: Math.floor(
      (totalPairQualityBp + Math.floor(pairScores.length / 2)) / pairScores.length,
    ),
    pairCount: pairScores.length,
    signature,
  }
}
