import test from 'node:test'
import assert from 'node:assert/strict'

import { allocateTonightTeams } from '../../lib/matching/tonight-ranked/team-allocation-core'
import type {
  TonightActivityTuple,
  TonightAllocationApplicant,
} from '../../lib/matching/tonight-ranked/contracts'

const ACTIVITIES = ['board-game', 'casual-pub', 'night-walk'] as const satisfies TonightActivityTuple

function applicant(
  applicantId: string,
  sex: 'male' | 'female',
  friendBundleId: string | null = null,
): TonightAllocationApplicant {
  return {
    applicantId,
    sex,
    age: sex === 'male' ? 23 : 21,
    appearanceScoreBp: 8_000,
    activityRanking: ACTIVITIES,
    friendBundleId,
    roundNamespace: 'tonight:test-round',
    schoolScopeKey: 'pnu_self_selected',
    departmentKey: `department-${applicantId}`,
    acceptedCompanionApplicationId: friendBundleId,
  }
}

function men(): TonightAllocationApplicant[] {
  return [applicant('m1', 'male'), applicant('m2', 'male'), applicant('m3', 'male')]
}

test('forbids a 2M3F team', () => {
  const result = allocateTonightTeams({
    activities: ACTIVITIES,
    applicants: [
      applicant('m1', 'male'),
      applicant('m2', 'male'),
      applicant('f1', 'female'),
      applicant('f2', 'female'),
      applicant('f3', 'female'),
    ],
  })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 0)
  assert.equal(result.waitlistedUnits.length, 5)
})

test('allows 3M3F only when all three women are one atomic friend bundle', () => {
  const result = allocateTonightTeams({
    activities: ACTIVITIES,
    applicants: [
      ...men(),
      applicant('f1', 'female', 'women-three'),
      applicant('f2', 'female', 'women-three'),
      applicant('f3', 'female', 'women-three'),
    ],
  })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 1)
  assert.deepEqual(result.teams[0].memberIds, ['f1', 'f2', 'f3', 'm1', 'm2', 'm3'])
  assert.deepEqual(result.teams[0].sexCounts, { male: 3, female: 3 })
  assert.equal(result.teams[0].quality.pairCount, 9)
  assert.equal(result.waitlistedUnits.length, 0)
})

test('does not combine three unrelated women into a 3M3F team', () => {
  const result = allocateTonightTeams({
    activities: ACTIVITIES,
    applicants: [
      ...men(),
      applicant('f1', 'female'),
      applicant('f2', 'female'),
      applicant('f3', 'female'),
    ],
  })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 1)
  assert.equal(result.teams[0].memberIds.length, 5)
  assert.deepEqual(result.teams[0].sexCounts, { male: 3, female: 2 })
  assert.equal(result.waitlistedUnits.length, 1)
})

test('does not combine a two-woman bundle and a solo woman into a 3M3F team', () => {
  const result = allocateTonightTeams({
    activities: ACTIVITIES,
    applicants: [
      ...men(),
      applicant('f1', 'female', 'women-two'),
      applicant('f2', 'female', 'women-two'),
      applicant('f3', 'female'),
    ],
  })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 1)
  assert.deepEqual(result.teams[0].memberIds, ['f1', 'f2', 'm1', 'm2', 'm3'])
  assert.deepEqual(result.teams[0].sexCounts, { male: 3, female: 2 })
  assert.deepEqual(result.waitlistedUnits, [
    { memberIds: ['f3'], reason: 'no_feasible_team' },
  ])
})
