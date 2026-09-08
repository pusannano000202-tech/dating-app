import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  buildTonightPublishAssignments,
  parseTonightAllocatorRpcPayload,
} from '../../lib/matching/tonight-ranked/automation'
import { allocateTonightTeams } from '../../lib/matching/tonight-ranked/team-allocation-core'
import type {
  TonightAllocatedTeam,
  TonightAllocationResult,
} from '../../lib/matching/tonight-ranked/contracts'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`

function payload() {
  const activities = [id(1), id(2), id(3)]
  return {
    round: {
      id: id(10),
      revision: 4,
      market_code: 'PNU',
      service_date: '2026-09-03',
      capacity_lock_at: '2026-09-03T18:30:00+09:00',
      allocation_publish_at: '2026-09-03T18:32:00+09:00',
      deposit_due_at: '2026-09-03T18:45:00+09:00',
    },
    activities: activities.map((activityId, index) => ({
      id: activityId,
      slot: index + 1,
      kind: ['bar', 'board_game', 'cafe'][index],
      duration_minutes: [60, 90, 75][index],
    })),
    capacities: activities.map((activityId, index) => ({
      id: id(20 + index),
      activity_id: activityId,
      team_capacity: 1,
      reserved_team_count: 0,
      max_team_headcount: 5,
      revision: 0,
    })),
    applications: Array.from({ length: 5 }, (_, index) => ({
      application_id: id(100 + index),
      bundle_id: id(200 + index),
      bundle_size: 1,
      school_scope_key: 'pnu_self_selected',
      department_key: `department-${index}`,
      age_years: 22 + index,
      gender_code: index < 3 ? 'male' : 'female',
      appearance_score: 71.234 + index,
      bundle_member_ready: true,
      choices: activities.map((activityId, rank) => ({ activity_id: activityId, rank: rank + 1 })),
    })),
  }
}

function expandedPayload(
  applicantCount: number,
  maleCount: number,
  bundleGroups: readonly (readonly number[])[] = [],
) {
  const raw = payload()
  const bundleByApplicant = new Map<number, { id: string; size: number }>()
  bundleGroups.forEach((memberIndexes, bundleIndex) => {
    const bundle = { id: id(50_000 + bundleIndex), size: memberIndexes.length }
    memberIndexes.forEach((memberIndex) => bundleByApplicant.set(memberIndex, bundle))
  })
  raw.capacities.forEach((capacity) => {
    capacity.team_capacity = 100
  })
  raw.applications = Array.from({ length: applicantCount }, (_, index) => {
    const bundle = bundleByApplicant.get(index) ?? { id: id(60_000 + index), size: 1 }
    return {
      application_id: id(10_000 + index),
      bundle_id: bundle.id,
      bundle_size: bundle.size,
      school_scope_key: 'pnu_self_selected',
      department_key: `department-${index}`,
      age_years: 22,
      gender_code: index < maleCount ? 'male' : 'female',
      appearance_score: 75,
      bundle_member_ready: true,
      choices: raw.activities.map((activity) => ({
        activity_id: activity.id,
        rank: activity.slot,
      })),
    }
  })
  return raw
}

function setTotalAvailableTeamCapacity(
  raw: ReturnType<typeof expandedPayload>,
  teamCapacity: number,
) {
  raw.capacities.forEach((capacity, index) => {
    capacity.team_capacity = index === 0 ? teamCapacity : 0
    capacity.reserved_team_count = 0
  })
  return raw
}

function allocatedResult(
  parsed: ReturnType<typeof parseTonightAllocatorRpcPayload>,
  teamMemberIndexes: readonly (readonly number[])[],
): TonightAllocationResult {
  const assignedIds = new Set(teamMemberIndexes.flat().map(
    (index) => parsed.allocationInput.applicants[index].applicantId,
  ))
  const totals = parsed.allocationInput.activities.map((activityId, index) => ({
    activityId,
    points: 15 - index * 5,
    firstChoiceCount: index === 0 ? 5 : 0,
    secondChoiceCount: index === 1 ? 5 : 0,
  }))
  const teams: TonightAllocatedTeam[] = teamMemberIndexes.map((indexes) => {
    const members = indexes.map((index) => parsed.allocationInput.applicants[index])
    return {
      memberIds: members.map((member) => member.applicantId),
      sexCounts: {
        male: members.filter((member) => member.sex === 'male').length,
        female: members.filter((member) => member.sex === 'female').length,
      },
      activity: {
        activityId: parsed.allocationInput.activities[0],
        totals,
      },
      quality: {
        minimumPairQualityBp: 0,
        totalPairQualityBp: 0,
        averagePairQualityBp: 0,
        pairCount: 10,
      },
    }
  })
  const waitlistedUnits = parsed.allocationInput.applicants
    .filter((applicant) => !assignedIds.has(applicant.applicantId))
    .map((applicant) => ({
      memberIds: [applicant.applicantId],
      reason: 'no_feasible_team' as const,
    }))
  return {
    status: 'allocated',
    teams,
    waitlistedUnits,
    issues: [],
    allocationSignature: 'test-allocation',
    diagnostics: {
      evaluations: 0,
      maxEvaluations: 1,
      passesCompleted: 1,
      repairAttempts: 0,
    },
  }
}

const fourTeams = [
  [0, 1, 2, 15, 16],
  [3, 4, 5, 17, 18],
  [6, 7, 8, 19, 20],
  [9, 10, 11, 21, 22],
] as const

const ninetySixLargeBundledTeams = Array.from({ length: 96 }, (_, index) => [
  index * 3,
  index * 3 + 1,
  index * 3 + 2,
  300 + index * 2,
  301 + index * 2,
])

test('allocator RPC payload is exact and converts 0..100 score to basis points once', () => {
  const parsed = parseTonightAllocatorRpcPayload(payload())
  assert.equal(parsed.round.id, id(10))
  assert.deepEqual(parsed.allocationInput.activities, [id(1), id(2), id(3)])
  assert.equal(parsed.allocationInput.applicants[0].appearanceScoreBp, 7123)
  assert.equal(parsed.allocationInput.applicants[0].friendBundleId, id(200))
  assert.equal(
    (parsed.capacities[0] as unknown as { maxTeamHeadcount: number }).maxTeamHeadcount,
    5,
  )
  assert.doesNotMatch(JSON.stringify(parsed.allocationInput), /duration_minutes/)

  assert.throws(
    () => parseTonightAllocatorRpcPayload({ ...payload(), private_phone: '010-0000-0000' }),
    /invalid_allocator_payload/,
  )
  const bad = payload()
  bad.applications[0].appearance_score = 101
  assert.throws(() => parseTonightAllocatorRpcPayload(bad), /invalid_allocator_payload/)

  const invalidDuration = payload()
  invalidDuration.activities[0].duration_minutes = 29
  assert.throws(() => parseTonightAllocatorRpcPayload(invalidDuration), /invalid_allocator_payload/)

  const invalidHeadcount = payload()
  invalidHeadcount.capacities[0].max_team_headcount = 7
  assert.throws(() => parseTonightAllocatorRpcPayload(invalidHeadcount), /invalid_allocator_payload/)

  const missingHeadcount = payload() as unknown as {
    capacities: Array<Record<string, unknown>>
  }
  delete missingHeadcount.capacities[0].max_team_headcount
  assert.throws(() => parseTonightAllocatorRpcPayload(missingHeadcount), /invalid_allocator_payload/)
})

test('allocator payload rejects work above the explicit 10K support boundary', () => {
  const tooManyApplications = payload()
  const applicant = tooManyApplications.applications[0]
  tooManyApplications.applications = Array.from({ length: 10_001 }, (_, index) => ({
    ...applicant,
    application_id: id(100_000 + index),
    bundle_id: id(200_000 + index),
  }))
  assert.throws(() => parseTonightAllocatorRpcPayload(tooManyApplications), /invalid_allocator_payload/)

  const tooManyCapacities = payload()
  const capacity = tooManyCapacities.capacities[0]
  tooManyCapacities.capacities = Array.from({ length: 10_001 }, (_, index) => ({
    ...capacity,
    id: id(300_000 + index),
  }))
  assert.throws(() => parseTonightAllocatorRpcPayload(tooManyCapacities), /invalid_allocator_payload/)
})

test('allocator payload requires authoritative bundle readiness to be exactly true', () => {
  assert.doesNotThrow(() => parseTonightAllocatorRpcPayload(payload()))

  for (const readiness of [false, null, 1, 'true']) {
    const raw = payload()
    raw.applications[0].bundle_member_ready = readiness as never
    assert.throws(() => parseTonightAllocatorRpcPayload(raw), /invalid_allocator_payload/)
  }

  const missing = payload()
  delete (missing.applications[0] as Partial<(typeof missing.applications)[number]>).bundle_member_ready
  assert.throws(() => parseTonightAllocatorRpcPayload(missing), /invalid_allocator_payload/)
})

test('publish assignments bind exact five-member teams to available capacity deterministically', () => {
  const parsed = parseTonightAllocatorRpcPayload(payload())
  const allocation = allocateTonightTeams(parsed.allocationInput, parsed.capacities)
  assert.equal(allocation.status, 'allocated')
  assert.equal(allocation.teams.length, 1)

  const result = buildTonightPublishAssignments(parsed, allocation)
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.deepEqual(result.assignments, [{
    activity_id: id(1),
    venue_capacity_id: id(20),
    application_ids: [id(100), id(101), id(102), id(103), id(104)],
  }])
  assert.deepEqual(result.publicSummary, {
    team_count: 1,
    waitlisted_application_count: 0,
  })
  assert.doesNotMatch(JSON.stringify(result.publicSummary), /appearance|rank|phone|bundle/i)
})

test('falls back to the second-ranked team activity when the winner has no capacity', () => {
  const raw = payload()
  raw.capacities[0].team_capacity = 0
  const parsed = parseTonightAllocatorRpcPayload(raw)
  const allocation = allocateTonightTeams(parsed.allocationInput)
  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.deepEqual(result.assignments, [{
    activity_id: id(2),
    venue_capacity_id: id(21),
    application_ids: [id(100), id(101), id(102), id(103), id(104)],
  }])
})

test('allows a five-person team to use a six-person venue capacity', () => {
  const raw = payload()
  raw.capacities[0].max_team_headcount = 6
  const parsed = parseTonightAllocatorRpcPayload(raw)
  const allocation = allocateTonightTeams(parsed.allocationInput)

  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.equal(result.assignments[0].venue_capacity_id, id(20))
})

test('falls back past a five-person venue for an eligible six-person bundle team', () => {
  const raw = expandedPayload(6, 3, [[3, 4, 5]])
  raw.capacities[0].max_team_headcount = 5
  raw.capacities[1].max_team_headcount = 6
  const parsed = parseTonightAllocatorRpcPayload(raw)
  const allocation = allocateTonightTeams(parsed.allocationInput, parsed.capacities)

  assert.equal(allocation.teams[0]?.memberIds.length, 6)
  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.deepEqual(result.assignments, [{
    activity_id: id(2),
    venue_capacity_id: id(21),
    application_ids: [id(10_000), id(10_001), id(10_002), id(10_003), id(10_004), id(10_005)],
  }])
})

test('waitlists an eligible six-person team when only five-person venues are available', () => {
  const parsed = parseTonightAllocatorRpcPayload(expandedPayload(6, 3, [[3, 4, 5]]))
  const allocation = allocateTonightTeams(parsed.allocationInput, parsed.capacities)

  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(result.status, 'no_publishable_teams')
  assert.deepEqual(result.assignments, [])
  assert.deepEqual(result.publicSummary, {
    team_count: 0,
    waitlisted_application_count: 6,
  })
})

test('reserves six-person capacity before placing a flexible five-person team', () => {
  const raw = expandedPayload(11, 6, [[8, 9, 10]])
  raw.capacities[0].team_capacity = 1
  raw.capacities[0].max_team_headcount = 6
  raw.capacities[1].team_capacity = 1
  raw.capacities[1].max_team_headcount = 5
  raw.capacities[2].team_capacity = 0
  const parsed = parseTonightAllocatorRpcPayload(raw)
  const allocation = allocateTonightTeams(parsed.allocationInput, parsed.capacities)

  assert.deepEqual(allocation.teams.map((team) => team.memberIds.length).sort(), [5, 6])
  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.equal(result.assignments.length, 2)
  assert.deepEqual(
    result.assignments.map((assignment) => assignment.venue_capacity_id).sort(),
    [id(20), id(21)],
  )
})

test('capacity-aware allocation prefers two publishable five-person teams over an unpublishable trio team', () => {
  const raw = setTotalAvailableTeamCapacity(
    expandedPayload(13, 6, [[6, 7, 8]]),
    2,
  )
  raw.capacities.forEach((capacity) => {
    capacity.max_team_headcount = 5
  })
  raw.applications.forEach((application, index) => {
    application.appearance_score = index <= 10 ? 100 : 0
  })
  const parsed = parseTonightAllocatorRpcPayload(raw)

  const unconstrainedAllocation = allocateTonightTeams(parsed.allocationInput)
  const unconstrainedPublish = buildTonightPublishAssignments(parsed, unconstrainedAllocation)
  const allocation = allocateTonightTeams(parsed.allocationInput, parsed.capacities)
  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(unconstrainedPublish.status, 'allocation_unproven')
  if (unconstrainedPublish.status === 'allocation_unproven') {
    assert.deepEqual(unconstrainedPublish.certification, {
      lower_bound_team_count: 1,
      upper_bound_team_count: 2,
    })
  }
  assert.equal(allocation.status, 'allocated')
  assert.deepEqual(allocation.teams.map((team) => team.memberIds.length).sort(), [5, 5])
  assert.deepEqual(
    allocation.waitlistedUnits.map((unit) => unit.memberIds).sort(),
    [[id(10_006), id(10_007), id(10_008)]],
  )
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.equal(result.assignments.length, 2)
  assert.equal(result.publicSummary.waitlisted_application_count, 3)
})

test('rejects a six-person result unless the women are one atomic three-person bundle', () => {
  for (const bundleGroups of [[], [[3, 4]]]) {
    const parsed = parseTonightAllocatorRpcPayload(expandedPayload(6, 3, bundleGroups))
    const result = buildTonightPublishAssignments(
      parsed,
      allocatedResult(parsed, [[0, 1, 2, 3, 4, 5]]),
    )

    assert.equal(result.status, 'allocator_failed')
    assert.deepEqual(result.assignments, [])
  }
})

test('rejects duplicate members across otherwise valid teams', () => {
  const parsed = parseTonightAllocatorRpcPayload(expandedPayload(10, 6))
  const result = buildTonightPublishAssignments(
    parsed,
    allocatedResult(parsed, [
      [0, 1, 2, 6, 7],
      [0, 3, 4, 8, 9],
    ]),
  )

  assert.equal(result.status, 'allocator_failed')
  assert.deepEqual(result.assignments, [])
})

test('uses the Borda tie-break order when choosing a capacity fallback', () => {
  const raw = payload()
  const rankedChoices = [
    [id(1), id(2), id(3)],
    [id(1), id(3), id(2)],
    [id(2), id(1), id(3)],
    [id(3), id(2), id(1)],
    [id(3), id(2), id(1)],
  ]
  raw.applications.forEach((application, index) => {
    application.choices = rankedChoices[index].map((activityId, rank) => ({
      activity_id: activityId,
      rank: rank + 1,
    }))
  })
  raw.capacities[0].team_capacity = 0

  const parsed = parseTonightAllocatorRpcPayload(raw)
  const allocation = allocateTonightTeams(parsed.allocationInput)
  assert.equal(allocation.status, 'allocated')
  assert.equal(allocation.teams[0]?.activity.activityId, id(1))
  assert.deepEqual(allocation.teams[0]?.activity.totals, [
    { activityId: id(1), points: 10, firstChoiceCount: 2, secondChoiceCount: 1 },
    { activityId: id(2), points: 10, firstChoiceCount: 1, secondChoiceCount: 3 },
    { activityId: id(3), points: 10, firstChoiceCount: 2, secondChoiceCount: 1 },
  ])

  const result = buildTonightPublishAssignments(parsed, allocation)
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.deepEqual(result.assignments, [{
    activity_id: id(3),
    venue_capacity_id: id(22),
    application_ids: [id(100), id(101), id(102), id(103), id(104)],
  }])
})

test('waitlists the whole five-person team only when every ranked activity is full', () => {
  const raw = payload()
  raw.capacities.forEach((capacity) => {
    capacity.team_capacity = 0
  })
  const parsed = parseTonightAllocatorRpcPayload(raw)
  const allocation = allocateTonightTeams(parsed.allocationInput)
  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(result.status, 'no_publishable_teams')
  assert.deepEqual(result.assignments, [])
  assert.deepEqual(result.publicSummary, {
    team_count: 0,
    waitlisted_application_count: 5,
  })
})

test('refuses to publish a bundled allocation whose maximum team count is unproven', () => {
  const parsed = parseTonightAllocatorRpcPayload(expandedPayload(
    25,
    15,
    [[12, 13], [23, 24]],
  ))
  const allocation = allocatedResult(parsed, fourTeams)

  const result = buildTonightPublishAssignments(parsed, allocation) as unknown as {
    status: string
    assignments: readonly unknown[]
    certification: {
      lower_bound_team_count: number
      upper_bound_team_count: number
    }
    publicSummary: {
      team_count: number
      waitlisted_application_count: number
    }
  }

  assert.equal(result.status, 'allocation_unproven')
  assert.deepEqual(result.assignments, [])
  assert.deepEqual(result.certification, {
    lower_bound_team_count: 4,
    upper_bound_team_count: 5,
  })
  assert.deepEqual(result.publicSummary, {
    team_count: 0,
    waitlisted_application_count: 25,
  })
})

test('publishes when a supported exactness certificate is available', () => {
  const allSolo = parseTonightAllocatorRpcPayload(expandedPayload(25, 15))
  assert.equal(
    buildTonightPublishAssignments(allSolo, allocatedResult(allSolo, fourTeams)).status,
    'ready',
    'the all-solo exact DP path is certified independently of the relaxed upper bound',
  )

  const boundedBundle = parseTonightAllocatorRpcPayload(expandedPayload(
    10,
    6,
    [[0, 1]],
  ))
  assert.equal(
    buildTonightPublishAssignments(
      boundedBundle,
      allocatedResult(boundedBundle, [[0, 1, 2, 6, 7]]),
    ).status,
    'ready',
    'at most twenty atomic units stay inside the exact repair boundary',
  )

  const reachesUpperBound = parseTonightAllocatorRpcPayload(expandedPayload(
    25,
    6,
    [[10, 11, 12], [13, 14]],
  ))
  assert.equal(
    buildTonightPublishAssignments(
      reachesUpperBound,
      allocatedResult(reachesUpperBound, [
        [0, 1, 2, 6, 7],
        [3, 4, 5, 8, 9],
      ]),
    ).status,
    'ready',
    'reaching the sex-constrained upper bound proves maximum team count',
  )
})

test('certifies the safe three-men-per-team upper bound without reviving 2M3F teams', () => {
  const parsed = parseTonightAllocatorRpcPayload(expandedPayload(25, 10, [[23, 24]]))
  const allocation = allocatedResult(parsed, [
    [0, 1, 2, 10, 11],
    [3, 4, 5, 12, 13],
    [6, 7, 8, 14, 15],
  ])

  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.equal(result.assignments.length, 3)
})

test('counts each atomic three-woman bundle as one certification team resource', () => {
  const womenBundleGroups = Array.from({ length: 20 }, (_, index) => [
    90 + index * 3,
    91 + index * 3,
    92 + index * 3,
  ])
  const raw = expandedPayload(150, 90, womenBundleGroups)
  raw.capacities.forEach((capacity) => {
    capacity.max_team_headcount = 6
  })
  const parsed = parseTonightAllocatorRpcPayload(raw)
  const allocation = allocatedResult(
    parsed,
    womenBundleGroups.map((women, index) => [
      index * 3,
      index * 3 + 1,
      index * 3 + 2,
      ...women,
    ]),
  )

  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.equal(result.assignments.length, 20)
})

test('caps certification at twenty venue slots and publishes twenty large bundled teams', () => {
  const parsed = parseTonightAllocatorRpcPayload(setTotalAvailableTeamCapacity(
    expandedPayload(500, 300, [[288, 289], [492, 493, 494]]),
    20,
  ))
  const allocation = allocatedResult(parsed, ninetySixLargeBundledTeams)

  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.equal(result.assignments.length, 20)
  assert.deepEqual(result.publicSummary, {
    team_count: 20,
    waitlisted_application_count: 400,
  })
})

test('keeps a large bundled 96-of-100 allocation unproven when 97 venue slots remain', () => {
  const parsed = parseTonightAllocatorRpcPayload(setTotalAvailableTeamCapacity(
    expandedPayload(500, 300, [[288, 289], [492, 493, 494]]),
    97,
  ))
  const allocation = allocatedResult(parsed, ninetySixLargeBundledTeams)

  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(result.status, 'allocation_unproven')
  if (result.status !== 'allocation_unproven') return
  assert.deepEqual(result.assignments, [])
  assert.deepEqual(result.certification, {
    lower_bound_team_count: 96,
    upper_bound_team_count: 97,
  })
})

test('treats zero available venue capacity as a certified empty publish path', () => {
  const parsed = parseTonightAllocatorRpcPayload(setTotalAvailableTeamCapacity(
    expandedPayload(500, 300, [[288, 289], [492, 493, 494]]),
    0,
  ))
  const allocation = allocatedResult(parsed, ninetySixLargeBundledTeams)

  const result = buildTonightPublishAssignments(parsed, allocation)

  assert.equal(result.status, 'no_publishable_teams')
  assert.deepEqual(result.assignments, [])
  assert.deepEqual(result.publicSummary, {
    team_count: 0,
    waitlisted_application_count: 500,
  })
})

test('allocation route blocks unproven output before the publish RPC', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'app/api/internal/tonight/allocate/route.ts'),
    'utf8',
  )
  const unprovenBranch = source.indexOf("publish.status === 'allocation_unproven'")
  const publishRpc = source.indexOf("service_publish_tonight_allocation")

  assert.match(
    source,
    /allocateTonightTeams\(parsed\.allocationInput, parsed\.capacities\)/,
    'route must optimize against the locked capacity headcounts',
  )
  assert.ok(unprovenBranch >= 0, 'route must handle allocation_unproven explicitly')
  assert.ok(publishRpc > unprovenBranch, 'publish RPC must occur only after the unproven guard')
  const guardedSource = source.slice(unprovenBranch, publishRpc)
  assert.match(guardedSource, /failedRoundCount\s*\+=\s*1/)
  assert.match(guardedSource, /lower_bound_team_count/)
  assert.match(guardedSource, /upper_bound_team_count/)
  assert.match(guardedSource, /continue/)
})
