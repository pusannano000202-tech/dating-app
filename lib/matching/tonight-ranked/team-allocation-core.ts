import type {
  TonightActivityResolution,
  TonightActivityTuple,
  TonightAllocatedTeam,
  TonightAllocationApplicant,
  TonightAllocationInput,
  TonightAllocationIssue,
  TonightAllocationResult,
  TonightTeamObjective,
  TonightWaitlistReason,
  TonightWaitlistedUnit,
} from './contracts'
import {
  canonicalDepartmentKey,
  canonicalSchoolScopeKey,
} from '../department-identity'
import {
  TONIGHT_MAX_OPPOSITE_SEX_AGE_GAP,
  countTonightSexes,
  isTonightPartialTeamFeasible,
  scoreTonightTeamObjective,
} from './team-objective'

const FIXED_PASS_COUNT = 4
const CANDIDATE_UNIT_WINDOW = 18
const MAX_REPAIR_ATTEMPTS_PER_PASS = 6
const MAX_REPAIR_ATTEMPTS = FIXED_PASS_COUNT * MAX_REPAIR_ATTEMPTS_PER_PASS
const MAX_REPAIR_WAITLIST_UNITS = 13
const MAX_AUGMENTING_POOL_UNITS = 20
const MAX_MULTI_TEAM_REPAIR_ATTEMPTS_PER_PASS = 3
const MAX_BUNDLE_AUGMENT_ROUNDS = 32
const MAX_BUNDLE_AUGMENT_TEAM_CHOICES = 6
const MAX_BUNDLE_AUGMENT_CANDIDATES_PER_ROUND = 96
const MAX_BUNDLE_AUGMENT_WAITLIST_SEEDS = 96
const MAX_BUNDLE_AUGMENT_POOL_UNITS = 512
const MIN_DEFAULT_EVALUATIONS = 250_000
const DEFAULT_EVALUATIONS_PER_APPLICANT = 30_000
const ABSOLUTE_MAX_EVALUATIONS = 50_000_000
const NORMAL_TEAM_SIZE = 5
const MAX_TEAM_SIZE = 6

interface AllocationUnit {
  key: string
  members: readonly TonightAllocationApplicant[]
  size: number
  maleCount: number
  femaleCount: number
  ageTotal: number
  appearanceTotal: number
}

interface InternalTeam {
  units: readonly AllocationUnit[]
  members: readonly TonightAllocationApplicant[]
  objective: TonightTeamObjective
  activity: TonightActivityResolution
}

interface InternalAllocation {
  teams: readonly InternalTeam[]
  waitlisted: readonly AllocationUnit[]
}

export interface TonightAllocationCapacity {
  availableTeamCount: number
  maxTeamHeadcount: 5 | 6
}

interface AllocationCapacityProfile {
  teamSlots: number
  sixPersonTeamSlots: number
}

interface TeamProposal {
  team: InternalTeam
  projectedRemainingTeamCapacity: number
}

interface RepairTeamCandidate {
  mask: number
  team: InternalTeam
}

class EvaluationBudgetExhausted extends Error {
  constructor() {
    super('Tonight allocation evaluation budget exhausted')
    this.name = 'EvaluationBudgetExhausted'
  }
}

class EvaluationBudget {
  used = 0

  constructor(readonly maximum: number) {}

  consume(): void {
    if (this.used >= this.maximum) throw new EvaluationBudgetExhausted()
    this.used += 1
  }
}

function toCapacityProfile(
  capacities: readonly TonightAllocationCapacity[] | undefined,
): AllocationCapacityProfile | null {
  if (capacities === undefined) return null
  let teamSlots = 0
  let sixPersonTeamSlots = 0
  for (const capacity of capacities) {
    if (
      !Number.isInteger(capacity.availableTeamCount)
      || capacity.availableTeamCount < 0
      || (capacity.maxTeamHeadcount !== 5 && capacity.maxTeamHeadcount !== 6)
    ) {
      throw new TypeError('invalid_tonight_allocation_capacity')
    }
    teamSlots += capacity.availableTeamCount
    if (capacity.maxTeamHeadcount === 6) {
      sixPersonTeamSlots += capacity.availableTeamCount
    }
  }
  return { teamSlots, sixPersonTeamSlots }
}

function remainingCapacity(
  profile: AllocationCapacityProfile | null,
  occupiedTeams: readonly InternalTeam[],
): AllocationCapacityProfile | null {
  if (!profile) return null
  const occupiedSixPersonTeams = occupiedTeams.filter((team) => team.members.length === 6).length
  return {
    teamSlots: Math.max(0, profile.teamSlots - occupiedTeams.length),
    sixPersonTeamSlots: Math.max(0, profile.sixPersonTeamSlots - occupiedSixPersonTeams),
  }
}

