import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { allocateTonightTeams } from '../../lib/matching/tonight-ranked/team-allocation-core'
import { scoreTonightTeamObjective } from '../../lib/matching/tonight-ranked/team-objective'
import type {
  TonightActivityTuple,
  TonightAllocationApplicant,
  TonightAllocationInput,
} from '../../lib/matching/tonight-ranked/contracts'

const ACTIVITIES = ['board-game', 'casual-pub', 'night-walk'] as const satisfies TonightActivityTuple

function applicant(
  applicantId: string,
  sex: 'male' | 'female',
  overrides: Partial<TonightAllocationApplicant> = {},
): TonightAllocationApplicant {
  return {
    applicantId,
    sex,
    age: sex === 'male' ? 23 : 21,
    appearanceScoreBp: 8000,
    activityRanking: ACTIVITIES,
    friendBundleId: null,
    roundNamespace: 'tonight:test-round',
    schoolScopeKey: 'pnu_self_selected',
    departmentKey: `department-${applicantId}`,
    acceptedCompanionApplicationId: null,
    ...overrides,
  }
}

function validFive(): TonightAllocationApplicant[] {
  return [
    applicant('m1', 'male'),
    applicant('m2', 'male'),
    applicant('m3', 'male'),
    applicant('f1', 'female'),
    applicant('f2', 'female'),
  ]
}

function arbitraryPool(count: number): TonightAllocationApplicant[] {
  const applicants: TonightAllocationApplicant[] = []
  for (let index = 0; index < count; index += 1) {
    const position = index % 5
    const sex = position < 3 ? 'male' : 'female'
    applicants.push(
      applicant(`person-${String(index).padStart(5, '0')}`, sex, {
        age: sex === 'male' ? 23 : 21,
        appearanceScoreBp: 7_000 + (index % 11) * 100,
      }),
    )
  }
  return applicants
}

function exactFeasibleBundledPool(seed: number, count: number): TonightAllocationApplicant[] {
  assert.equal(count % 5, 0)
  const rankings: readonly TonightActivityTuple[] = [
    ['a', 'b', 'c'],
    ['a', 'c', 'b'],
    ['b', 'a', 'c'],
    ['b', 'c', 'a'],
    ['c', 'a', 'b'],
    ['c', 'b', 'a'],
  ]
  const partitions = [
    [3, 2],
    [2, 3],
    [3, 1, 1],
    [1, 3, 1],
    [1, 1, 3],
    [2, 2, 1],
    [2, 1, 2],
    [1, 2, 2],
    [2, 1, 1, 1],
    [1, 2, 1, 1],
    [1, 1, 2, 1],
    [1, 1, 1, 2],
    [1, 1, 1, 1, 1],
  ] as const
  let state = (seed ^ Math.imul(count, 2_654_435_761)) >>> 0
  const next = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state
  }
  const shuffle = <T>(rows: T[]): T[] => {
    for (let index = rows.length - 1; index > 0; index -= 1) {
      const swapIndex = next() % (index + 1)
      ;[rows[index], rows[swapIndex]] = [rows[swapIndex], rows[index]]
    }
    return rows
  }
  const applicants: TonightAllocationApplicant[] = []

  for (let block = 0; block < count / 5; block += 1) {
    const maleCount = 3
    const baseAge = 18 + (next() % 98)
    const members = Array.from({ length: 5 }, (_, memberIndex) => ({
      sex: memberIndex < maleCount ? 'male' as const : 'female' as const,
      age: baseAge + (next() % 6),
      appearanceScoreBp: 5_000 + (next() % 5_001),
      activityRanking: rankings[next() % rankings.length],
    }))
    shuffle(members)
    const partition = partitions[next() % partitions.length]
    let memberOffset = 0

    partition.forEach((bundleSize, bundleIndex) => {
      const friendBundleId = `s${seed}-b${String(block).padStart(3, '0')}-u${bundleIndex}`
      for (let bundleMemberIndex = 0; bundleMemberIndex < bundleSize; bundleMemberIndex += 1) {
        const member = members[memberOffset]
        memberOffset += 1
        const applicantId =
          `s${seed}-b${String(block).padStart(3, '0')}` +
          `-m${String(bundleMemberIndex).padStart(2, '0')}` +
          `-r${String(next() % 1_000_000).padStart(6, '0')}`
        applicants.push({
          applicantId,
          ...member,
          friendBundleId,
          roundNamespace: 'tonight:test-round',
          schoolScopeKey: 'pnu_self_selected',
          departmentKey: `department-${applicantId}`,
          acceptedCompanionApplicationId: friendBundleId,
        })
      }
    })
  }

  return shuffle(applicants)
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

