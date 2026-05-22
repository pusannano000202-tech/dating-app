import { intersectWeekdaySlots } from './time'
import type {
  Big5Vector,
  GroupMemberSummary,
  GroupSummary,
  GroupSummaryInput,
  MatchingPreferenceWeights,
  NumericVector,
  WeekdayAvailability,
} from './types'

export function summarizeGroup(input: GroupSummaryInput): GroupSummary {
  if (input.members.length === 0) {
    throw new Error('summarizeGroup requires at least one member')
  }

  return {
    groupId: input.groupId,
    gender: input.gender,
    size: input.size,
    departmentCodes: input.departmentCodes,
    avgSelfAppearanceScore: mean(input.members.map((member) => member.selfAppearanceScore)),
    avgAppearanceVector: meanNumericVector(input.members.map((member) => member.appearanceVector)),
    avgPreferredAppearanceVector: meanNumericVector(input.members.map((member) => member.preferredAxisZVector)),
    avgPreferredAxisZVector: meanNumericVector(input.members.map((member) => member.preferredAxisZVector)),
    avgBig5: meanBig5(input.members.map((member) => member.big5)),
    preferredBig5: meanBig5(input.members.map((member) => member.preferredBig5)),
    availability: intersectAllAvailability(input.members),
    excludedGroupIds: input.excludedGroupIds,
    preferenceWeights: meanPreferenceWeights(input.members.map((member) => member.preferenceWeights)),
    avgAge: mean(input.members.map((member) => member.age)),
    // 그룹 전체를 만족시키려면 가장 엄격한 멤버 기준 (max of mins, min of maxes)
    preferredAgeMin: aggregateAgePref(
      input.members.map((member) => member.preferredAgeMin),
      'max',
    ),
    preferredAgeMax: aggregateAgePref(
      input.members.map((member) => member.preferredAgeMax),
      'min',
    ),
  }
}

function aggregateAgePref(values: (number | null)[], mode: 'max' | 'min'): number | null {
  const present = values.filter((v): v is number => v != null)
  if (present.length === 0) return null
  return mode === 'max' ? Math.max(...present) : Math.min(...present)
}

function intersectAllAvailability(members: GroupMemberSummary[]): WeekdayAvailability {
  return members
    .slice(1)
    .reduce(
      (availability, member) => intersectWeekdaySlots(availability, member.availability),
      members[0].availability,
    )
}

function mean(values: number[]): number {
  return round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function meanNumericVector(vectors: NumericVector[]): NumericVector {
  const keys = [...new Set(vectors.flatMap((vector) => Object.keys(vector)))]
  const out: NumericVector = {}
  for (const key of keys) {
    out[key] = mean(vectors.map((vector) => vector[key] ?? 0))
  }
  return out
}

function meanBig5(values: Big5Vector[]): Big5Vector {
  return {
    openness: mean(values.map((value) => value.openness)),
    conscientiousness: mean(values.map((value) => value.conscientiousness)),
    extraversion: mean(values.map((value) => value.extraversion)),
    agreeableness: mean(values.map((value) => value.agreeableness)),
    neuroticism: mean(values.map((value) => value.neuroticism)),
  }
}

function meanPreferenceWeights(values: MatchingPreferenceWeights[]): MatchingPreferenceWeights {
  return {
    appearance: mean(values.map((value) => value.appearance)),
    personality: mean(values.map((value) => value.personality)),
    time: mean(values.map((value) => value.time)),
    scoreBand: mean(values.map((value) => value.scoreBand)),
    weightAlignment: mean(values.map((value) => value.weightAlignment)),
  }
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}
