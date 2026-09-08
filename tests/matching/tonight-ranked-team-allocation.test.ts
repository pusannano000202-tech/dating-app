import test from 'node:test'
import assert from 'node:assert/strict'

import {
  allocateTonightTeams,
  resolveTonightTeamActivity,
} from '../../lib/matching/tonight-ranked/team-allocation-core'
import {
  scoreOppositeSexPair,
  scoreTonightTeamObjective,
} from '../../lib/matching/tonight-ranked/team-objective'
import type {
  TonightActivityTuple,
  TonightAllocationApplicant,
} from '../../lib/matching/tonight-ranked/contracts'

const ACTIVITIES = ['board-game', 'casual-pub', 'night-walk'] as const satisfies TonightActivityTuple

function applicant(
  applicantId: string,
  sex: 'male' | 'female',
  age: number,
  appearanceScoreBp: number,
  activityRanking: TonightActivityTuple = ACTIVITIES,
  friendBundleId: string | null = null,
): TonightAllocationApplicant {
  return {
    applicantId,
    sex,
    age,
    appearanceScoreBp,
    activityRanking,
    friendBundleId,
    roundNamespace: 'tonight:test-round',
    schoolScopeKey: 'pnu_self_selected',
    departmentKey: `department-${applicantId}`,
    acceptedCompanionApplicationId: friendBundleId,
  }
}

function balancedFive(prefix = 'a'): TonightAllocationApplicant[] {
  return [
    applicant(`${prefix}-m1`, 'male', 23, 8100),
    applicant(`${prefix}-m2`, 'male', 24, 7900),
    applicant(`${prefix}-m3`, 'male', 23, 8050),
    applicant(`${prefix}-f1`, 'female', 21, 8000),
    applicant(`${prefix}-f2`, 'female', 22, 7800),
  ]
}

test('allocates the normal exact five-person 3M2F team and resolves its activity after allocation', () => {
  const applicants = balancedFive()
  applicants[0] = applicant('a-m1', 'male', 23, 8100, ['casual-pub', 'board-game', 'night-walk'])
  applicants[1] = applicant('a-m2', 'male', 24, 7900, ['casual-pub', 'night-walk', 'board-game'])

  const result = allocateTonightTeams({ activities: ACTIVITIES, applicants })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 1)
  assert.deepEqual(result.teams[0].memberIds, ['a-f1', 'a-f2', 'a-m1', 'a-m2', 'a-m3'])
  assert.deepEqual(result.teams[0].sexCounts, { male: 3, female: 2 })
  assert.equal(result.teams[0].activity.activityId, 'board-game')
  assert.equal(result.waitlistedUnits.length, 0)
  assert.equal(result.diagnostics.passesCompleted, 4)
})

test('supports the exact 3M2F composition', () => {
  const result = allocateTonightTeams({
    activities: ACTIVITIES,
    applicants: [
      applicant('m1', 'male', 22, 7000),
      applicant('m2', 'male', 23, 7100),
      applicant('m3', 'male', 24, 7200),
      applicant('f1', 'female', 20, 7050),
      applicant('f2', 'female', 21, 7150),
    ],
  })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 1)
  assert.deepEqual(result.teams[0].sexCounts, { male: 3, female: 2 })
})

test('keeps friend bundles atomic in teams and in the waitlist', () => {
  const applicants = [
    applicant('m1', 'male', 23, 8000, ACTIVITIES, 'friends-a'),
    applicant('m2', 'male', 24, 7900, ACTIVITIES, 'friends-a'),
    applicant('m3', 'male', 23, 8100),
    applicant('f1', 'female', 21, 8050),
    applicant('f2', 'female', 22, 7950),
    applicant('left-m', 'male', 23, 6000, ACTIVITIES, 'friends-left'),
    applicant('left-f', 'female', 21, 6000, ACTIVITIES, 'friends-left'),
  ]

  const result = allocateTonightTeams({ activities: ACTIVITIES, applicants })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 1)
  assert.equal(result.teams[0].memberIds.includes('m1'), true)
  assert.equal(result.teams[0].memberIds.includes('m2'), true)
  assert.deepEqual(result.waitlistedUnits, [
    {
      memberIds: ['left-f', 'left-m'],
      reason: 'no_feasible_team',
    },
  ])
})

test('maximizes completed teams before quality and supports arbitrary pool sizes', () => {
  const applicants: TonightAllocationApplicant[] = []
  for (let team = 0; team < 11; team += 1) {
    applicants.push(...balancedFive(`team-${String(team).padStart(2, '0')}`))
  }
  applicants.push(
    applicant('remainder-m', 'male', 23, 5000, ACTIVITIES, 'remainder'),
    applicant('remainder-f', 'female', 21, 5000, ACTIVITIES, 'remainder'),
  )

  const result = allocateTonightTeams({ activities: ACTIVITIES, applicants })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 11)
  assert.equal(result.teams.flatMap((team) => team.memberIds).length, 55)
  assert.deepEqual(result.waitlistedUnits, [
    {
      memberIds: ['remainder-f', 'remainder-m'],
      reason: 'no_feasible_team',
    },
  ])
})