function maximumTeamSize(profile: AllocationCapacityProfile | null): 5 | 6 {
  return profile && profile.sixPersonTeamSlots === 0 ? 5 : 6
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareAverage(
  leftTotal: number,
  leftCount: number,
  rightTotal: number,
  rightCount: number,
): number {
  return leftTotal * rightCount - rightTotal * leftCount
}

function compareUnitsForPass(left: AllocationUnit, right: AllocationUnit, pass: number): number {
  let result = 0
  if (pass === 0) {
    result = compareAverage(left.ageTotal, left.size, right.ageTotal, right.size)
    if (result === 0) {
      result = compareAverage(
        left.appearanceTotal,
        left.size,
        right.appearanceTotal,
        right.size,
      )
    }
    if (result === 0) result = right.size - left.size
  } else if (pass === 1) {
    result = compareAverage(
      left.appearanceTotal,
      left.size,
      right.appearanceTotal,
      right.size,
    )
    if (result === 0) result = compareAverage(left.ageTotal, left.size, right.ageTotal, right.size)
    if (result === 0) result = right.size - left.size
  } else if (pass === 2) {
    result = right.size - left.size
    if (result === 0) {
      result =
        Math.abs(left.maleCount - left.femaleCount) -
        Math.abs(right.maleCount - right.femaleCount)
    }
    if (result === 0) result = compareAverage(left.ageTotal, left.size, right.ageTotal, right.size)
  }

  return result === 0 ? compareStrings(left.key, right.key) : result
}

function unitKind(unit: AllocationUnit): 'mixed' | 'male' | 'female' {
  if (unit.maleCount > 0 && unit.femaleCount > 0) return 'mixed'
  return unit.maleCount > 0 ? 'male' : 'female'
}

/**
 * Keeps opposite-sex candidates close in every bounded neighbourhood without
 * scanning the whole pool per anchor.
 */
function orderedUnitsForPass(units: readonly AllocationUnit[], pass: number): AllocationUnit[] {
  const byKind = {
    mixed: [] as AllocationUnit[],
    male: [] as AllocationUnit[],
    female: [] as AllocationUnit[],
  }
  for (const unit of units) byKind[unitKind(unit)].push(unit)
  for (const rows of Object.values(byKind)) {
    rows.sort((left, right) => compareUnitsForPass(left, right, pass))
  }

  const cycles: ReadonlyArray<ReadonlyArray<'mixed' | 'male' | 'female'>> = [
    ['mixed', 'male', 'female'],
    ['mixed', 'female', 'male'],
    ['male', 'mixed', 'female'],
    ['female', 'mixed', 'male'],
  ]
  const cycle = cycles[pass]
  const indexes = { mixed: 0, male: 0, female: 0 }
  const result: AllocationUnit[] = []

  while (result.length < units.length) {
    for (const kind of cycle) {
      const index = indexes[kind]
      if (index < byKind[kind].length) {
        result.push(byKind[kind][index])
        indexes[kind] += 1
      }
    }
  }

  return result
}

function validateInput(input: TonightAllocationInput): TonightAllocationIssue[] {
  const issues: TonightAllocationIssue[] = []
  const activities = input.activities as unknown

  if (!Array.isArray(activities) || activities.length !== 3) {
    issues.push({ code: 'activities_not_exactly_three' })
  }

  const activityRows = Array.isArray(activities) ? activities : []
  if (
    activityRows.some(
      (activity) =>
        typeof activity !== 'string' || activity.trim().length === 0 || activity !== activity.trim(),
    )
  ) {
    issues.push({ code: 'invalid_activity_id' })
  }
  if (activityRows.length === 3 && new Set(activityRows).size !== 3) {
    issues.push({ code: 'activities_not_unique' })
  }

  if (!Array.isArray(input.applicants)) issues.push({ code: 'invalid_applicants' })
  const applicantRows = Array.isArray(input.applicants) ? input.applicants : []
  const seenApplicantIds = new Set<string>()
  const friendCounts = new Map<string, number>()
  const expectedActivities = new Set(activityRows)

  for (const applicant of applicantRows) {
    const rawApplicantId = applicant?.applicantId
    const applicantId = typeof rawApplicantId === 'string' ? rawApplicantId : undefined
    const validApplicantId =
      typeof applicantId === 'string' && applicantId.trim().length > 0 && applicantId === applicantId.trim()

    if (!validApplicantId) {
      issues.push({ code: 'invalid_applicant_id' })
    } else if (seenApplicantIds.has(applicantId)) {
      issues.push({ code: 'duplicate_applicant_id', applicantId })
    } else {
      seenApplicantIds.add(applicantId)
    }

    if (applicant?.sex !== 'male' && applicant?.sex !== 'female') {
      issues.push({ code: 'invalid_sex', applicantId })
    }
    if (!Number.isInteger(applicant?.age) || applicant.age < 18 || applicant.age > 120) {
      issues.push({ code: 'invalid_age', applicantId })
    }
    if (
      !Number.isInteger(applicant?.appearanceScoreBp) ||
      applicant.appearanceScoreBp < 0 ||
      applicant.appearanceScoreBp > 10_000
    ) {
      issues.push({ code: 'invalid_appearance_score', applicantId })
    }

    const ranking = applicant?.activityRanking as unknown
    if (
      !Array.isArray(ranking) ||
      ranking.length !== 3 ||
      new Set(ranking).size !== 3 ||
      ranking.some((activity) => !expectedActivities.has(activity))
    ) {
      issues.push({ code: 'invalid_activity_ranking', applicantId })
    }

    const friendBundleId = applicant?.friendBundleId
    if (
      friendBundleId !== null &&
      (typeof friendBundleId !== 'string' ||
        friendBundleId.trim().length === 0 ||
        friendBundleId !== friendBundleId.trim())
    ) {
      issues.push({ code: 'invalid_friend_bundle_id', applicantId })
    } else if (typeof friendBundleId === 'string') {
      friendCounts.set(friendBundleId, (friendCounts.get(friendBundleId) ?? 0) + 1)
    }

    const roundNamespace = applicant?.roundNamespace
    const schoolScopeKey = applicant?.schoolScopeKey
    const departmentKey = applicant?.departmentKey
    if (
      typeof roundNamespace !== 'string'
      || roundNamespace.trim().length === 0
      || roundNamespace !== roundNamespace.trim()
      || canonicalSchoolScopeKey(schoolScopeKey) !== schoolScopeKey
      || canonicalDepartmentKey(departmentKey) !== departmentKey
    ) {
      issues.push({ code: 'invalid_department_identity', applicantId })
    }

    const acceptedCompanionApplicationId = applicant?.acceptedCompanionApplicationId
    if (
      acceptedCompanionApplicationId !== null
      && (
        typeof acceptedCompanionApplicationId !== 'string'
        || acceptedCompanionApplicationId.trim().length === 0
        || acceptedCompanionApplicationId !== acceptedCompanionApplicationId.trim()
        || acceptedCompanionApplicationId !== friendBundleId
      )
    ) {
      issues.push({ code: 'invalid_companion_application_id', applicantId })
    }
  }

  for (const count of friendCounts.values()) {
    if (count > 3) {
      issues.push({ code: 'friend_bundle_too_large' })
      break
    }
  }

  const configuredMaximum = input.limits?.maxEvaluations
  if (
    configuredMaximum !== undefined &&
    (!Number.isInteger(configuredMaximum) ||
      configuredMaximum < 1 ||
      configuredMaximum > ABSOLUTE_MAX_EVALUATIONS)
  ) {
    issues.push({ code: 'invalid_evaluation_budget' })
  }

  return issues
}

function makeUnits(applicants: readonly TonightAllocationApplicant[]): AllocationUnit[] {
  const groups = new Map<string, TonightAllocationApplicant[]>()
  for (const applicant of applicants) {
    const key = applicant.friendBundleId
      ? `friend:${applicant.friendBundleId}`
      : `solo:${applicant.applicantId}`
    const members = groups.get(key) ?? []
    members.push(applicant)
    groups.set(key, members)
  }

  return [...groups.values()]
    .map((unsortedMembers) => {
      const members = [...unsortedMembers].sort((left, right) =>
        compareStrings(left.applicantId, right.applicantId),
      )
      const sexCounts = countTonightSexes(members)
      return {
        // Search identity depends on membership, never on the private friend reference.
        key: `unit:${JSON.stringify(members.map((member) => member.applicantId))}`,
        members,
        size: members.length,
        maleCount: sexCounts.male,
        femaleCount: sexCounts.female,
        ageTotal: members.reduce((sum, member) => sum + member.age, 0),
        appearanceTotal: members.reduce((sum, member) => sum + member.appearanceScoreBp, 0),
      }
    })
    .sort((left, right) => compareStrings(left.key, right.key))
}

function calculateDefaultMaximum(applicantCount: number): number {
  return Math.min(
    ABSOLUTE_MAX_EVALUATIONS,
    Math.max(MIN_DEFAULT_EVALUATIONS, applicantCount * DEFAULT_EVALUATIONS_PER_APPLICANT),
  )
}

function teamCapacityUpperBound(maleCount: number, femaleCount: number): number {
  // Every normal or bundle-exception team consumes exactly three men and at
  // least two women. The bound deliberately ignores bundle availability, so
  // it can overestimate but never prune a feasible allocation.
  return Math.min(Math.floor(maleCount / 3), Math.floor(femaleCount / 2))
}

function compareSoloUnitsForFeasibility(left: AllocationUnit, right: AllocationUnit): number {
  const leftMember = left.members[0]
  const rightMember = right.members[0]
  return (
    leftMember.age - rightMember.age ||
    leftMember.appearanceScoreBp - rightMember.appearanceScoreBp ||
    compareStrings(left.key, right.key)
  )
}

/**
 * An exact team-count candidate for large solo pools.
 *
 * Once each sex is sorted by age, interval compatibility admits an uncrossed
 * optimum: selected same-sex members can be kept consecutive and teams can be
 * ordered without reducing their count. The dynamic program therefore walks
 * the male/female age prefixes, either skipping one applicant or consuming a
 * 3M2F team. Four rolling score rows keep memory linear in one sex;
 * one byte per prefix pair retains a deterministic reconstruction path.
 *
 * The normal bounded passes still compete with this candidate, so they can
 * improve quality only when they preserve the exact completed-team count.
 */
function runSoloAgeDomainDp(
  units: readonly AllocationUnit[],
  activities: TonightActivityTuple,
  budget: EvaluationBudget,
  capacityProfile: AllocationCapacityProfile | null,
): InternalAllocation | null {
  if (
    units.length <= MAX_AUGMENTING_POOL_UNITS ||
    units.some((unit) => unit.size !== 1)
  ) {
    return null
  }

  const maleUnits = units
    .filter((unit) => unit.maleCount === 1)
    .sort(compareSoloUnitsForFeasibility)
  const femaleUnits = units
    .filter((unit) => unit.femaleCount === 1)
    .sort(compareSoloUnitsForFeasibility)
  const femaleWidth = femaleUnits.length + 1
  const parent = new Uint8Array((maleUnits.length + 1) * femaleWidth)
  const scoreRows = Array.from({ length: 4 }, () => new Uint16Array(femaleWidth))

  const isCompatible = (
    maleEnd: number,
    maleCount: 2 | 3,
    femaleEnd: number,
    femaleCount: 2 | 3,
  ): boolean => {
    const youngestMaleAge = maleUnits[maleEnd - maleCount].members[0].age
    const oldestMaleAge = maleUnits[maleEnd - 1].members[0].age
    const youngestFemaleAge = femaleUnits[femaleEnd - femaleCount].members[0].age
    const oldestFemaleAge = femaleUnits[femaleEnd - 1].members[0].age
    return (
      oldestMaleAge - youngestFemaleAge <= TONIGHT_MAX_OPPOSITE_SEX_AGE_GAP &&
      oldestFemaleAge - youngestMaleAge <= TONIGHT_MAX_OPPOSITE_SEX_AGE_GAP
    )
  }

  for (let maleEnd = 0; maleEnd <= maleUnits.length; maleEnd += 1) {
    const scoreRow = scoreRows[maleEnd % scoreRows.length]
    scoreRow.fill(0)
    for (let femaleEnd = 0; femaleEnd <= femaleUnits.length; femaleEnd += 1) {
      if (maleEnd === 0 && femaleEnd === 0) continue
      budget.consume()
      const parentIndex = maleEnd * femaleWidth + femaleEnd
      let bestScore = maleEnd > 0
        ? scoreRows[(maleEnd - 1) % scoreRows.length][femaleEnd]
        : 0
      let direction = maleEnd > 0 ? 1 : 2

      if (femaleEnd > 0 && scoreRow[femaleEnd - 1] > bestScore) {
        bestScore = scoreRow[femaleEnd - 1]
        direction = 2
      }
      if (
        maleEnd >= 3 &&
        femaleEnd >= 2 &&
        isCompatible(maleEnd, 3, femaleEnd, 2)
      ) {
        const proposal =
          scoreRows[(maleEnd - 3) % scoreRows.length][femaleEnd - 2] + 1
        if (proposal > bestScore) {
          bestScore = proposal
          direction = 4
        }
      }

      scoreRow[femaleEnd] = bestScore
      parent[parentIndex] = direction
    }
  }

  const teams: InternalTeam[] = []
  let maleEnd = maleUnits.length
  let femaleEnd = femaleUnits.length
  while (maleEnd > 0 || femaleEnd > 0) {
    const direction = parent[maleEnd * femaleWidth + femaleEnd]
    if (direction === 1) {
      maleEnd -= 1
      continue
    }
    if (direction === 2) {
      femaleEnd -= 1
      continue
    }

    const maleCount = 3
    const femaleCount = 2
    const selectedUnits = [
      ...maleUnits.slice(maleEnd - maleCount, maleEnd),
      ...femaleUnits.slice(femaleEnd - femaleCount, femaleEnd),
    ]
    const team = makeInternalTeam(selectedUnits, activities)
    if (!team) return null
    teams.push(team)
    maleEnd -= maleCount
    femaleEnd -= femaleCount
  }

  const capacityBoundTeams = capacityProfile
    ? teams.slice(0, capacityProfile.teamSlots)
    : teams
  const capacityBoundKeys = new Set(
    capacityBoundTeams.flatMap((team) => team.units.map((unit) => unit.key)),
  )
  return {
    teams: capacityBoundTeams,
    waitlisted: units.filter((unit) => !capacityBoundKeys.has(unit.key)),
  }
}

function resolveTotals(
  members: readonly TonightAllocationApplicant[],
  activities: TonightActivityTuple,
): TonightActivityResolution {
  const totals = activities.map((activityId) => ({
    activityId,
    points: 0,
    firstChoiceCount: 0,
    secondChoiceCount: 0,
  }))
  const byActivity = new Map(totals.map((row) => [row.activityId, row]))

  for (const member of members) {
    member.activityRanking.forEach((activityId, index) => {
      const row = byActivity.get(activityId)
      if (!row) return
      row.points += 3 - index
      if (index === 0) row.firstChoiceCount += 1
      if (index === 1) row.secondChoiceCount += 1
    })
  }

  const tupleIndex = new Map(activities.map((activityId, index) => [activityId, index]))
  const winner = [...totals].sort(
    (left, right) =>
      right.points - left.points ||
      right.firstChoiceCount - left.firstChoiceCount ||
      right.secondChoiceCount - left.secondChoiceCount ||
      (tupleIndex.get(left.activityId) ?? 0) - (tupleIndex.get(right.activityId) ?? 0),
  )[0]

  return { activityId: winner.activityId, totals }
}

/** Resolves only aggregated post-allocation Borda totals; it never returns ballots. */
export function resolveTonightTeamActivity(
  members: readonly TonightAllocationApplicant[],
  activities: TonightActivityTuple,
): TonightActivityResolution {
  return resolveTotals(members, activities)
}

function makeInternalTeam(
  units: readonly AllocationUnit[],
  activities: TonightActivityTuple,
): InternalTeam | null {
  const members = units
    .flatMap((unit) => unit.members)
    .sort((left, right) => compareStrings(left.applicantId, right.applicantId))
  const objective = scoreTonightTeamObjective(members)
  if (!objective) return null
  return {
    units: [...units].sort((left, right) => compareStrings(left.key, right.key)),
    members,
    objective,
    activity: resolveTotals(members, activities),
  }
}

function compareTeamProposal(left: TeamProposal, right: TeamProposal): number {
  return (
    left.projectedRemainingTeamCapacity - right.projectedRemainingTeamCapacity ||
    left.team.objective.minimumPairQualityBp - right.team.objective.minimumPairQualityBp ||
    left.team.objective.totalPairQualityBp - right.team.objective.totalPairQualityBp ||
    -compareStrings(left.team.objective.signature, right.team.objective.signature)
  )
}

function neighbourhoodForAnchor(
  anchorIndex: number,
  order: readonly AllocationUnit[],
  previousActiveIndex: readonly number[],
  nextActiveIndex: readonly number[],
): AllocationUnit[] {
  const result: AllocationUnit[] = []
  let leftIndex = previousActiveIndex[anchorIndex]
  let rightIndex = nextActiveIndex[anchorIndex]

  while (
    result.length < CANDIDATE_UNIT_WINDOW - 1 &&
    (leftIndex >= 0 || rightIndex >= 0)
  ) {
    if (leftIndex >= 0) {
      result.push(order[leftIndex])
      leftIndex = previousActiveIndex[leftIndex]
    }
    if (result.length >= CANDIDATE_UNIT_WINDOW - 1) break
    if (rightIndex >= 0) {
      result.push(order[rightIndex])
      rightIndex = nextActiveIndex[rightIndex]
    }
  }

  return result
}

function findBestTeamContainingAnchor(
  anchor: AllocationUnit,
  neighbours: readonly AllocationUnit[],
  remainingMaleCount: number,
  remainingFemaleCount: number,
  activities: TonightActivityTuple,
  budget: EvaluationBudget,
  preserveCountBound: boolean,
  maximumMemberCount: 5 | 6 = MAX_TEAM_SIZE,
): InternalTeam | null {
  if (anchor.size > maximumMemberCount || !isTonightPartialTeamFeasible(anchor.members)) return null

  const candidates = [anchor, ...neighbours]
  const best: { proposal: TeamProposal | null } = { proposal: null }

  const visit = (
    nextIndex: number,
    selectedUnits: readonly AllocationUnit[],
    selectedMembers: readonly TonightAllocationApplicant[],
    maleCount: number,
    femaleCount: number,
  ): void => {
    budget.consume()
    if (selectedMembers.length >= NORMAL_TEAM_SIZE) {
      const team = makeInternalTeam(selectedUnits, activities)
      if (team) {
        const proposal: TeamProposal = {
          team,
          projectedRemainingTeamCapacity: teamCapacityUpperBound(
            remainingMaleCount - maleCount,
            remainingFemaleCount - femaleCount,
          ),
        }
        if (!best.proposal || compareTeamProposal(proposal, best.proposal) > 0) {
          best.proposal = proposal
        }
      }
      if (team || selectedMembers.length === maximumMemberCount) return
    }
    if (selectedMembers.length > maximumMemberCount) return

    for (let index = nextIndex; index < candidates.length; index += 1) {
      const unit = candidates[index]
      if (selectedMembers.length + unit.size > maximumMemberCount) continue
      const nextMaleCount = maleCount + unit.maleCount
      const nextFemaleCount = femaleCount + unit.femaleCount
      if (nextMaleCount > 3 || nextFemaleCount > 3) continue
      const nextMembers = [...selectedMembers, ...unit.members]
      if (!isTonightPartialTeamFeasible(nextMembers)) continue
      visit(
        index + 1,
        [...selectedUnits, unit],
        nextMembers,
        nextMaleCount,
        nextFemaleCount,
      )
    }
  }

  visit(1, [anchor], anchor.members, anchor.maleCount, anchor.femaleCount)
  if (
    preserveCountBound &&
    best.proposal &&
    best.proposal.projectedRemainingTeamCapacity <
      teamCapacityUpperBound(remainingMaleCount, remainingFemaleCount) - 1
  ) {
    return null
  }
  return best.proposal?.team ?? null
}

function runGreedyPass(
  units: readonly AllocationUnit[],
  activities: TonightActivityTuple,
  pass: number,
  budget: EvaluationBudget,
  preserveCountBound = pass < 2,
  capacityProfile: AllocationCapacityProfile | null = null,
): InternalAllocation {
  const order = orderedUnitsForPass(units, pass)
  const used = new Set<string>()
  const indexByKey = new Map(order.map((unit, index) => [unit.key, index]))
  const previousActiveIndex = order.map((_, index) => index - 1)
  const nextActiveIndex = order.map((_, index) => (index + 1 < order.length ? index + 1 : -1))
  const teams: InternalTeam[] = []
  let remainingMaleCount = units.reduce((sum, unit) => sum + unit.maleCount, 0)
  let remainingFemaleCount = units.reduce((sum, unit) => sum + unit.femaleCount, 0)

  for (const anchor of order) {
    if (capacityProfile && teams.length >= capacityProfile.teamSlots) break
    if (used.has(anchor.key)) continue
    const anchorIndex = indexByKey.get(anchor.key)
    if (anchorIndex === undefined) continue
    const neighbours = neighbourhoodForAnchor(
      anchorIndex,
      order,
      previousActiveIndex,
      nextActiveIndex,
    )
    const team = findBestTeamContainingAnchor(
      anchor,
      neighbours,
      remainingMaleCount,
      remainingFemaleCount,
      activities,
      budget,
      preserveCountBound,
      maximumTeamSize(remainingCapacity(capacityProfile, teams)),
    )
    if (!team) continue

    for (const unit of team.units) {
      used.add(unit.key)
      remainingMaleCount -= unit.maleCount
      remainingFemaleCount -= unit.femaleCount
      const unitIndex = indexByKey.get(unit.key)
      if (unitIndex !== undefined) {
        const previous = previousActiveIndex[unitIndex]
        const next = nextActiveIndex[unitIndex]
        if (previous >= 0) nextActiveIndex[previous] = next
        if (next >= 0) previousActiveIndex[next] = previous
        previousActiveIndex[unitIndex] = -1
        nextActiveIndex[unitIndex] = -1
      }
    }
    teams.push(team)
  }

  return {
    teams,
    waitlisted: units.filter((unit) => !used.has(unit.key)),
  }
}

function findBestSingleTeam(
  units: readonly AllocationUnit[],
  activities: TonightActivityTuple,
  pass: number,
  budget: EvaluationBudget,
  maximumMemberCount: 5 | 6 = MAX_TEAM_SIZE,
): InternalTeam | null {
  const order = orderedUnitsForPass(units, pass)
  const maleCount = units.reduce((sum, unit) => sum + unit.maleCount, 0)
  const femaleCount = units.reduce((sum, unit) => sum + unit.femaleCount, 0)
  let best: InternalTeam | null = null

  for (const anchor of order) {
    const neighbours = order.filter((unit) => unit.key !== anchor.key)
    const candidate = findBestTeamContainingAnchor(
      anchor,
      neighbours,
      maleCount,
      femaleCount,
      activities,
      budget,
      false,
      maximumMemberCount,
    )
    if (!candidate) continue
    if (
      !best ||
      candidate.objective.minimumPairQualityBp > best.objective.minimumPairQualityBp ||
      (candidate.objective.minimumPairQualityBp === best.objective.minimumPairQualityBp &&
        candidate.objective.totalPairQualityBp > best.objective.totalPairQualityBp) ||
      (candidate.objective.minimumPairQualityBp === best.objective.minimumPairQualityBp &&
        candidate.objective.totalPairQualityBp === best.objective.totalPairQualityBp &&
        compareStrings(candidate.objective.signature, best.objective.signature) < 0)
    ) {
      best = candidate
    }
  }

  return best
}

function allocationSignature(allocation: InternalAllocation): string {
  return JSON.stringify(
    allocation.teams
      .map((team) => team.objective.signature)
      .sort(compareStrings),
  )
}

function compareAllocations(left: InternalAllocation, right: InternalAllocation): number {
  const leftMinimum =
    left.teams.length === 0
      ? 0
      : Math.min(...left.teams.map((team) => team.objective.minimumPairQualityBp))
  const rightMinimum =
    right.teams.length === 0
      ? 0
      : Math.min(...right.teams.map((team) => team.objective.minimumPairQualityBp))
  const leftTotal = left.teams.reduce(
    (sum, team) => sum + team.objective.totalPairQualityBp,
    0,
  )
  const rightTotal = right.teams.reduce(
    (sum, team) => sum + team.objective.totalPairQualityBp,
    0,
  )

  return (
    left.teams.length - right.teams.length ||
    leftMinimum - rightMinimum ||
    leftTotal - rightTotal ||
    -compareStrings(allocationSignature(left), allocationSignature(right))
  )
}

/**
 * Finds the lexicographically best set-packing inside a deliberately small
 * repair pool. Opening every team represented by the pool lets the search
 * replace several existing teams at once instead of getting trapped by a
 * one-team swap. The 20-unit ceiling keeps the memoized state space bounded
 * while admitting the smallest known three-team augmenting component.
 */
function allocateRepairPoolExactly(
  units: readonly AllocationUnit[],
  activities: TonightActivityTuple,
  budget: EvaluationBudget,
  externalMinimumQualityBp = 10_000,
  capacityProfile: AllocationCapacityProfile | null = null,
): InternalAllocation {
  if (units.length > MAX_AUGMENTING_POOL_UNITS) {
    throw new Error('Tonight exact repair pool exceeded its fixed unit boundary')
  }

  const orderedUnits = [...units].sort((left, right) => compareStrings(left.key, right.key))
  if (capacityProfile?.teamSlots === 0) {
    return { teams: [], waitlisted: orderedUnits }
  }
  const teamCandidates: RepairTeamCandidate[] = []
  const suffixMemberCounts = Array.from({ length: orderedUnits.length + 1 }, () => 0)
  for (let index = orderedUnits.length - 1; index >= 0; index -= 1) {
    suffixMemberCounts[index] = suffixMemberCounts[index + 1] + orderedUnits[index].size
  }

  const enumerateTeams = (
    nextIndex: number,
    selectedUnits: readonly AllocationUnit[],
    selectedMembers: readonly TonightAllocationApplicant[],
    selectedMask: number,
    maleCount: number,
    femaleCount: number,
  ): void => {
    budget.consume()
    if (selectedMembers.length >= NORMAL_TEAM_SIZE) {
      const team = makeInternalTeam(selectedUnits, activities)
      if (team && team.members.length <= maximumTeamSize(capacityProfile)) {
        teamCandidates.push({ mask: selectedMask, team })
      }
      if (team || selectedMembers.length === maximumTeamSize(capacityProfile)) return
    }
    if (
      selectedMembers.length > maximumTeamSize(capacityProfile) ||
      nextIndex >= orderedUnits.length ||
      selectedMembers.length + suffixMemberCounts[nextIndex] < NORMAL_TEAM_SIZE
    ) {
      return
    }

    for (let index = nextIndex; index < orderedUnits.length; index += 1) {
      const unit = orderedUnits[index]
      if (selectedMembers.length + unit.size > maximumTeamSize(capacityProfile)) continue
      const nextMaleCount = maleCount + unit.maleCount
      const nextFemaleCount = femaleCount + unit.femaleCount
      if (nextMaleCount > 3 || nextFemaleCount > 3) continue
      const nextMembers = [...selectedMembers, ...unit.members]
      if (!isTonightPartialTeamFeasible(nextMembers)) continue
      enumerateTeams(
        index + 1,
        [...selectedUnits, unit],
        nextMembers,
        selectedMask | (1 << index),
        nextMaleCount,
        nextFemaleCount,
      )
    }
  }

  enumerateTeams(0, [], [], 0, 0, 0)

  const candidatesByUnit = Array.from(
    { length: orderedUnits.length },
    () => [] as RepairTeamCandidate[],
  )
  for (const candidate of teamCandidates) {
    for (let index = 0; index < orderedUnits.length; index += 1) {
      if ((candidate.mask & (1 << index)) !== 0) candidatesByUnit[index].push(candidate)
    }
  }
  for (const candidates of candidatesByUnit) {
    candidates.sort((left, right) =>
      compareStrings(left.team.objective.signature, right.team.objective.signature),
    )
  }

  const totalMemberCount = orderedUnits.reduce((sum, unit) => sum + unit.size, 0)
  const teamSlotLimit = Math.min(
    Math.floor(totalMemberCount / NORMAL_TEAM_SIZE),
    capacityProfile?.teamSlots ?? Number.POSITIVE_INFINITY,
  )
  const sixPersonTeamSlotLimit = Math.min(
    teamSlotLimit,
    capacityProfile?.sixPersonTeamSlots ?? teamSlotLimit,
  )
  const maximumCountMemo = new Map<string, number>()
  const maximumTeamCount = (
    availableMask: number,
    teamSlotsRemaining: number,
    sixPersonTeamSlotsRemaining: number,
  ): number => {
    const key = `${availableMask}:${teamSlotsRemaining}:${sixPersonTeamSlotsRemaining}`
    const cached = maximumCountMemo.get(key)
    if (cached !== undefined) return cached
    budget.consume()
    if (availableMask === 0 || teamSlotsRemaining === 0) {
      maximumCountMemo.set(key, 0)
      return 0
    }

    const lowestBit = availableMask & -availableMask
    const firstIndex = 31 - Math.clz32(lowestBit)
    let best = maximumTeamCount(
      availableMask ^ lowestBit,
      teamSlotsRemaining,
      sixPersonTeamSlotsRemaining,
    )
    for (const candidate of candidatesByUnit[firstIndex]) {
      if ((candidate.mask & availableMask) !== candidate.mask) continue
      const consumesSixPersonSlot = candidate.team.members.length === 6
      if (consumesSixPersonSlot && sixPersonTeamSlotsRemaining === 0) continue
      budget.consume()
      best = Math.max(
        best,
        1 + maximumTeamCount(
          availableMask ^ candidate.mask,
          teamSlotsRemaining - 1,
          sixPersonTeamSlotsRemaining - (consumesSixPersonSlot ? 1 : 0),
        ),
      )
    }
    maximumCountMemo.set(key, best)
    return best
  }

  const fullMask = (1 << orderedUnits.length) - 1
  const targetTeamCount = maximumTeamCount(
    fullMask,
    teamSlotLimit,
    sixPersonTeamSlotLimit,
  )

  // A bottleneck objective needs the requested suffix count in its memo key.
  // This avoids incorrectly discarding a lower-minimum/higher-total suffix
  // before an outer team's lower score caps both alternatives to the same
  // global minimum.
  const maximumMinimumMemo = new Map<string, number>()
  const maximumMinimumQuality = (
    availableMask: number,
    teamsNeeded: number,
    sixPersonTeamSlotsRemaining: number,
  ): number => {
    if (teamsNeeded === 0) return 10_000
    if (
      maximumTeamCount(availableMask, teamsNeeded, sixPersonTeamSlotsRemaining) < teamsNeeded
    ) return -1
    const key = `${availableMask}:${teamsNeeded}:${sixPersonTeamSlotsRemaining}`
    const cached = maximumMinimumMemo.get(key)
    if (cached !== undefined) return cached
    budget.consume()

    const lowestBit = availableMask & -availableMask
    const firstIndex = 31 - Math.clz32(lowestBit)
    let best = maximumMinimumQuality(
      availableMask ^ lowestBit,
      teamsNeeded,
      sixPersonTeamSlotsRemaining,
    )
    for (const candidate of candidatesByUnit[firstIndex]) {
      if ((candidate.mask & availableMask) !== candidate.mask) continue
      const consumesSixPersonSlot = candidate.team.members.length === 6
      if (consumesSixPersonSlot && sixPersonTeamSlotsRemaining === 0) continue
      const remainderMinimum = maximumMinimumQuality(
        availableMask ^ candidate.mask,
        teamsNeeded - 1,
        sixPersonTeamSlotsRemaining - (consumesSixPersonSlot ? 1 : 0),
      )
      if (remainderMinimum < 0) continue
      budget.consume()
      best = Math.max(
        best,
        Math.min(candidate.team.objective.minimumPairQualityBp, remainderMinimum),
      )
    }

    maximumMinimumMemo.set(key, best)
    return best
  }

  const minimumQualityThreshold = Math.min(
    externalMinimumQualityBp,
    maximumMinimumQuality(fullMask, targetTeamCount, sixPersonTeamSlotLimit),
  )
  const bestTeamsMemo = new Map<string, readonly InternalTeam[] | null>()
  const totalQuality = (teams: readonly InternalTeam[]): number =>
    teams.reduce((sum, team) => sum + team.objective.totalPairQualityBp, 0)
  const compareAdditiveSolutions = (
    left: readonly InternalTeam[],
    right: readonly InternalTeam[],
  ): number =>
    totalQuality(left) - totalQuality(right) ||
    -compareStrings(
      allocationSignature({ teams: left, waitlisted: [] }),
      allocationSignature({ teams: right, waitlisted: [] }),
    )

  const bestTeamsAtThreshold = (
    availableMask: number,
    teamsNeeded: number,
    sixPersonTeamSlotsRemaining: number,
  ): readonly InternalTeam[] | null => {
    if (teamsNeeded === 0) return []
    if (
      maximumTeamCount(availableMask, teamsNeeded, sixPersonTeamSlotsRemaining) < teamsNeeded
    ) return null
    const key = `${availableMask}:${teamsNeeded}:${sixPersonTeamSlotsRemaining}`
    if (bestTeamsMemo.has(key)) return bestTeamsMemo.get(key) ?? null
    budget.consume()

    const lowestBit = availableMask & -availableMask
    const firstIndex = 31 - Math.clz32(lowestBit)
    let best = bestTeamsAtThreshold(
      availableMask ^ lowestBit,
      teamsNeeded,
      sixPersonTeamSlotsRemaining,
    )
    for (const candidate of candidatesByUnit[firstIndex]) {
      if (
        candidate.team.objective.minimumPairQualityBp < minimumQualityThreshold ||
        (candidate.mask & availableMask) !== candidate.mask
      ) {
        continue
      }
      const consumesSixPersonSlot = candidate.team.members.length === 6
      if (consumesSixPersonSlot && sixPersonTeamSlotsRemaining === 0) continue
      const remainder = bestTeamsAtThreshold(
        availableMask ^ candidate.mask,
        teamsNeeded - 1,
        sixPersonTeamSlotsRemaining - (consumesSixPersonSlot ? 1 : 0),
      )
      if (!remainder) continue
      budget.consume()
      const proposal = [candidate.team, ...remainder]
      if (!best || compareAdditiveSolutions(proposal, best) > 0) best = proposal
    }

    bestTeamsMemo.set(key, best)
    return best
  }

  const teams = bestTeamsAtThreshold(
    fullMask,
    targetTeamCount,
    sixPersonTeamSlotLimit,
  ) ?? []
  const selectedKeys = new Set(teams.flatMap((team) => team.units.map((unit) => unit.key)))
  return {
    teams,
    waitlisted: orderedUnits.filter((unit) => !selectedKeys.has(unit.key)),
  }
}

function allAllocationUnits(allocation: InternalAllocation): AllocationUnit[] {
  return [...allocation.teams.flatMap((team) => team.units), ...allocation.waitlisted].sort(
    (left, right) => compareStrings(left.key, right.key),
  )
}

function makeMultiTeamRepairProposal(
  current: InternalAllocation,
  openedTeams: readonly InternalTeam[],
  includedWaitlist: readonly AllocationUnit[],
  activities: TonightActivityTuple,
  budget: EvaluationBudget,
  capacityProfile: AllocationCapacityProfile | null,
): InternalAllocation {
  const openedSignatures = new Set(openedTeams.map((team) => team.objective.signature))
  const includedWaitlistKeys = new Set(includedWaitlist.map((unit) => unit.key))
  const repairPool = [...openedTeams.flatMap((team) => team.units), ...includedWaitlist]
  const untouchedTeams = current.teams.filter(
    (team) => !openedSignatures.has(team.objective.signature),
  )
  const externalMinimumQualityBp =
    untouchedTeams.length === 0
      ? 10_000
      : Math.min(...untouchedTeams.map((team) => team.objective.minimumPairQualityBp))
  const rebuilt = allocateRepairPoolExactly(
    repairPool,
    activities,
    budget,
    externalMinimumQualityBp,
    remainingCapacity(capacityProfile, untouchedTeams),
  )
  return {
    teams: [...untouchedTeams, ...rebuilt.teams],
    waitlisted: [
      ...current.waitlisted.filter((unit) => !includedWaitlistKeys.has(unit.key)),
      ...rebuilt.waitlisted,
    ],
  }
}

function memberAgeDistance(
  left: TonightAllocationApplicant,
  right: TonightAllocationApplicant,
): number {
  return Math.abs(left.age - right.age)
}

function unitRepairDistance(left: AllocationUnit, right: AllocationUnit): number {
  if (
    left.size + right.size <= MAX_TEAM_SIZE &&
    isTonightPartialTeamFeasible([...left.members, ...right.members])
  ) {
    return 0
  }

  let minimum = Number.POSITIVE_INFINITY
  for (const leftMember of left.members) {
    for (const rightMember of right.members) {
      minimum = Math.min(minimum, memberAgeDistance(leftMember, rightMember))
    }
  }
  return minimum
}

function teamRepairDistance(team: InternalTeam, unit: AllocationUnit): number {
  return Math.min(...team.units.map((teamUnit) => unitRepairDistance(teamUnit, unit)))
}

interface BundleAugmentCandidate {
  openedTeams: readonly InternalTeam[]
  seedWaitlistUnit: AllocationUnit
  distance: number
  signature: string
}

function enumerateBundleAugmentCandidates(current: InternalAllocation): BundleAugmentCandidate[] {
  const bySignature = new Map<string, BundleAugmentCandidate>()
  const orderedWaitlist = [...current.waitlisted].sort((left, right) =>
    compareStrings(left.key, right.key),
  ).slice(0, MAX_BUNDLE_AUGMENT_WAITLIST_SEEDS)

  for (const seedWaitlistUnit of orderedWaitlist) {
    const nearbyTeams = [...current.teams]
      .sort(
        (left, right) =>
          teamRepairDistance(left, seedWaitlistUnit) -
            teamRepairDistance(right, seedWaitlistUnit) ||
          left.units.length - right.units.length ||
          compareStrings(left.objective.signature, right.objective.signature),
      )
      .slice(0, MAX_BUNDLE_AUGMENT_TEAM_CHOICES)

    const visit = (nextIndex: number, selectedTeams: readonly InternalTeam[]): void => {
      if (selectedTeams.length > 0) {
        const openedUnitCount = selectedTeams.reduce(
          (sum, team) => sum + team.units.length,
          0,
        )
        if (openedUnitCount < MAX_AUGMENTING_POOL_UNITS) {
          const signatures = selectedTeams
            .map((team) => team.objective.signature)
            .sort(compareStrings)
          const signature = JSON.stringify(signatures)
          const distance = selectedTeams.reduce(
            (sum, team) => sum + teamRepairDistance(team, seedWaitlistUnit),
            0,
          )
          const previous = bySignature.get(signature)
          const candidate = {
            openedTeams: [...selectedTeams],
            seedWaitlistUnit,
            distance,
            signature,
          }
          if (
            !previous ||
            candidate.distance < previous.distance ||
            (candidate.distance === previous.distance &&
              compareStrings(candidate.seedWaitlistUnit.key, previous.seedWaitlistUnit.key) < 0)
          ) {
            bySignature.set(signature, candidate)
          }
        }
      }
      if (selectedTeams.length === 3) return

      for (let index = nextIndex; index < nearbyTeams.length; index += 1) {
        const team = nearbyTeams[index]
        const openedUnitCount =
          selectedTeams.reduce((sum, selected) => sum + selected.units.length, 0) +
          team.units.length
        if (openedUnitCount >= MAX_AUGMENTING_POOL_UNITS) continue
        visit(index + 1, [...selectedTeams, team])
      }
    }

    visit(0, [])
  }

  return [...bySignature.values()]
    .sort(
      (left, right) =>
        left.openedTeams.length - right.openedTeams.length ||
        left.distance - right.distance ||
        left.openedTeams.reduce((sum, team) => sum + team.units.length, 0) -
          right.openedTeams.reduce((sum, team) => sum + team.units.length, 0) ||
        compareStrings(left.signature, right.signature),
    )
    .slice(0, MAX_BUNDLE_AUGMENT_CANDIDATES_PER_ROUND)
}

function selectBundleAugmentWaitlist(
  current: InternalAllocation,
  candidate: BundleAugmentCandidate,
): AllocationUnit[] {
  const openedUnitCount = candidate.openedTeams.reduce(
    (sum, team) => sum + team.units.length,
    0,
  )
  const maximumWaitlistUnits = MAX_AUGMENTING_POOL_UNITS - openedUnitCount
  const openedUnits = candidate.openedTeams.flatMap((team) => team.units)

  return [...current.waitlisted]
    .sort((left, right) => {
      if (left.key === candidate.seedWaitlistUnit.key) return -1
      if (right.key === candidate.seedWaitlistUnit.key) return 1
      const leftDistance = Math.min(
        ...openedUnits.map((openedUnit) => unitRepairDistance(openedUnit, left)),
      )
      const rightDistance = Math.min(
        ...openedUnits.map((openedUnit) => unitRepairDistance(openedUnit, right)),
      )
      return (
        leftDistance - rightDistance ||
        right.size - left.size ||
        compareStrings(left.key, right.key)
      )
    })
    .slice(0, maximumWaitlistUnits)
}

/**
 * Grows bundled allocations through bounded exact augmenting components.
 * Each proposal opens at most three existing teams and at most twenty atomic
 * units, then accepts it only when the completed-team count increases. This
 * keeps the exponential solver local and prevents a quality-only move from
 * consuming the deterministic recovery budget.
 */
function runBundleAugmentingRecovery(
  initial: InternalAllocation,
  activities: TonightActivityTuple,
  budget: EvaluationBudget,
  capacityProfile: AllocationCapacityProfile | null,
): InternalAllocation {
  let current = initial
  const everyUnit = allAllocationUnits(initial)
  if (
    everyUnit.length > MAX_BUNDLE_AUGMENT_POOL_UNITS ||
    everyUnit.every((unit) => unit.size === 1)
  ) {
    return current
  }

  const totalMaleCount = everyUnit.reduce((sum, unit) => sum + unit.maleCount, 0)
  const totalFemaleCount = everyUnit.reduce((sum, unit) => sum + unit.femaleCount, 0)
  const theoreticalTeamCount = Math.min(
    teamCapacityUpperBound(totalMaleCount, totalFemaleCount),
    capacityProfile?.teamSlots ?? Number.POSITIVE_INFINITY,
  )

  for (
    let round = 0;
    round < MAX_BUNDLE_AUGMENT_ROUNDS &&
    current.teams.length < theoreticalTeamCount &&
    current.waitlisted.reduce((sum, unit) => sum + unit.size, 0) >= 5;
    round += 1
  ) {
    let growth: InternalAllocation | null = null
    const candidates = enumerateBundleAugmentCandidates(current)
    for (const candidate of candidates) {
      const includedWaitlist = selectBundleAugmentWaitlist(current, candidate)
      const repairMemberCount =
        candidate.openedTeams.reduce((sum, team) => sum + team.members.length, 0) +
        includedWaitlist.reduce((sum, unit) => sum + unit.size, 0)
      if (repairMemberCount < (candidate.openedTeams.length + 1) * 5) continue

      const proposal = makeMultiTeamRepairProposal(
        current,
        candidate.openedTeams,
        includedWaitlist,
        activities,
        budget,
        capacityProfile,
      )
      if (proposal.teams.length > current.teams.length) {
        growth = proposal
        break
      }
    }

    if (!growth) break
    current = growth
  }

  return current
}

function repairAllocation(
  initial: InternalAllocation,
  activities: TonightActivityTuple,
  pass: number,
  budget: EvaluationBudget,
  onAttempt: () => boolean,
  capacityProfile: AllocationCapacityProfile | null,
): InternalAllocation {
  let current = initial
  let attemptsThisPass = 0
  const beginAttempt = (): boolean => {
    if (attemptsThisPass >= MAX_REPAIR_ATTEMPTS_PER_PASS || !onAttempt()) return false
    attemptsThisPass += 1
    return true
  }
  const teamCandidates = [...initial.teams].sort(
    (left, right) =>
      left.objective.minimumPairQualityBp - right.objective.minimumPairQualityBp ||
      compareStrings(left.objective.signature, right.objective.signature),
  )

  const everyUnit = allAllocationUnits(current)
  if (everyUnit.length <= MAX_AUGMENTING_POOL_UNITS) {
    // The pool is identical in every ordering pass. Solve it once, while the
    // remaining passes still run and compete through the common objective.
    if (pass !== 0) return current
    if (!beginAttempt()) return current
    const exact = allocateRepairPoolExactly(
      everyUnit,
      activities,
      budget,
      10_000,
      capacityProfile,
    )
    return compareAllocations(exact, current) > 0 ? exact : current
  }

  const totalMaleCount = everyUnit.reduce((sum, unit) => sum + unit.maleCount, 0)
  const totalFemaleCount = everyUnit.reduce((sum, unit) => sum + unit.femaleCount, 0)
  const theoreticalTeamCount = Math.min(
    teamCapacityUpperBound(totalMaleCount, totalFemaleCount),
    capacityProfile?.teamSlots ?? Number.POSITIVE_INFINITY,
  )

  if (
    current.teams.length < theoreticalTeamCount &&
    current.waitlisted.length > 0 &&
    everyUnit.some((unit) => unit.size > 1)
  ) {
    const waitlistOrders = Array.from(
      { length: FIXED_PASS_COUNT },
      (_, offset) => orderedUnitsForPass(current.waitlisted, (pass + offset) % FIXED_PASS_COUNT),
    )
    const pairCandidates: Array<readonly [InternalTeam, InternalTeam]> = []
    const weakestTeams = teamCandidates.slice(0, Math.min(teamCandidates.length, 5))
    for (let leftIndex = 0; leftIndex < weakestTeams.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < weakestTeams.length; rightIndex += 1) {
        pairCandidates.push([weakestTeams[leftIndex], weakestTeams[rightIndex]])
      }
    }
    pairCandidates.sort(
      (left, right) =>
        left[0].units.length + left[1].units.length -
          (right[0].units.length + right[1].units.length) ||
        compareStrings(
          `${left[0].objective.signature}:${left[1].objective.signature}`,
          `${right[0].objective.signature}:${right[1].objective.signature}`,
        ),
    )

    let bestSameCountProposal = current

    for (let index = 0; index < pairCandidates.length; index += 1) {
      if (attemptsThisPass >= MAX_MULTI_TEAM_REPAIR_ATTEMPTS_PER_PASS) break
      const openedTeams = pairCandidates[index]
      const openedUnitCount = openedTeams[0].units.length + openedTeams[1].units.length
      const waitlistLimit = MAX_AUGMENTING_POOL_UNITS - openedUnitCount
      if (waitlistLimit <= 0) continue
      const includedWaitlist = waitlistOrders[index % waitlistOrders.length].slice(0, waitlistLimit)
      const repairMemberCount =
        openedTeams[0].members.length +
        openedTeams[1].members.length +
        includedWaitlist.reduce((sum, unit) => sum + unit.size, 0)
      if (repairMemberCount < 15 || !beginAttempt()) continue

      const proposal = makeMultiTeamRepairProposal(
        current,
        openedTeams,
        includedWaitlist,
        activities,
        budget,
        capacityProfile,
      )
      if (proposal.teams.length > current.teams.length) {
        current = proposal
        // Pair candidates were derived from the pre-repair allocation. Stop
        // before another candidate could refer to a team that was just opened.
        break
      }
      if (compareAllocations(proposal, bestSameCountProposal) > 0) {
        bestSameCountProposal = proposal
      }
    }

    if (
      current.teams.length < theoreticalTeamCount &&
      compareAllocations(bestSameCountProposal, current) > 0
    ) {
      current = bestSameCountProposal
    }
  }

  for (const originalTeam of teamCandidates) {
    if (attemptsThisPass >= MAX_REPAIR_ATTEMPTS_PER_PASS) break
    if (current.waitlisted.length === 0) break
    const liveTeamIndex = current.teams.findIndex(
      (team) => team.objective.signature === originalTeam.objective.signature,
    )
    if (liveTeamIndex < 0) continue

    if (!beginAttempt()) break
    const orderedWaitlist = orderedUnitsForPass(current.waitlisted, (pass + 1) % FIXED_PASS_COUNT)
    const includedWaitlist = orderedWaitlist.slice(0, MAX_REPAIR_WAITLIST_UNITS)
    const repairPool = [...current.teams[liveTeamIndex].units, ...includedWaitlist]
    const includedKeys = new Set(includedWaitlist.map((unit) => unit.key))
    const untouchedWaitlist = current.waitlisted.filter((unit) => !includedKeys.has(unit.key))
    const untouchedTeams = current.teams.filter((_, index) => index !== liveTeamIndex)
    const repairCapacity = remainingCapacity(capacityProfile, untouchedTeams)
    let bestProposal = current

    const bestSingleTeam = findBestSingleTeam(
      repairPool,
      activities,
      (pass + 1) % FIXED_PASS_COUNT,
      budget,
      maximumTeamSize(repairCapacity),
    )
    if (bestSingleTeam) {
      const selectedKeys = new Set(bestSingleTeam.units.map((unit) => unit.key))
      const qualityProposal: InternalAllocation = {
        teams: [
          ...current.teams.slice(0, liveTeamIndex),
          bestSingleTeam,
          ...current.teams.slice(liveTeamIndex + 1),
        ],
        waitlisted: [
          ...untouchedWaitlist,
          ...repairPool.filter((unit) => !selectedKeys.has(unit.key)),
        ],
      }
      if (compareAllocations(qualityProposal, bestProposal) > 0) bestProposal = qualityProposal
    }

    const rebuilt = runGreedyPass(
      repairPool,
      activities,
      (pass + 1) % FIXED_PASS_COUNT,
      budget,
      false,
      repairCapacity,
    )
    const growthProposal: InternalAllocation = {
      teams: [
        ...current.teams.slice(0, liveTeamIndex),
        ...rebuilt.teams,
        ...current.teams.slice(liveTeamIndex + 1),
      ],
      waitlisted: [...untouchedWaitlist, ...rebuilt.waitlisted],
    }
    if (compareAllocations(growthProposal, bestProposal) > 0) bestProposal = growthProposal
    current = bestProposal
  }

  return current
}