function sourceFilesUnder(directory: string): string[] {
  if (!statSync(directory).isDirectory()) return []
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sourceFilesUnder(path)
    return /\.[cm]?[jt]sx?$/.test(entry) ? [path] : []
  })
}

function assertInvalid(input: TonightAllocationInput, issueCode: string): void {
  const result = allocateTonightTeams(input)
  assert.equal(result.status, 'invalid_input')
  assert.deepEqual(result.teams, [])
  assert.deepEqual(result.waitlistedUnits, [])
  assert.equal(result.issues.some((issue) => issue.code === issueCode), true)
}

function bundledSexFixture(
  unitSexes: readonly string[],
  memberIds?: readonly string[],
): TonightAllocationApplicant[] {
  let applicantIndex = 0
  return unitSexes.flatMap((sexes, unitIndex) =>
    [...sexes].map((sex, memberIndex) => {
      const applicantId =
        memberIds?.[applicantIndex] ?? `unit-${String(unitIndex).padStart(2, '0')}-${memberIndex}`
      applicantIndex += 1
      return applicant(
        applicantId,
        sex === 'm' ? 'male' : 'female',
        {
          age: sex === 'm' ? 23 : 21,
          appearanceScoreBp: 8_000,
          friendBundleId: `bundle-${String(unitIndex).padStart(2, '0')}`,
        },
      )
    }),
  )
}

function renamedMemberIds(seed: number, count: number): string[] {
  const ids = Array.from({ length: count }, (_, index) => `rename-${String(index).padStart(2, '0')}`)
  let state = seed >>> 0
  for (let index = ids.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    const swapIndex = state % (index + 1)
    ;[ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]]
  }
  return ids
}

function exactMaximumTeamCount(unitSexes: readonly string[]): number {
  const unitCounts = unitSexes.map((sexes) => ({
    sexes,
    size: sexes.length,
    male: [...sexes].filter((sex) => sex === 'm').length,
    female: [...sexes].filter((sex) => sex === 'f').length,
  }))
  const fullMask = (1 << unitCounts.length) - 1
  const feasibleMasks: number[] = []

  for (let mask = 1; mask <= fullMask; mask += 1) {
    let size = 0
    let male = 0
    let female = 0
    for (let index = 0; index < unitCounts.length; index += 1) {
      if ((mask & (1 << index)) === 0) continue
      size += unitCounts[index].size
      male += unitCounts[index].male
      female += unitCounts[index].female
    }
    const selectedUnits = unitCounts.filter((_, index) => (mask & (1 << index)) !== 0)
    const isNormal = size === 5 && male === 3 && female === 2
    const isBundleException =
      size === 6 &&
      male === 3 &&
      female === 3 &&
      selectedUnits.some((unit) => unit.sexes === 'fff')
    if (isNormal || isBundleException) {
      feasibleMasks.push(mask)
    }
  }

  const feasibleByUnit = Array.from({ length: unitCounts.length }, () => [] as number[])
  for (const mask of feasibleMasks) {
    for (let index = 0; index < unitCounts.length; index += 1) {
      if ((mask & (1 << index)) !== 0) feasibleByUnit[index].push(mask)
    }
  }

  const memo = new Map<number, number>()
  const search = (availableMask: number): number => {
    const cached = memo.get(availableMask)
    if (cached !== undefined) return cached
    if (availableMask === 0) return 0
    const lowestBit = availableMask & -availableMask
    const firstIndex = 31 - Math.clz32(lowestBit)
    let best = search(availableMask ^ lowestBit)
    for (const teamMask of feasibleByUnit[firstIndex]) {
      if ((teamMask & availableMask) === teamMask) {
        best = Math.max(best, 1 + search(availableMask ^ teamMask))
      }
    }
    memo.set(availableMask, best)
    return best
  }

  return search(fullMask)
}

function randomizedUnitSexes(seed: number): string[] {
  let state = seed >>> 0
  const next = (): number => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0
    return state
  }
  const unitCount = 5 + (next() % 9)
  return Array.from({ length: unitCount }, () => {
    const size = 1 + (next() % 3)
    return Array.from({ length: size }, () => (next() % 2 === 0 ? 'm' : 'f')).join('')
  })
}

