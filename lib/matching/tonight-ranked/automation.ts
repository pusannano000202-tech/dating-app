import type {
  TonightAllocationInput,
  TonightAllocationResult,
  TonightActivityResolution,
  TonightActivityTuple,
} from './contracts'
import { canonicalDepartmentKey, canonicalSchoolScopeKey } from '../department-identity'
import {
  countTonightSexes,
  scoreTonightTeamObjective,
} from './team-objective'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ALLOCATOR_APPLICATIONS = 10_000
const MAX_ALLOCATOR_CAPACITIES = 10_000
const MAX_ALLOCATOR_AVAILABLE_TEAM_SLOTS = 10_000
const EXACT_REPAIR_ATOMIC_UNIT_BOUNDARY = 20

interface AllocatorRound {
  id: string
  revision: number
  marketCode: 'PNU'
  serviceDate: string
}

interface AllocatorCapacity {
  id: string
  activityId: string
  availableTeamCount: number
  maxTeamHeadcount: 5 | 6
}

export interface ParsedTonightAllocatorPayload {
  round: AllocatorRound
  capacities: readonly AllocatorCapacity[]
  allocationInput: TonightAllocationInput
}

export interface TonightPublishAssignment {
  activity_id: string
  venue_capacity_id: string
  application_ids: readonly string[]
}

type PublishAssignmentsResult =
  | {
      status: 'ready'
      assignments: readonly TonightPublishAssignment[]
      publicSummary: { team_count: number; waitlisted_application_count: number }
    }
  | {
      status: 'no_publishable_teams' | 'allocator_failed'
      assignments: readonly []
      publicSummary: { team_count: 0; waitlisted_application_count: number }
    }
  | {
      status: 'allocation_unproven'
      assignments: readonly []
      certification: {
        lower_bound_team_count: number
        upper_bound_team_count: number
      }
      publicSummary: { team_count: 0; waitlisted_application_count: number }
    }

function fail(): never {
  throw new TypeError('invalid_allocator_payload')
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const result = value as Record<string, unknown>
  const actual = Object.keys(result).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail()
  return result
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail()
  return value.toLowerCase()
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail()
  return value
}

function string(value: unknown, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value || (pattern && !pattern.test(value))) fail()
  return value
}

function rankTeamActivities(
  activity: TonightActivityResolution,
  activities: TonightActivityTuple,
): readonly string[] | null {
  if (activity.totals.length !== activities.length) return null
  const tupleIndex = new Map(activities.map((activityId, index) => [activityId, index]))
  const seen = new Set<string>()
  for (const total of activity.totals) {
    if (
      !tupleIndex.has(total.activityId)
      || seen.has(total.activityId)
      || !Number.isInteger(total.points)
      || !Number.isInteger(total.firstChoiceCount)
      || !Number.isInteger(total.secondChoiceCount)
      || total.points < 0
      || total.firstChoiceCount < 0
      || total.secondChoiceCount < 0
    ) return null
    seen.add(total.activityId)
  }

  const ranked = [...activity.totals].sort(
    (left, right) =>
      right.points - left.points
      || right.firstChoiceCount - left.firstChoiceCount
      || right.secondChoiceCount - left.secondChoiceCount
      || (tupleIndex.get(left.activityId) ?? 0) - (tupleIndex.get(right.activityId) ?? 0),
  )
  if (ranked[0]?.activityId !== activity.activityId) return null
  return ranked.map((total) => total.activityId)
}

/**
 * Relaxed maximum using only total headcount. Every normal or three-woman-
 * bundle exception team consumes exactly three men and at least two women.
 * Age and friend-bundle constraints can only reduce this value, so reaching
 * it certifies that no allocation can contain more teams.
 * Keep this calculation aligned with team-allocation-core.ts.
 */
function teamCountUpperBound(
  maleCount: number,
  femaleCount: number,
  threeWomanBundleCount: number,
  sixPersonTeamSlotCount: number,
): number {
  const normalEligibleFemaleCount = femaleCount - threeWomanBundleCount * 3
  const femaleTeamCapacity =
    Math.min(threeWomanBundleCount, sixPersonTeamSlotCount)
    + Math.floor(normalEligibleFemaleCount / 2)
  return Math.min(Math.floor(maleCount / 3), femaleTeamCapacity)
}