function toWaitlist(
  units: readonly AllocationUnit[],
  reason: TonightWaitlistReason,
): TonightWaitlistedUnit[] {
  return units
    .map((unit) => ({
      memberIds: unit.members.map((member) => member.applicantId).sort(compareStrings),
      reason,
    }))
    .sort((left, right) =>
      compareStrings(JSON.stringify(left.memberIds), JSON.stringify(right.memberIds)),
    )
}

function toTeam(team: InternalTeam): TonightAllocatedTeam {
  const sexCounts = countTonightSexes(team.members)
  return {
    memberIds: team.members.map((member) => member.applicantId).sort(compareStrings),
    sexCounts,
    activity: team.activity,
    quality: {
      minimumPairQualityBp: team.objective.minimumPairQualityBp,
      totalPairQualityBp: team.objective.totalPairQualityBp,
      averagePairQualityBp: team.objective.averagePairQualityBp,
      pairCount: team.objective.pairCount,
    },
  }
}

/**
 * Deterministic, bounded Tonight allocator.
 *
 * It evaluates four fixed greedy/beam-like orders plus bounded one-team and
 * multi-team augmenting repairs. All-solo pools use an age-domain DP, while
 * exact set-packing for friend bundles is restricted to at most twenty atomic
 * units. Larger bundled pools therefore produce a deterministic lower bound,
 * not an implicit proof of optimality. Any invalid input or exhausted budget
 * fails closed and publishes no partial team.
 */
