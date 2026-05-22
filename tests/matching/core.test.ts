import test from 'node:test'
import assert from 'node:assert/strict'

import { MATCHING_CONFIG } from '../../lib/matching/config'
import { isMatchable } from '../../lib/matching/filter'
import { summarizeGroup } from '../../lib/matching/group-summary'
import { pairScore } from '../../lib/matching/score'
import { simulateBatch } from '../../lib/matching/simulate'
import { hasTimeslotOverlap, intersectWeekdaySlots } from '../../lib/matching/time'
import type { GroupMemberSummary, GroupSummary, WeekdayAvailability } from '../../lib/matching/types'

const weekdayOverlap: WeekdayAvailability = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [{ start: '14:00', end: '18:00' }],
  sunday: [],
}

const saturdayEvening: WeekdayAvailability = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [{ start: '16:00', end: '20:00' }],
  sunday: [],
}

const sundayOnly: WeekdayAvailability = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [{ start: '13:00', end: '15:00' }],
}

function group(overrides: Partial<GroupSummary>): GroupSummary {
  return {
    groupId: 'group-a',
    gender: 'male',
    size: 2,
    departmentCodes: ['business'],
    avgSelfAppearanceScore: 70,
    avgAppearanceVector: { warm: 0.9, chic: 0.1 },
    avgPreferredAppearanceVector: { warm: 0.9, chic: 0.1 },
    avgPreferredAxisZVector: { warm: 0.9, chic: 0.1 },
    avgBig5: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    },
    preferredBig5: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    },
    availability: weekdayOverlap,
    excludedGroupIds: [],
    preferenceWeights: {
      appearance: 0.5,
      personality: 0.25,
      time: 0.15,
      scoreBand: 0.05,
      weightAlignment: 0.05,
    },
    avgAge: 22,
    preferredAgeMin: 19,
    preferredAgeMax: 25,
    ...overrides,
  }
}

test('intersectWeekdaySlots returns exact shared time windows', () => {
  const overlap = intersectWeekdaySlots(weekdayOverlap, saturdayEvening)

  assert.deepEqual(overlap.saturday, [{ start: '16:00', end: '18:00' }])
  assert.equal(hasTimeslotOverlap(weekdayOverlap, saturdayEvening), true)
})

test('intersectWeekdaySlots returns no overlap when days do not intersect', () => {
  const overlap = intersectWeekdaySlots(weekdayOverlap, sundayOnly)

  assert.deepEqual(overlap.saturday, [])
  assert.deepEqual(overlap.sunday, [])
  assert.equal(hasTimeslotOverlap(weekdayOverlap, sundayOnly), false)
})

test('isMatchable rejects invalid hard-filter pairs with reason codes', () => {
  const male = group({ groupId: 'male-a', gender: 'male' })
  const female = group({ groupId: 'female-a', gender: 'female', departmentCodes: ['design'] })

  assert.deepEqual(isMatchable(male, group({ groupId: 'male-b', gender: 'male' }), MATCHING_CONFIG), {
    ok: false,
    reason: 'same_gender',
  })
  assert.deepEqual(isMatchable(male, group({ groupId: 'female-b', gender: 'female', size: 3 }), MATCHING_CONFIG), {
    ok: false,
    reason: 'size_mismatch',
  })
  assert.deepEqual(
    isMatchable(
      male,
      group({
        groupId: 'female-c',
        gender: 'female',
        departmentCodes: ['design'],
        avgSelfAppearanceScore: 90,
      }),
      MATCHING_CONFIG,
    ),
    { ok: false, reason: 'score_band_mismatch' },
  )
  assert.deepEqual(
    isMatchable(
      male,
      group({
        groupId: 'female-d',
        gender: 'female',
        departmentCodes: ['design'],
        availability: sundayOnly,
      }),
      MATCHING_CONFIG,
    ),
    { ok: false, reason: 'no_time_overlap' },
  )
  assert.deepEqual(
    isMatchable(group({ excludedGroupIds: ['female-a'] }), female, MATCHING_CONFIG),
    { ok: false, reason: 'excluded_pair' },
  )
})

test('isMatchable passes valid opposite-gender same-size pair with time overlap', () => {
  const result = isMatchable(
    group({ groupId: 'male-a', gender: 'male' }),
    group({ groupId: 'female-a', gender: 'female', departmentCodes: ['design'] }),
    MATCHING_CONFIG,
  )

  assert.deepEqual(result, { ok: true })
})

test('pairScore rewards mutual preference and exposes score breakdown', () => {
  const male = group({
    gender: 'male',
    avgPreferredAxisZVector: { warm: 1, chic: 0 },
    avgAppearanceVector: { warm: 0.2, chic: 0.8 },
  })
  const female = group({
    gender: 'female',
    departmentCodes: ['design'],
    avgPreferredAxisZVector: { warm: 0.2, chic: 0.8 },
    avgAppearanceVector: { warm: 1, chic: 0 },
  })

  const result = pairScore(male, female, MATCHING_CONFIG)

  assert.equal(result.matchable.ok, true)
  assert.ok(result.score > MATCHING_CONFIG.threshold.PAIR_SCORE_MIN)
  assert.equal(Object.keys(result.breakdown).includes('appearanceAB'), true)
  assert.equal(Object.keys(result.breakdown).includes('appearanceBA'), true)
  assert.equal(Object.keys(result.breakdown).includes('asymmetryPenalty'), true)
})