function maximumCapacityCompatibleTeamCount(
  parsed: ParsedTonightAllocatorPayload,
  allocation: TonightAllocationResult,
): number {
  const totalSlots = parsed.capacities.reduce(
    (sum, capacity) => sum + capacity.availableTeamCount,
    0,
  )
  const sixPersonSlots = parsed.capacities.reduce(
    (sum, capacity) => sum + (
      capacity.maxTeamHeadcount === 6 ? capacity.availableTeamCount : 0
    ),
    0,
  )
  const sixPersonTeams = allocation.teams.filter((team) => team.memberIds.length === 6).length
  const fivePersonTeams = allocation.teams.length - sixPersonTeams
  const placedSixPersonTeams = Math.min(sixPersonTeams, sixPersonSlots, totalSlots)
  return placedSixPersonTeams + Math.min(fivePersonTeams, totalSlots - placedSixPersonTeams)
}

function publishCertification(
  parsed: ParsedTonightAllocatorPayload,
  allocation: TonightAllocationResult,
) {
  const bundleSexes = new Map<string, Array<'male' | 'female'>>()
  let soloUnitCount = 0
  let maleCount = 0
  let femaleCount = 0
  for (const applicant of parsed.allocationInput.applicants) {
    if (applicant.friendBundleId === null) soloUnitCount += 1
    else {
      const sexes = bundleSexes.get(applicant.friendBundleId) ?? []
      sexes.push(applicant.sex)
      bundleSexes.set(applicant.friendBundleId, sexes)
    }
    if (applicant.sex === 'male') maleCount += 1
    else femaleCount += 1
  }

  const atomicUnitCount = soloUnitCount + bundleSexes.size
  const allSolo = atomicUnitCount === parsed.allocationInput.applicants.length
  const threeWomanBundleCount = [...bundleSexes.values()].filter(
    (sexes) => sexes.length === 3 && sexes.every((sex) => sex === 'female'),
  ).length
  const availableVenueTeamSlots = parsed.capacities.reduce(
    (sum, capacity) => sum + capacity.availableTeamCount,
    0,
  )
  const availableSixPersonTeamSlots = parsed.capacities.reduce(
    (sum, capacity) => sum + (
      capacity.maxTeamHeadcount === 6 ? capacity.availableTeamCount : 0
    ),
    0,
  )
  const lowerBoundTeamCount = maximumCapacityCompatibleTeamCount(parsed, allocation)
  const upperBoundTeamCount = Math.min(
    teamCountUpperBound(
      maleCount,
      femaleCount,
      threeWomanBundleCount,
      availableSixPersonTeamSlots,
    ),
    availableVenueTeamSlots,
  )
  const everyAllocatedTeamFitsCapacity = lowerBoundTeamCount === allocation.teams.length
  return {
    proven:
      ((atomicUnitCount <= EXACT_REPAIR_ATOMIC_UNIT_BOUNDARY || allSolo)
        && everyAllocatedTeamFitsCapacity)
      || lowerBoundTeamCount === upperBoundTeamCount,
    lowerBoundTeamCount,
    upperBoundTeamCount,
  }
}

