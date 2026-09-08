import {
  canonicalDepartmentKey,
  canonicalSchoolScopeKey,
  hasDepartmentAssignmentConflict,
  type DepartmentAllocationIdentity,
} from './department-identity'

export type WeeklyAllocationMember = {
  participantUserId: string
  gender: 'male' | 'female'
  schoolScopeKey: string
  departmentKey: string
}

export type WeeklyAllocationApplication = {
  applicationId: string
  revision: number
  partySize: number
  acceptedMemberCount: number
  members: WeeklyAllocationMember[]
}

export type WeeklyAllocationInput = {
  window: {
    windowId: string
    revision: number
    schoolScopeKey: string
    capacity: number
  }
  applications: WeeklyAllocationApplication[]
  maxEvaluations?: number
}

export type WeeklyAllocationIssue =
  | 'invalid_window'
  | 'invalid_application'
  | 'duplicate_application'
  | 'invalid_party_size'
  | 'partial_party'
  | 'invalid_member'
  | 'duplicate_member'
  | 'invalid_department_identity'

export type WeeklyAllocationRoom = {
  windowId: string
  applicationIds: string[]
  applications: Array<{ applicationId: string; expectedRevision: number }>
  peopleCount: 5
  genderBreakdown: { malePeople: 3; femalePeople: 2 }
}

export type WeeklyAllocationResult = {
  status: 'ready' | 'no_assignments' | 'invalid_input' | 'budget_exhausted'
  rooms: WeeklyAllocationRoom[]
  unassignedApplicationIds: string[]
  issues: WeeklyAllocationIssue[]
  evaluations: number
}

type CandidateRoom = {
  applications: WeeklyAllocationApplication[]
  applicationIds: string[]
  signature: string
}

const DEFAULT_MAX_EVALUATIONS = 250_000
const MAX_INPUT_APPLICATIONS = 120
const MAX_CANDIDATE_ROOMS = 50_000

/**
 * Builds a deterministic review proposal for one closed weekly window.
 * It never returns a partial plan after its bounded search budget is exhausted.
 */
export function buildWeeklyAllocationPlan(input: WeeklyAllocationInput): WeeklyAllocationResult {
  const issues = validateInput(input)
  const sortedApplications = Array.isArray(input?.applications)
    ? [...input.applications].sort((left, right) => compare(left.applicationId, right.applicationId))
    : []
  if (issues.length > 0) {
    return result('invalid_input', [], sortedApplications, issues, 0)
  }

  const maxEvaluations = input.maxEvaluations ?? DEFAULT_MAX_EVALUATIONS
  let evaluations = 0
  let budgetExhausted = false
  const candidates: CandidateRoom[] = []

  const enumerate = (
    start: number,
    selected: WeeklyAllocationApplication[],
    people: number,
    malePeople: number,
    femalePeople: number,
  ): void => {
    evaluations += 1
    if (evaluations > maxEvaluations || candidates.length >= MAX_CANDIDATE_ROOMS) {
      budgetExhausted = true
      return
    }
    if (people === 5) {
      if (malePeople !== 3 || femalePeople !== 2) return
      const members = selected.flatMap((application) => application.members.map((member) => (
        departmentIdentity(input.window.windowId, application, member)
      )))
      if (hasDepartmentAssignmentConflict(members)) return
      const applicationIds = selected.map((application) => application.applicationId).sort(compare)
      candidates.push({
        applications: [...selected].sort((left, right) => compare(left.applicationId, right.applicationId)),
        applicationIds,
        signature: JSON.stringify(applicationIds),
      })
      return
    }
    if (people > 5 || malePeople > 3 || femalePeople > 2) return

    for (let index = start; index < sortedApplications.length && !budgetExhausted; index += 1) {
      const application = sortedApplications[index]
      const gender = application.members[0].gender
      enumerate(
        index + 1,
        [...selected, application],
        people + application.partySize,
        malePeople + (gender === 'male' ? application.partySize : 0),
        femalePeople + (gender === 'female' ? application.partySize : 0),
      )
    }
  }
  enumerate(0, [], 0, 0, 0)
  if (budgetExhausted) return result('budget_exhausted', [], sortedApplications, [], evaluations)

  candidates.sort((left, right) => compare(left.signature, right.signature))
  const maxRooms = Math.floor(input.window.capacity / 5)
  let best: CandidateRoom[] = []
  let bestSignature = '[]'

  const search = (start: number, selected: CandidateRoom[], used: Set<string>): void => {
    evaluations += 1
    if (evaluations > maxEvaluations) {
      budgetExhausted = true
      return
    }
    const signature = JSON.stringify(selected.map((room) => room.signature).sort(compare))
    if (selected.length > best.length || (selected.length === best.length && compare(signature, bestSignature) < 0)) {
      best = [...selected]
      bestSignature = signature
    }
    if (selected.length >= maxRooms) return
    for (let index = start; index < candidates.length && !budgetExhausted; index += 1) {
      const candidate = candidates[index]
      if (candidate.applicationIds.some((applicationId) => used.has(applicationId))) continue
      const nextUsed = new Set(used)
      candidate.applicationIds.forEach((applicationId) => nextUsed.add(applicationId))
      search(index + 1, [...selected, candidate], nextUsed)
    }
  }
  search(0, [], new Set())
  if (budgetExhausted) return result('budget_exhausted', [], sortedApplications, [], evaluations)

  const rooms = best
    .sort((left, right) => compare(left.signature, right.signature))
    .map((candidate): WeeklyAllocationRoom => ({
      windowId: input.window.windowId,
      applicationIds: candidate.applicationIds,
      applications: candidate.applications.map((application) => ({
        applicationId: application.applicationId,
        expectedRevision: application.revision,
      })),
      peopleCount: 5,
      genderBreakdown: { malePeople: 3, femalePeople: 2 },
    }))
  return result(rooms.length > 0 ? 'ready' : 'no_assignments', rooms, sortedApplications, [], evaluations)
}