test('hard-rejects every team containing an opposite-sex age gap of six or more', () => {
  const rejected = allocateTonightTeams({
    activities: ACTIVITIES,
    applicants: [
      applicant('m1', 'male', 27, 8000),
      applicant('m2', 'male', 27, 8000),
      applicant('m3', 'male', 27, 8000),
      applicant('f1', 'female', 21, 8000),
      applicant('f2', 'female', 22, 8000),
    ],
  })
  const accepted = allocateTonightTeams({
    activities: ACTIVITIES,
    applicants: [
      applicant('m1', 'male', 26, 8000),
      applicant('m2', 'male', 26, 8000),
      applicant('m3', 'male', 26, 8000),
      applicant('f1', 'female', 21, 8000),
      applicant('f2', 'female', 22, 8000),
    ],
  })

  assert.equal(rejected.status, 'allocated')
  assert.equal(rejected.teams.length, 0)
  assert.equal(rejected.waitlistedUnits.length, 5)
  assert.equal(accepted.status, 'allocated')
  assert.equal(accepted.teams.length, 1)
})

test('uses stable basis-point pair scoring with 75% appearance and 25% male-plus-two age fit', () => {
  const ideal = scoreOppositeSexPair(
    applicant('m', 'male', 23, 8000),
    applicant('f', 'female', 21, 8000),
  )
  const ageOffIdeal = scoreOppositeSexPair(
    applicant('m', 'male', 21, 8000),
    applicant('f', 'female', 23, 8000),
  )
  const appearanceOffIdeal = scoreOppositeSexPair(
    applicant('m', 'male', 23, 10000),
    applicant('f', 'female', 21, 6000),
  )

  assert.deepEqual(ideal, {
    appearanceCompatibilityBp: 10000,
    ageCompatibilityBp: 10000,
    qualityBp: 10000,
  })
  assert.equal(ageOffIdeal?.ageCompatibilityBp, 5000)
  assert.equal(ageOffIdeal?.qualityBp, 8750)
  assert.equal(appearanceOffIdeal?.appearanceCompatibilityBp, 6000)
  assert.equal(appearanceOffIdeal?.qualityBp, 7000)
  assert.equal(scoreOppositeSexPair(applicant('m', 'male', 27, 8000), applicant('f', 'female', 21, 8000)), null)
})

test('scores the team by its minimum opposite-sex pair first and an integer total', () => {
  const objective = scoreTonightTeamObjective(balancedFive())

  assert.notEqual(objective, null)
  assert.equal(Number.isInteger(objective!.minimumPairQualityBp), true)
  assert.equal(Number.isInteger(objective!.totalPairQualityBp), true)
  assert.equal(objective!.pairCount, 6)
  assert.equal(objective!.totalPairQualityBp >= objective!.minimumPairQualityBp * 6, true)
})

test('applies 3-2-1 Borda after team allocation and breaks a points tie by first choices', () => {
  const ballots: TonightAllocationApplicant[] = [
    applicant('v1', 'male', 23, 8000, ['board-game', 'casual-pub', 'night-walk']),
    applicant('v2', 'male', 23, 8000, ['board-game', 'casual-pub', 'night-walk']),
    applicant('v3', 'female', 21, 8000, ['board-game', 'casual-pub', 'night-walk']),
    applicant('v4', 'female', 21, 8000, ['casual-pub', 'board-game', 'night-walk']),
    applicant('v5', 'female', 21, 8000, ['casual-pub', 'night-walk', 'board-game']),
  ]

  const activity = resolveTonightTeamActivity(ballots, ACTIVITIES)

  assert.equal(activity.activityId, 'board-game')
  assert.deepEqual(activity.totals, [
    { activityId: 'board-game', points: 12, firstChoiceCount: 3, secondChoiceCount: 1 },
    { activityId: 'casual-pub', points: 12, firstChoiceCount: 2, secondChoiceCount: 3 },
    { activityId: 'night-walk', points: 6, firstChoiceCount: 0, secondChoiceCount: 1 },
  ])
})

test('produces the same allocation and stable signature regardless of input ordering', () => {
  const applicants = [
    ...balancedFive('first'),
    ...balancedFive('second'),
  ]

  const forward = allocateTonightTeams({ activities: ACTIVITIES, applicants })
  const reverse = allocateTonightTeams({ activities: ACTIVITIES, applicants: [...applicants].reverse() })

  assert.equal(forward.status, 'allocated')
  assert.equal(reverse.status, 'allocated')
  assert.equal(forward.allocationSignature, reverse.allocationSignature)
  assert.deepEqual(forward.teams, reverse.teams)
  assert.deepEqual(forward.waitlistedUnits, reverse.waitlistedUnits)
})

test('never projects individual age, appearance, friend references, or ballots in the result', () => {
  const result = allocateTonightTeams({
    activities: ACTIVITIES,
    applicants: balancedFive().map((row, index) => ({
      ...row,
      friendBundleId: index < 2 ? 'private-friend-ref' : null,
    })),
  })

  const forbiddenKeys = new Set(['age', 'appearanceScoreBp', 'friendBundleId', 'activityRanking'])
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(forbiddenKeys.has(key), false, `result leaked private key: ${key}`)
      visit(nested)
    }
  }

  visit(result)
})