function randomizedScoredApplicants(seed: number): TonightAllocationApplicant[] {
  let state = seed >>> 0
  const next = (): number => {
    state = (Math.imul(state, 747_796_405) + 2_891_336_453) >>> 0
    return state
  }
  const unitCount = 5 + (next() % 5)
  const unitSexes = Array.from({ length: unitCount }, () => {
    const size = 1 + (next() % 3)
    return Array.from({ length: size }, () => (next() % 2 === 0 ? 'm' : 'f')).join('')
  })
  const memberCount = unitSexes.reduce((sum, sexes) => sum + sexes.length, 0)
  const ids = renamedMemberIds(next(), memberCount)
  let memberIndex = 0

  return unitSexes.flatMap((sexes, unitIndex) =>
    [...sexes].map((sex) => {
      const applicantId = ids[memberIndex]
      memberIndex += 1
      return applicant(applicantId, sex === 'm' ? 'male' : 'female', {
        age: sex === 'm' ? 23 : 21,
        appearanceScoreBp: next() % 10_001,
        friendBundleId: `random-unit-${unitIndex}`,
      })
    }),
  )
}

function exactAllocationObjective(applicants: readonly TonightAllocationApplicant[]): {
  teamCount: number
  minimumPairQualityBp: number
  totalPairQualityBp: number
  signature: string
} {
  const grouped = new Map<string, TonightAllocationApplicant[]>()
  for (const row of applicants) {
    const key = row.friendBundleId ?? `solo:${row.applicantId}`
    const members = grouped.get(key) ?? []
    members.push(row)
    grouped.set(key, members)
  }
  const units = [...grouped.values()]
  const fullMask = (1 << units.length) - 1
  const candidates: Array<{
    mask: number
    minimumPairQualityBp: number
    totalPairQualityBp: number
    signature: string
  }> = []

  for (let mask = 1; mask <= fullMask; mask += 1) {
    const members = units.flatMap((unit, index) => ((mask & (1 << index)) === 0 ? [] : unit))
    const objective = scoreTonightTeamObjective(members)
    if (objective) candidates.push({ mask, ...objective })
  }

  const byUnit = Array.from({ length: units.length }, () => [] as typeof candidates)
  for (const candidate of candidates) {
    for (let index = 0; index < units.length; index += 1) {
      if ((candidate.mask & (1 << index)) !== 0) byUnit[index].push(candidate)
    }
  }

  let best = {
    teamCount: 0,
    minimumPairQualityBp: 0,
    totalPairQualityBp: 0,
    signature: '[]',
  }
  const visit = (availableMask: number, teams: readonly (typeof candidates)[number][]): void => {
    if (availableMask === 0) {
      const proposal = {
        teamCount: teams.length,
        minimumPairQualityBp:
          teams.length === 0
            ? 0
            : Math.min(...teams.map((team) => team.minimumPairQualityBp)),
        totalPairQualityBp: teams.reduce((sum, team) => sum + team.totalPairQualityBp, 0),
        signature: JSON.stringify(teams.map((team) => team.signature).sort()),
      }
      const comparison =
        proposal.teamCount - best.teamCount ||
        proposal.minimumPairQualityBp - best.minimumPairQualityBp ||
        proposal.totalPairQualityBp - best.totalPairQualityBp ||
        (proposal.signature < best.signature ? 1 : proposal.signature > best.signature ? -1 : 0)
      if (comparison > 0) best = proposal
      return
    }

    const lowestBit = availableMask & -availableMask
    const firstIndex = 31 - Math.clz32(lowestBit)
    visit(availableMask ^ lowestBit, teams)
    for (const candidate of byUnit[firstIndex]) {
      if ((candidate.mask & availableMask) === candidate.mask) {
        visit(availableMask ^ candidate.mask, [...teams, candidate])
      }
    }
  }

  visit(fullMask, [])
  return best
}

test('fails closed for a daily activity list that is not exactly three unique ids', () => {
  assertInvalid(
    {
      activities: ['board-game', 'night-walk'] as unknown as TonightActivityTuple,
      applicants: validFive(),
    },
    'activities_not_exactly_three',
  )
  assertInvalid(
    {
      activities: ['board-game', 'board-game', 'night-walk'] as unknown as TonightActivityTuple,
      applicants: validFive(),
    },
    'activities_not_unique',
  )
})

test('fails closed when runtime input does not contain an applicant array', () => {
  assertInvalid(
    {
      activities: ACTIVITIES,
      applicants: null as unknown as TonightAllocationApplicant[],
    },
    'invalid_applicants',
  )
})

test('fails closed instead of throwing for null or undefined root input', () => {
  for (const input of [null, undefined]) {
    const result = allocateTonightTeams(input as unknown as TonightAllocationInput)
    assert.equal(result.status, 'invalid_input')
    assert.deepEqual(result.teams, [])
    assert.deepEqual(result.waitlistedUnits, [])
    assert.equal(result.issues.some((issue) => issue.code === 'invalid_root_input'), true)
  }
})