function validateInput(input: WeeklyAllocationInput): WeeklyAllocationIssue[] {
  const issues = new Set<WeeklyAllocationIssue>()
  const window = input?.window
  const canonicalScope = canonicalSchoolScopeKey(window?.schoolScopeKey)
  if (!window
    || !boundedId(window.windowId)
    || !Number.isInteger(window.revision) || window.revision < 0
    || canonicalScope === null || canonicalScope !== window.schoolScopeKey
    || !Number.isInteger(window.capacity) || window.capacity < 5 || window.capacity > 60
    || (input.maxEvaluations !== undefined
      && (!Number.isInteger(input.maxEvaluations) || input.maxEvaluations < 1 || input.maxEvaluations > 5_000_000))) {
    issues.add('invalid_window')
  }
  if (!Array.isArray(input?.applications) || input.applications.length > MAX_INPUT_APPLICATIONS) {
    issues.add('invalid_application')
    return [...issues]
  }

  const applicationIds = new Set<string>()
  const memberIds = new Set<string>()
  for (const application of input.applications) {
    if (!boundedId(application?.applicationId) || !Number.isInteger(application?.revision) || application.revision < 0) {
      issues.add('invalid_application')
    } else if (applicationIds.has(application.applicationId)) {
      issues.add('duplicate_application')
    } else applicationIds.add(application.applicationId)
    if (!Number.isInteger(application?.partySize) || application.partySize < 1 || application.partySize > 3
      || !Array.isArray(application?.members) || application.members.length !== application.partySize) {
      issues.add('invalid_party_size')
      continue
    }
    if (application.acceptedMemberCount !== application.partySize) issues.add('partial_party')
    const partyGender = application.members[0]?.gender
    for (const member of application.members) {
      if (!boundedId(member?.participantUserId)
        || (member.gender !== 'male' && member.gender !== 'female')
        || member.gender !== partyGender) {
        issues.add('invalid_member')
      } else if (memberIds.has(member.participantUserId)) {
        issues.add('duplicate_member')
      } else memberIds.add(member.participantUserId)
      if (canonicalSchoolScopeKey(member?.schoolScopeKey) !== member?.schoolScopeKey
        || member.schoolScopeKey !== canonicalScope
        || canonicalDepartmentKey(member?.departmentKey) !== member?.departmentKey) {
        issues.add('invalid_department_identity')
      }
    }
  }
  return [...issues]
}

function departmentIdentity(
  windowId: string,
  application: WeeklyAllocationApplication,
  member: WeeklyAllocationMember,
): DepartmentAllocationIdentity {
  return {
    applicantId: member.participantUserId,
    roundNamespace: `weekly:${windowId}`,
    schoolScopeKey: member.schoolScopeKey,
    departmentKey: member.departmentKey,
    acceptedCompanionApplicationId: application.partySize > 1 ? application.applicationId : null,
  }
}

function result(
  status: WeeklyAllocationResult['status'],
  rooms: WeeklyAllocationRoom[],
  applications: WeeklyAllocationApplication[],
  issues: WeeklyAllocationIssue[],
  evaluations: number,
): WeeklyAllocationResult {
  const assigned = new Set(rooms.flatMap((room) => room.applicationIds))
  return {
    status,
    rooms,
    unassignedApplicationIds: applications
      .map((application) => application.applicationId)
      .filter((applicationId) => !assigned.has(applicationId)),
    issues,
    evaluations,
  }
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 160
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