export function allocateTonightTeams(
  input: TonightAllocationInput | null | undefined,
  capacities?: readonly TonightAllocationCapacity[],
): TonightAllocationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      status: 'invalid_input',
      teams: [],
      waitlistedUnits: [],
      issues: [{ code: 'invalid_root_input' }],
      allocationSignature: '',
      diagnostics: {
        evaluations: 0,
        maxEvaluations: MIN_DEFAULT_EVALUATIONS,
        passesCompleted: 0,
        repairAttempts: 0,
      },
    }
  }

  const issues = validateInput(input)
  const configuredMaximum = input.limits?.maxEvaluations
  const maxEvaluations =
    configuredMaximum ?? calculateDefaultMaximum(Array.isArray(input.applicants) ? input.applicants.length : 0)

  if (issues.length > 0) {
    return {
      status: 'invalid_input',
      teams: [],
      waitlistedUnits: [],
      issues,
      allocationSignature: '',
      diagnostics: { evaluations: 0, maxEvaluations, passesCompleted: 0, repairAttempts: 0 },
    }
  }

  let capacityProfile: AllocationCapacityProfile | null
  try {
    capacityProfile = toCapacityProfile(capacities)
  } catch {
    return {
      status: 'invalid_input',
      teams: [],
      waitlistedUnits: [],
      issues: [{ code: 'invalid_root_input' }],
      allocationSignature: '',
      diagnostics: { evaluations: 0, maxEvaluations, passesCompleted: 0, repairAttempts: 0 },
    }
  }

  const units = makeUnits(input.applicants)
  const budget = new EvaluationBudget(maxEvaluations)
  let best: InternalAllocation | null = null
  let passesCompleted = 0
  let repairAttempts = 0

  try {
    best = runSoloAgeDomainDp(units, input.activities, budget, capacityProfile)
    for (let pass = 0; pass < FIXED_PASS_COUNT; pass += 1) {
      const greedy = runGreedyPass(
        units,
        input.activities,
        pass,
        budget,
        pass < 2,
        capacityProfile,
      )
      const repaired = repairAllocation(
        greedy,
        input.activities,
        pass,
        budget,
        () => {
          if (repairAttempts >= MAX_REPAIR_ATTEMPTS) return false
          repairAttempts += 1
          return true
        },
        capacityProfile,
      )
      passesCompleted += 1
      if (!best || compareAllocations(repaired, best) > 0) best = repaired
    }
    if (best) {
      best = runBundleAugmentingRecovery(best, input.activities, budget, capacityProfile)
    }
  } catch (error) {
    if (!(error instanceof EvaluationBudgetExhausted)) throw error
    return {
      status: 'budget_exhausted',
      teams: [],
      waitlistedUnits: toWaitlist(units, 'budget_exhausted'),
      issues: [],
      allocationSignature: '',
      diagnostics: {
        evaluations: budget.used,
        maxEvaluations,
        passesCompleted,
        repairAttempts,
      },
    }
  }

  const allocation = best ?? { teams: [], waitlisted: units }
  const sortedTeams = [...allocation.teams].sort((left, right) =>
    compareStrings(left.objective.signature, right.objective.signature),
  )

  return {
    status: 'allocated',
    teams: sortedTeams.map(toTeam),
    waitlistedUnits: toWaitlist(allocation.waitlisted, 'no_feasible_team'),
    issues: [],
    allocationSignature: allocationSignature({ ...allocation, teams: sortedTeams }),
    diagnostics: {
      evaluations: budget.used,
      maxEvaluations,
      passesCompleted,
      repairAttempts,
    },
  }
}