test('fails closed when a ballot is not an exact permutation of the daily tuple', () => {
  const applicants = validFive()
  applicants[0] = applicant('m1', 'male', {
    activityRanking: ['board-game', 'board-game', 'night-walk'] as unknown as TonightActivityTuple,
  })

  assertInvalid({ activities: ACTIVITIES, applicants }, 'invalid_activity_ranking')
})

test('fails closed for duplicate or blank applicant identifiers', () => {
  const duplicate = validFive()
  duplicate[1] = applicant('m1', 'male')
  assertInvalid({ activities: ACTIVITIES, applicants: duplicate }, 'duplicate_applicant_id')

  const blank = validFive()
  blank[1] = applicant('   ', 'male')
  assertInvalid({ activities: ACTIVITIES, applicants: blank }, 'invalid_applicant_id')
})

test('fails closed for invalid ages or non-integer/out-of-range appearance basis points', () => {
  const invalidAge = validFive()
  invalidAge[0] = applicant('m1', 'male', { age: Number.NaN })
  assertInvalid({ activities: ACTIVITIES, applicants: invalidAge }, 'invalid_age')

  const invalidAppearance = validFive()
  invalidAppearance[0] = applicant('m1', 'male', { appearanceScoreBp: 10000.5 })
  assertInvalid({ activities: ACTIVITIES, applicants: invalidAppearance }, 'invalid_appearance_score')
})

test('fails closed for missing or non-canonical allocation identity snapshots', () => {
  const missingDepartment = validFive()
  missingDepartment[0] = applicant('m1', 'male', { departmentKey: '' })
  assertInvalid(
    { activities: ACTIVITIES, applicants: missingDepartment },
    'invalid_department_identity',
  )

  const nonCanonicalSchool = validFive()
  nonCanonicalSchool[0] = applicant('m1', 'male', { schoolScopeKey: ' PNU_SELF_SELECTED ' })
  assertInvalid(
    { activities: ACTIVITIES, applicants: nonCanonicalSchool },
    'invalid_department_identity',
  )
})

test('fails closed when a companion exemption is not the authoritative friend bundle', () => {
  const genericInviteToken = validFive()
  genericInviteToken[0] = applicant('m1', 'male', {
    friendBundleId: null,
    acceptedCompanionApplicationId: 'generic-friend-token',
  })
  assertInvalid(
    { activities: ACTIVITIES, applicants: genericInviteToken },
    'invalid_companion_application_id',
  )

  const mismatchedBundle = validFive()
  mismatchedBundle[0] = applicant('m1', 'male', {
    friendBundleId: 'accepted-party-1',
    acceptedCompanionApplicationId: 'accepted-party-2',
  })
  assertInvalid(
    { activities: ACTIVITIES, applicants: mismatchedBundle },
    'invalid_companion_application_id',
  )
})

test('fails closed when a friend bundle contains more than three applicants', () => {
  const applicants = validFive().map((row, index) => ({
    ...row,
    friendBundleId: index < 4 ? 'too-large' : null,
  }))

  assertInvalid({ activities: ACTIVITIES, applicants }, 'friend_bundle_too_large')
})

test('fails closed instead of throwing for a malformed venue capacity profile', () => {
  const result = allocateTonightTeams(
    { activities: ACTIVITIES, applicants: validFive() },
    [{ availableTeamCount: -1, maxTeamHeadcount: 5 }],
  )

  assert.equal(result.status, 'invalid_input')
  assert.deepEqual(result.teams, [])
  assert.deepEqual(result.waitlistedUnits, [])
  assert.deepEqual(result.issues, [{ code: 'invalid_root_input' }])
})

test('fails closed with zero teams when the deterministic evaluation budget is exhausted', () => {
  const result = allocateTonightTeams({
    activities: ACTIVITIES,
    applicants: validFive(),
    limits: { maxEvaluations: 1 },
  })

  assert.equal(result.status, 'budget_exhausted')
  assert.deepEqual(result.teams, [])
  assert.deepEqual(result.waitlistedUnits, [
    { memberIds: ['f1'], reason: 'budget_exhausted' },
    { memberIds: ['f2'], reason: 'budget_exhausted' },
    { memberIds: ['m1'], reason: 'budget_exhausted' },
    { memberIds: ['m2'], reason: 'budget_exhausted' },
    { memberIds: ['m3'], reason: 'budget_exhausted' },
  ])
})