export function parseTonightAllocatorRpcPayload(value: unknown): ParsedTonightAllocatorPayload {
  const root = record(value, ['round', 'activities', 'capacities', 'applications'])
  const round = record(root.round, [
    'id',
    'revision',
    'market_code',
    'service_date',
    'capacity_lock_at',
    'allocation_publish_at',
    'deposit_due_at',
  ])
  const roundId = uuid(round.id)
  const revision = integer(round.revision, 0, 2_147_483_647)
  if (round.market_code !== 'PNU') fail()
  const serviceDate = string(round.service_date, /^\d{4}-\d{2}-\d{2}$/)
  for (const field of ['capacity_lock_at', 'allocation_publish_at', 'deposit_due_at'] as const) {
    if (!Number.isFinite(Date.parse(string(round[field])))) fail()
  }

  if (!Array.isArray(root.activities) || root.activities.length !== 3) fail()
  const activities = root.activities.map((raw, index) => {
    const item = record(raw, ['id', 'slot', 'kind', 'duration_minutes'])
    if (integer(item.slot, 1, 3) !== index + 1) fail()
    string(item.kind, /^[a-z_]{2,32}$/)
    integer(item.duration_minutes, 30, 240)
    return uuid(item.id)
  }) as unknown as TonightActivityTuple
  if (new Set(activities).size !== 3) fail()

  if (!Array.isArray(root.capacities) || root.capacities.length > MAX_ALLOCATOR_CAPACITIES) fail()
  const capacities = root.capacities.map((raw) => {
    const item = record(raw, [
      'id',
      'activity_id',
      'team_capacity',
      'reserved_team_count',
      'max_team_headcount',
      'revision',
    ])
    const activityId = uuid(item.activity_id)
    if (!activities.includes(activityId)) fail()
    const teamCapacity = integer(item.team_capacity, 0, 100)
    const reservedTeamCount = integer(item.reserved_team_count, 0, 100)
    const maxTeamHeadcount = integer(item.max_team_headcount, 5, 6) as 5 | 6
    integer(item.revision, 0, 2_147_483_647)
    if (reservedTeamCount > teamCapacity) fail()
    return {
      id: uuid(item.id),
      activityId,
      availableTeamCount: teamCapacity - reservedTeamCount,
      maxTeamHeadcount,
    }
  })
  if (new Set(capacities.map((capacity) => capacity.id)).size !== capacities.length) fail()
  if (
    capacities.reduce((sum, capacity) => sum + capacity.availableTeamCount, 0)
    > MAX_ALLOCATOR_AVAILABLE_TEAM_SLOTS
  ) fail()

  if (!Array.isArray(root.applications) || root.applications.length > MAX_ALLOCATOR_APPLICATIONS) fail()
  const applicants = root.applications.map((raw) => {
    const item = record(raw, [
      'application_id',
      'bundle_id',
      'bundle_size',
      'school_scope_key',
      'department_key',
      'age_years',
      'gender_code',
      'appearance_score',
      'bundle_member_ready',
      'choices',
    ])
    const applicantId = uuid(item.application_id)
    const friendBundleId = uuid(item.bundle_id)
    const bundleSize = integer(item.bundle_size, 1, 3)
    const schoolScopeKey = canonicalSchoolScopeKey(item.school_scope_key)
    const departmentKey = canonicalDepartmentKey(item.department_key)
    if (!schoolScopeKey || schoolScopeKey !== item.school_scope_key) fail()
    if (!departmentKey || departmentKey !== item.department_key) fail()
    const age = integer(item.age_years, 18, 100)
    if (item.gender_code !== 'male' && item.gender_code !== 'female') fail()
    if (item.bundle_member_ready !== true) fail()
    const sex: 'male' | 'female' = item.gender_code
    if (
      typeof item.appearance_score !== 'number'
      || !Number.isFinite(item.appearance_score)
      || item.appearance_score < 0
      || item.appearance_score > 100
    ) fail()
    if (!Array.isArray(item.choices) || item.choices.length !== 3) fail()
    const activityRanking = item.choices.map((choice, index) => {
      const choiceRow = record(choice, ['activity_id', 'rank'])
      if (integer(choiceRow.rank, 1, 3) !== index + 1) fail()
      return uuid(choiceRow.activity_id)
    }) as unknown as TonightActivityTuple
    if (new Set(activityRanking).size !== 3 || activityRanking.some((id) => !activities.includes(id))) fail()
    return {
      applicantId,
      sex,
      age,
      appearanceScoreBp: Math.round(item.appearance_score * 100),
      activityRanking,
      friendBundleId,
      roundNamespace: roundId,
      schoolScopeKey,
      departmentKey,
      acceptedCompanionApplicationId: bundleSize > 1 ? friendBundleId : null,
    }
  })
  if (new Set(applicants.map((applicant) => applicant.applicantId)).size !== applicants.length) fail()
  const actualBundleCounts = new Map<string, number>()
  for (const applicant of applicants) {
    actualBundleCounts.set(
      applicant.friendBundleId,
      (actualBundleCounts.get(applicant.friendBundleId) ?? 0) + 1,
    )
  }
  root.applications.forEach((raw) => {
    const item = raw as Record<string, unknown>
    if (actualBundleCounts.get(uuid(item.bundle_id)) !== item.bundle_size) fail()
  })

  return {
    round: { id: roundId, revision, marketCode: 'PNU', serviceDate },
    capacities,
    allocationInput: { activities, applicants },
  }
}