test('pairScore applies an asymmetry penalty when attraction is one-sided', () => {
  const balancedA = group({
    gender: 'male',
    avgPreferredAxisZVector: { warm: 1, chic: 0 },
    avgAppearanceVector: { warm: 1, chic: 0 },
  })
  const balancedB = group({
    gender: 'female',
    departmentCodes: ['design'],
    avgPreferredAxisZVector: { warm: 1, chic: 0 },
    avgAppearanceVector: { warm: 1, chic: 0 },
  })
  const oneSidedB = group({
    gender: 'female',
    departmentCodes: ['design'],
    avgPreferredAxisZVector: { warm: 0, chic: 1 },
    avgAppearanceVector: { warm: 1, chic: 0 },
  })

  const balanced = pairScore(balancedA, balancedB, MATCHING_CONFIG)
  const oneSided = pairScore(balancedA, oneSidedB, MATCHING_CONFIG)

  assert.ok(oneSided.breakdown.asymmetryPenalty > 0)
  assert.ok(oneSided.score < balanced.score)
})

test('summarizeGroup averages member scores and intersects availability', () => {
  const members: GroupMemberSummary[] = [
    {
      userId: 'user-a',
      selfAppearanceScore: 60,
      appearanceVector: { warm: 1, chic: 0 },
      preferredAxisZVector: { warm: 0.8, chic: 0.2 },
      big5: {
        openness: 0.4,
        conscientiousness: 0.6,
        extraversion: 0.5,
        agreeableness: 0.7,
        neuroticism: 0.2,
      },
      preferredBig5: {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
      },
      availability: weekdayOverlap,
      preferenceWeights: {
        appearance: 0.5,
        personality: 0.2,
        time: 0.1,
        scoreBand: 0.1,
        weightAlignment: 0.1,
      },
      age: 22,
      preferredAgeMin: 19,
      preferredAgeMax: 25,
    },
    {
      userId: 'user-b',
      selfAppearanceScore: 80,
      appearanceVector: { warm: 0, chic: 1 },
      preferredAxisZVector: { warm: 0.4, chic: 0.6 },
      big5: {
        openness: 0.6,
        conscientiousness: 0.4,
        extraversion: 0.5,
        agreeableness: 0.3,
        neuroticism: 0.8,
      },
      preferredBig5: {
        openness: 0.7,
        conscientiousness: 0.3,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
      },
      availability: saturdayEvening,
      preferenceWeights: {
        appearance: 0.3,
        personality: 0.4,
        time: 0.1,
        scoreBand: 0.1,
        weightAlignment: 0.1,
      },
      age: 24,
      preferredAgeMin: 21,
      preferredAgeMax: 27,
    },
  ]

  const summary = summarizeGroup({
    groupId: 'group-a',
    gender: 'male',
    size: 2,
    departmentCodes: ['business'],
    excludedGroupIds: [],
    members,
  })

  assert.equal(summary.avgSelfAppearanceScore, 70)
  assert.deepEqual(summary.avgAppearanceVector, { warm: 0.5, chic: 0.5 })
  assert.deepEqual(summary.avgPreferredAxisZVector, { warm: 0.6, chic: 0.4 })
  assert.deepEqual(summary.availability.saturday, [{ start: '16:00', end: '18:00' }])
  assert.equal(summary.preferenceWeights.appearance, 0.4)
  assert.equal(summary.avgAge, 23)
  // 멤버 22 / 24 의 가장 엄격한 하한 = max(19, 21) = 21
  // 멤버 25 / 27 의 가장 엄격한 상한 = min(25, 27) = 25
  assert.equal(summary.preferredAgeMin, 21)
  assert.equal(summary.preferredAgeMax, 25)
})

test('pairScore reflects age fit: same-age boost vs out-of-range decay', () => {
  const a = group({ gender: 'male', avgAge: 22, preferredAgeMin: 19, preferredAgeMax: 25 })
  const bSameAge = group({
    groupId: 'female-a',
    gender: 'female',
    departmentCodes: ['design'],
    avgAge: 22,
    preferredAgeMin: 19,
    preferredAgeMax: 25,
  })
  const bFarAge = group({
    groupId: 'female-b',
    gender: 'female',
    departmentCodes: ['design'],
    avgAge: 30,
    preferredAgeMin: 27,
    preferredAgeMax: 33,
  })

  const same = pairScore(a, bSameAge, MATCHING_CONFIG)
  const far = pairScore(a, bFarAge, MATCHING_CONFIG)

  assert.equal(same.breakdown.ageFit, 1)
  assert.ok(far.breakdown.ageFit < 1)
  assert.ok(far.breakdown.ageFit >= 0)
  assert.ok(same.score > far.score)
})

test('simulateBatch scores only matchable pairs sorted by score descending', () => {
  const male = group({ groupId: 'male-a', gender: 'male', departmentCodes: ['business'] })
  const bestFemale = group({
    groupId: 'female-a',
    gender: 'female',
    departmentCodes: ['design'],
    avgPreferredAxisZVector: { warm: 0.9, chic: 0.1 },
    avgAppearanceVector: { warm: 0.9, chic: 0.1 },
  })
  const blockedFemale = group({
    groupId: 'female-b',
    gender: 'female',
    departmentCodes: ['business'],
  })

  const result = simulateBatch([male, bestFemale, blockedFemale], MATCHING_CONFIG)

  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].groupAId, 'male-a')
  assert.equal(result.candidates[0].groupBId, 'female-a')
  assert.equal(result.rejected.some((row) => row.reason === 'department_blocked'), true)
})