test('uses four fixed passes and bounded repair attempts', () => {
  const result = allocateTonightTeams({
    activities: ACTIVITIES,
    applicants: [...validFive(), ...validFive().map((row) => ({ ...row, applicantId: `b-${row.applicantId}` }))],
  })

  assert.equal(result.status, 'allocated')
  assert.equal(result.diagnostics.passesCompleted, 4)
  assert.equal(result.diagnostics.repairAttempts <= 24, true)
  assert.equal(result.diagnostics.evaluations <= result.diagnostics.maxEvaluations, true)
})

test('handles arbitrary counts instead of assuming a fixed 40-person pool', () => {
  const expectedTeams = new Map([
    [0, 0],
    [1, 0],
    [4, 0],
    [5, 1],
    [6, 1],
    [9, 1],
    [39, 7],
    [40, 8],
    [41, 8],
    [257, 51],
  ])

  for (const [count, teamCount] of expectedTeams) {
    const result = allocateTonightTeams({ activities: ACTIVITIES, applicants: arbitraryPool(count) })
    assert.equal(result.status, 'allocated', `N=${count}`)
    assert.equal(result.teams.length, teamCount, `N=${count}`)
    assert.equal(
      result.teams.flatMap((team) => team.memberIds).length +
        result.waitlistedUnits.flatMap((unit) => unit.memberIds).length,
      count,
      `N=${count}`,
    )
  }
})

test('recovers all four teams from the exact-feasible twenty-person age bands', () => {
  const activities = ['a', 'b', 'c'] as const satisfies TonightActivityTuple
  const applicants = Array.from({ length: 20 }, (_, index) =>
    applicant(`p${String(index).padStart(2, '0')}`, index % 5 < 3 ? 'male' : 'female', {
      age: 18 + (index % 20),
      appearanceScoreBp: 6_000 + index,
      activityRanking: activities,
      friendBundleId: null,
    }),
  )

  const result = allocateTonightTeams({ activities, applicants })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 4)
  assert.equal(result.waitlistedUnits.length, 0)
})

test('recovers all three teams from an exact-feasible arbitrary solo age distribution', () => {
  const activities = ['a', 'b', 'c'] as const satisfies TonightActivityTuple
  const rows: ReadonlyArray<readonly [string, 'male' | 'female', number]> = [
    ['p00', 'male', 23],
    ['p01', 'female', 21],
    ['p02', 'male', 23],
    ['p03', 'male', 23],
    ['p04', 'female', 21],
    ['p05', 'male', 28],
    ['p06', 'female', 26],
    ['p07', 'male', 28],
    ['p08', 'female', 26],
    ['p09', 'male', 28],
    ['p10', 'male', 33],
    ['p11', 'female', 31],
    ['p12', 'male', 33],
    ['p13', 'female', 31],
    ['p14', 'male', 33],
  ]
  const applicants = rows.map(([applicantId, sex, age], index) =>
    applicant(applicantId, sex, {
      age,
      appearanceScoreBp: 6_000 + index,
      activityRanking: activities,
      friendBundleId: null,
    }),
  )

  const result = allocateTonightTeams({ activities, applicants })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 3)
  assert.equal(result.waitlistedUnits.length, 0)
})

test('caps the repeated ten-thousand-person pool at the available venue slots', { timeout: 30_000 }, () => {
  const activities = ['a', 'b', 'c'] as const satisfies TonightActivityTuple
  const applicants = Array.from({ length: 10_000 }, (_, index) =>
    applicant(`p${String(index).padStart(5, '0')}`, index % 5 < 3 ? 'male' : 'female', {
      age: 18 + (index % 20),
      appearanceScoreBp: 6_000 + (index % 20),
      activityRanking: activities,
      friendBundleId: null,
    }),
  )

  const result = allocateTonightTeams(
    { activities, applicants },
    [{ availableTeamCount: 1_999, maxTeamHeadcount: 5 }],
  )

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 1_999)
  assert.equal(result.waitlistedUnits.length, 5)
})