export function buildTonightPublishAssignments(
  parsed: ParsedTonightAllocatorPayload,
  allocation: TonightAllocationResult,
): PublishAssignmentsResult {
  const allocatorFailed = (): PublishAssignmentsResult => ({
    status: 'allocator_failed',
    assignments: [],
    publicSummary: {
      team_count: 0,
      waitlisted_application_count: parsed.allocationInput.applicants.length,
    },
  })
  const initialWaitlistCount = allocation.waitlistedUnits.reduce(
    (sum, unit) => sum + unit.memberIds.length,
    0,
  )
  if (allocation.status !== 'allocated') {
    return allocatorFailed()
  }

  const applicantsById = new Map(
    parsed.allocationInput.applicants.map((applicant) => [applicant.applicantId, applicant]),
  )
  const placedMemberIds = new Set<string>()
  for (const team of allocation.teams) {
    if (
      (team.memberIds.length !== 5 && team.memberIds.length !== 6)
      || new Set(team.memberIds).size !== team.memberIds.length
    ) {
      return allocatorFailed()
    }
    const members = team.memberIds.map((memberId) => applicantsById.get(memberId))
    if (members.some((member) => member === undefined)) return allocatorFailed()
    if (team.memberIds.some((memberId) => placedMemberIds.has(memberId))) {
      return allocatorFailed()
    }
    const validatedMembers = members.filter((member) => member !== undefined)
    if (!scoreTonightTeamObjective(validatedMembers)) return allocatorFailed()
    const sexCounts = countTonightSexes(validatedMembers)
    if (
      team.sexCounts.male !== sexCounts.male
      || team.sexCounts.female !== sexCounts.female
    ) {
      return allocatorFailed()
    }
    for (const memberId of team.memberIds) placedMemberIds.add(memberId)
  }
  for (const unit of allocation.waitlistedUnits) {
    for (const memberId of unit.memberIds) {
      if (!applicantsById.has(memberId) || placedMemberIds.has(memberId)) {
        return allocatorFailed()
      }
      placedMemberIds.add(memberId)
    }
  }
  if (placedMemberIds.size !== parsed.allocationInput.applicants.length) return allocatorFailed()

  const certification = publishCertification(parsed, allocation)
  if (!certification.proven) {
    return {
      status: 'allocation_unproven',
      assignments: [],
      certification: {
        lower_bound_team_count: certification.lowerBoundTeamCount,
        upper_bound_team_count: certification.upperBoundTeamCount,
      },
      publicSummary: {
        team_count: 0,
        waitlisted_application_count: parsed.allocationInput.applicants.length,
      },
    }
  }

  const capacitySlots = new Map<
    string,
    Array<{ capacityId: string; maxTeamHeadcount: 5 | 6 }>
  >()
  for (const capacity of [...parsed.capacities].sort((a, b) => a.id.localeCompare(b.id))) {
    const slots = capacitySlots.get(capacity.activityId) ?? []
    for (let index = 0; index < capacity.availableTeamCount; index += 1) {
      slots.push({
        capacityId: capacity.id,
        maxTeamHeadcount: capacity.maxTeamHeadcount,
      })
    }
    slots.sort(
      (left, right) =>
        left.maxTeamHeadcount - right.maxTeamHeadcount
        || left.capacityId.localeCompare(right.capacityId),
    )
    capacitySlots.set(capacity.activityId, slots)
  }

  const assignments: TonightPublishAssignment[] = []
  let capacityWaitlistCount = 0
  const teams = [...allocation.teams].sort((left, right) =>
    right.memberIds.length - left.memberIds.length
    || left.memberIds.join(':').localeCompare(right.memberIds.join(':')),
  )
  for (const team of teams) {
    const rankedActivityIds = rankTeamActivities(team.activity, parsed.allocationInput.activities)
    if (!rankedActivityIds) return allocatorFailed()
    let assignedActivityId: string | undefined
    let venueCapacityId: string | undefined
    for (const activityId of rankedActivityIds) {
      const slots = capacitySlots.get(activityId)
      const compatibleIndex = slots?.findIndex(
        (slot) => slot.maxTeamHeadcount >= team.memberIds.length,
      ) ?? -1
      if (!slots || compatibleIndex < 0) continue
      const [nextCapacity] = slots.splice(compatibleIndex, 1)
      assignedActivityId = activityId
      venueCapacityId = nextCapacity.capacityId
      break
    }
    if (!assignedActivityId || !venueCapacityId) {
      capacityWaitlistCount += team.memberIds.length
      continue
    }
    assignments.push({
      activity_id: assignedActivityId,
      venue_capacity_id: venueCapacityId,
      application_ids: [...team.memberIds].sort(),
    })
  }

  const waitlistedApplicationCount = initialWaitlistCount + capacityWaitlistCount
  if (assignments.length === 0) {
    return {
      status: 'no_publishable_teams',
      assignments: [],
      publicSummary: { team_count: 0, waitlisted_application_count: waitlistedApplicationCount },
    }
  }
  return {
    status: 'ready',
    assignments,
    publicSummary: {
      team_count: assignments.length,
      waitlisted_application_count: waitlistedApplicationCount,
    },
  }
}