test('prioritizes completed-team count across an atomic bundle pool', () => {
  const activities = ['a', 'b', 'c'] as const satisfies TonightActivityTuple
  const rows: ReadonlyArray<
    readonly [string, 'male' | 'female', number, number, string]
  > = [
    ['p0000', 'male', 23, 0, 't0-men'],
    ['p0001', 'male', 23, 0, 't0-men'],
    ['p0002', 'male', 23, 0, 't0-men'],
    ['p0003', 'female', 21, 0, 't0-women'],
    ['p0004', 'female', 21, 0, 't0-women'],
    ['p0005', 'male', 28, 0, 't1-men'],
    ['p0006', 'male', 28, 0, 't1-men'],
    ['p0007', 'male', 28, 0, 't1-men'],
    ['p0008', 'female', 26, 0, 't1-women'],
    ['p0009', 'female', 26, 0, 't1-women'],
    ['p0010', 'male', 33, 0, 't2-men'],
    ['p0011', 'male', 33, 0, 't2-men'],
    ['p0012', 'male', 33, 0, 't2-men'],
    ['p0013', 'female', 31, 0, 't2-women'],
    ['p0014', 'female', 31, 0, 't2-women'],
    ['p0015', 'male', 38, 0, 't3-men'],
    ['p0016', 'male', 38, 1_250, 't3-men'],
    ['p0017', 'male', 38, 0, 't3-men'],
    ['p0018', 'female', 36, 0, 't3-women'],
    ['p0019', 'female', 36, 0, 't3-women'],
  ]
  const applicants = rows.map(
    ([applicantId, sex, age, appearanceScoreBp, friendBundleId]) =>
      applicant(applicantId, sex, {
        age,
        appearanceScoreBp,
        activityRanking: activities,
        friendBundleId,
      }),
  )

  const result = allocateTonightTeams({ activities, applicants })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 4)
  assert.equal(result.waitlistedUnits.length, 0)
})

test('solves the varied-age friend-bundle N=20 exact boundary for seed 13605', () => {
  const activities = ['a', 'b', 'c'] as const satisfies TonightActivityTuple
  const applicants = exactFeasibleBundledPool(13_605, 20)

  const result = allocateTonightTeams({ activities, applicants })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 4)
  assert.equal(result.waitlistedUnits.length, 0)
})

test('recovers all thirty witness teams in a deterministic bundled N=150 pool', () => {
  const activities = ['a', 'b', 'c'] as const satisfies TonightActivityTuple
  const applicants = exactFeasibleBundledPool(1, 150)

  const result = allocateTonightTeams({ activities, applicants })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 30)
  assert.equal(result.waitlistedUnits.length, 0)
})

test('keeps a deterministic lower bound for the unproven bundled N=500 long chain', { timeout: 30_000 }, () => {
  const activities = ['a', 'b', 'c'] as const satisfies TonightActivityTuple
  const applicants = exactFeasibleBundledPool(1, 500)

  const forward = allocateTonightTeams({ activities, applicants })
  const reverse = allocateTonightTeams({ activities, applicants: [...applicants].reverse() })

  assert.equal(forward.status, 'allocated')
  assert.equal(forward.teams.length < 100, true)
  assert.equal(
    forward.teams.flatMap((team) => team.memberIds).length +
      forward.waitlistedUnits.flatMap((unit) => unit.memberIds).length,
    500,
  )
  assert.equal(reverse.status, 'allocated')
  assert.equal(reverse.teams.length, forward.teams.length)
  assert.equal(reverse.allocationSignature, forward.allocationSignature)
})

test('keeps a ten-thousand-person bundled pool within the bounded allocation contract', { timeout: 30_000 }, () => {
  const activities = ['a', 'b', 'c'] as const satisfies TonightActivityTuple
  const applicants = exactFeasibleBundledPool(1, 10_000)

  const result = allocateTonightTeams({ activities, applicants })
  const reverse = allocateTonightTeams({ activities, applicants: [...applicants].reverse() })

  assert.equal(result.status, 'allocated')
  assert.equal(
    result.teams.flatMap((team) => team.memberIds).length +
      result.waitlistedUnits.flatMap((unit) => unit.memberIds).length,
    10_000,
  )
  assert.equal(result.diagnostics.evaluations <= result.diagnostics.maxEvaluations, true)
  assert.equal(reverse.status, 'allocated')
  assert.equal(reverse.allocationSignature, result.allocationSignature)
})

test('keeps the exact five-team maximum across atomic three-man and two-woman bundles', () => {
  const applicants = bundledSexFixture(
    ['mmm', 'ff', 'mmm', 'ff', 'mmm', 'ff', 'mmm', 'ff', 'mmm', 'ff'],
    renamedMemberIds(19, 25),
  )

  const result = allocateTonightTeams({ activities: ACTIVITIES, applicants })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 5)
  assert.equal(result.teams.flatMap((team) => team.memberIds).length, 25)
  assert.equal(result.waitlistedUnits.length, 0)
})

test('optimizes global minimum quality before total quality in an exact repair pool', () => {
  const rows: ReadonlyArray<readonly [string, 'male' | 'female', number, string]> = [
    ['s3-00', 'male', 7761, 'u0'],
    ['s3-01', 'female', 1939, 'u0'],
    ['s3-02', 'male', 8149, 'u1'],
    ['s3-03', 'male', 6773, 'u2'],
    ['s3-04', 'male', 1317, 'u3'],
    ['s3-05', 'male', 8757, 'u4'],
    ['s3-06', 'male', 6321, 'u5'],
    ['s3-07', 'male', 7471, 'u6'],
    ['s3-08', 'male', 2938, 'u7'],
    ['s3-09', 'male', 2963, 'u8'],
    ['s3-10', 'female', 5308, 'u9'],
    ['s3-11', 'female', 4656, 'u10'],
    ['s3-12', 'female', 9535, 'u11'],
    ['s3-13', 'female', 9119, 'u12'],
    ['s3-14', 'female', 9990, 'u13'],
  ]
  const applicants = rows.map(([applicantId, sex, appearanceScoreBp, friendBundleId]) =>
    applicant(applicantId, sex, {
      age: sex === 'male' ? 23 : 21,
      appearanceScoreBp,
      friendBundleId,
    }),
  )

  const result = allocateTonightTeams({ activities: ACTIVITIES, applicants })
  const expected = exactAllocationObjective(applicants)

  assert.equal(result.status, 'allocated')
  assert.equal(expected.teamCount, 3)
  assert.equal(result.teams.length, 3)
  assert.equal(
    Math.min(...result.teams.map((team) => team.quality.minimumPairQualityBp)),
    expected.minimumPairQualityBp,
  )
  assert.equal(
    result.teams.reduce((sum, team) => sum + team.quality.totalPairQualityBp, 0),
    expected.totalPairQualityBp,
  )
})

test('matches the known exact five-team maximum across deterministic applicant-id renamings', () => {
  const unitSexes = ['mmm', 'ff', 'mmm', 'ff', 'mmm', 'ff', 'mmm', 'ff', 'mmm', 'ff']

  for (let seed = 1; seed <= 32; seed += 1) {
    const applicants = bundledSexFixture(unitSexes, renamedMemberIds(seed, 25))
    const result = allocateTonightTeams({ activities: ACTIVITIES, applicants })

    assert.equal(result.status, 'allocated', `seed=${seed}`)
    assert.equal(result.teams.length, 5, `seed=${seed}`)
  }
})

test('matches an independent exact team-count oracle across bounded randomized friend-unit pools', () => {
  for (let seed = 1; seed <= 48; seed += 1) {
    const unitSexes = randomizedUnitSexes(seed)
    const memberCount = unitSexes.reduce((sum, sexes) => sum + sexes.length, 0)
    const applicants = bundledSexFixture(unitSexes, renamedMemberIds(seed * 97, memberCount))
    const expected = exactMaximumTeamCount(unitSexes)
    const result = allocateTonightTeams({ activities: ACTIVITIES, applicants })

    assert.equal(result.status, 'allocated', `seed=${seed}`)
    assert.equal(result.teams.length, expected, `seed=${seed}; units=${unitSexes.join(',')}`)
  }
})

test('matches an exhaustive lex-objective oracle across randomized scored atomic pools', () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    const applicants = randomizedScoredApplicants(seed)
    const expected = exactAllocationObjective(applicants)
    const result = allocateTonightTeams({ activities: ACTIVITIES, applicants })
    const actual = {
      teamCount: result.teams.length,
      minimumPairQualityBp:
        result.teams.length === 0
          ? 0
          : Math.min(...result.teams.map((team) => team.quality.minimumPairQualityBp)),
      totalPairQualityBp: result.teams.reduce(
        (sum, team) => sum + team.quality.totalPairQualityBp,
        0,
      ),
      signature: result.allocationSignature,
    }

    assert.equal(result.status, 'allocated', `seed=${seed}`)
    assert.deepEqual(actual, expected, `seed=${seed}`)
  }
})

test('stays deterministic across stable permutations of the same pool', () => {
  const applicants = arbitraryPool(41)
  const permutations = [
    applicants,
    [...applicants].reverse(),
    [...applicants.slice(13), ...applicants.slice(0, 13)],
    applicants.filter((_, index) => index % 2 === 0).concat(
      applicants.filter((_, index) => index % 2 === 1),
    ),
  ]

  const results = permutations.map((rows) =>
    allocateTonightTeams({ activities: ACTIVITIES, applicants: rows }),
  )
  for (const result of results) assert.equal(result.status, 'allocated')
  assert.equal(new Set(results.map((result) => result.allocationSignature)).size, 1)
  assert.equal(new Set(results.map((result) => JSON.stringify(result.teams))).size, 1)
})

test('accepts every exact activity permutation and leaves immutable input untouched', () => {
  const rankings: TonightActivityTuple[] = [
    ['board-game', 'casual-pub', 'night-walk'],
    ['board-game', 'night-walk', 'casual-pub'],
    ['casual-pub', 'board-game', 'night-walk'],
    ['casual-pub', 'night-walk', 'board-game'],
    ['night-walk', 'board-game', 'casual-pub'],
    ['night-walk', 'casual-pub', 'board-game'],
  ]

  for (const ranking of rankings) {
    const input = deepFreeze({
      activities: [...ACTIVITIES] as unknown as TonightActivityTuple,
      applicants: validFive().map((row) => ({
        ...row,
        activityRanking: [...ranking] as unknown as TonightActivityTuple,
      })),
    })
    const before = JSON.stringify(input)
    const result = allocateTonightTeams(input)

    assert.equal(result.status, 'allocated')
    assert.equal(result.teams.length, 1)
    assert.equal(JSON.stringify(input), before)
  }
})

test('keeps evaluation growth within a fixed linear envelope for a 257-person pool', () => {
  const result = allocateTonightTeams({ activities: ACTIVITIES, applicants: arbitraryPool(257) })

  assert.equal(result.status, 'allocated')
  assert.equal(result.teams.length, 51)
  assert.equal(result.diagnostics.evaluations < 10_000 * 257, true)
})

test('private allocator contracts are never imported by use-client source files', () => {
  const clientFiles = [join(process.cwd(), 'app'), join(process.cwd(), 'components')]
    .flatMap(sourceFilesUnder)
    .filter((path) => /^\s*['\"]use client['\"]/m.test(readFileSync(path, 'utf8')))
  const privateImport = /matching\/tonight-ranked\/(contracts|team-objective|team-allocation-core)/

  const violations = clientFiles.filter((path) => privateImport.test(readFileSync(path, 'utf8')))
  assert.deepEqual(violations, [])
})

test('preserves assignment, sex, age, and friend-unit invariants across varied valid pools', () => {
  const rankings: TonightActivityTuple[] = [
    ['board-game', 'casual-pub', 'night-walk'],
    ['casual-pub', 'night-walk', 'board-game'],
    ['night-walk', 'board-game', 'casual-pub'],
  ]

  for (const count of [2, 3, 7, 12, 23, 58]) {
    const applicants = arbitraryPool(count).map((row, index) => ({
      ...row,
      age: row.sex === 'male' ? 22 + (index % 3) : 20 + (index % 3),
      activityRanking: rankings[index % rankings.length],
      friendBundleId:
        index % 11 === 0 && index + 1 < count
          ? `pair-${index}`
          : index % 11 === 1
            ? `pair-${index - 1}`
            : null,
    }))
    const result = allocateTonightTeams({ activities: ACTIVITIES, applicants })

    assert.equal(result.status, 'allocated', `N=${count}`)
    const placementByMember = new Map<string, string>()
    result.teams.forEach((team, teamIndex) => {
      const isNormal =
        team.memberIds.length === 5 &&
        team.sexCounts.male === 3 &&
        team.sexCounts.female === 2
      const women = team.memberIds
        .map((memberId) => applicants.find((row) => row.applicantId === memberId))
        .filter((row): row is TonightAllocationApplicant => row?.sex === 'female')
      const exceptionBundleId = women[0]?.friendBundleId
      const isBundleException =
        team.memberIds.length === 6 &&
        team.sexCounts.male === 3 &&
        team.sexCounts.female === 3 &&
        exceptionBundleId !== null &&
        exceptionBundleId !== undefined &&
        women.every((row) => row.friendBundleId === exceptionBundleId)
      assert.equal(isNormal || isBundleException, true)
      team.memberIds.forEach((memberId) => {
        assert.equal(placementByMember.has(memberId), false)
        placementByMember.set(memberId, `team-${teamIndex}`)
      })
    })
    result.waitlistedUnits.forEach((unit, unitIndex) => {
      unit.memberIds.forEach((memberId) => {
        assert.equal(placementByMember.has(memberId), false)
        placementByMember.set(memberId, `wait-${unitIndex}`)
      })
    })
    assert.equal(placementByMember.size, count)

    const friendPlacements = new Map<string, Set<string>>()
    for (const row of applicants) {
      if (!row.friendBundleId) continue
      const placements = friendPlacements.get(row.friendBundleId) ?? new Set<string>()
      placements.add(placementByMember.get(row.applicantId) ?? 'missing')
      friendPlacements.set(row.friendBundleId, placements)
    }
    for (const placements of friendPlacements.values()) assert.equal(placements.size, 1)
  }
})
