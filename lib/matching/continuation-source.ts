export type ContinuationSourceKind = 'tonight_team' | 'scheduled_event_occurrence'
export type ContinuationActivityKind = 'board_game' | 'walk' | 'meal' | 'bowling' | 'other'

export interface ContinuationSourceInput {
  sourceKind: ContinuationSourceKind
  tonightTeamId: string | null
  scheduledEventOccurrenceId: string | null
  activityKind: ContinuationActivityKind
  activitySnapshot: Readonly<Record<string, unknown>>
  rosterUserIds: readonly string[]
  rosterRevision: number
  attendanceRevision: number
  completedAt: string
}

export type ContinuationSource = ContinuationSourceInput & {
  rosterUserIds: string[]
}

export function createContinuationSource(input: ContinuationSourceInput):
  | { ok: true; value: ContinuationSource }
  | { ok: false; error: 'invalid_source_reference' | 'invalid_roster' | 'invalid_revision' | 'invalid_completion' } {
  const hasTonight = isUuid(input.tonightTeamId)
  const hasScheduled = isUuid(input.scheduledEventOccurrenceId)
  if (hasTonight === hasScheduled
    || (input.sourceKind === 'tonight_team' && !hasTonight)
    || (input.sourceKind === 'scheduled_event_occurrence' && !hasScheduled)) {
    return { ok: false, error: 'invalid_source_reference' }
  }
  const rosterUserIds = [...new Set(input.rosterUserIds)]
  if (![5, 6].includes(rosterUserIds.length) || !rosterUserIds.every(isUuid)) return { ok: false, error: 'invalid_roster' }
  if (!isRevision(input.rosterRevision) || !isRevision(input.attendanceRevision)) return { ok: false, error: 'invalid_revision' }
  if (!isTimestamp(input.completedAt)) return { ok: false, error: 'invalid_completion' }
  return { ok: true, value: { ...input, rosterUserIds } }
}

export function getContinuationMeetingPlan(activityKind: ContinuationActivityKind) {
  if (activityKind === 'board_game') {
    return { sourceProgramDay: 1 as const, startProgramDay: 2 as const, maximumPhysicalMeetingNo: 5 as const }
  }
  return { sourceProgramDay: null, startProgramDay: 1 as const, maximumPhysicalMeetingNo: 6 as const }
}

export function getContinuationTarget(activityKind: ContinuationActivityKind, transitionIndex: number): {
  transitionIndex: number
  programDay: 1 | 2 | 3 | 4 | 5
  physicalMeetingNo: 2 | 3 | 4 | 5 | 6
  finalProgramDay: boolean
} | null {
  if (!Number.isInteger(transitionIndex) || transitionIndex < 0) return null
  const plan = getContinuationMeetingPlan(activityKind)
  const programDay = plan.startProgramDay + transitionIndex
  if (programDay > 5) return null
  const physicalMeetingNo = programDay - plan.startProgramDay + 2
  if (physicalMeetingNo > plan.maximumPhysicalMeetingNo) return null
  return {
    transitionIndex,
    programDay: programDay as 1 | 2 | 3 | 4 | 5,
    physicalMeetingNo: physicalMeetingNo as 2 | 3 | 4 | 5 | 6,
    finalProgramDay: programDay === 5,
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isRevision(value: number) {
  return Number.isInteger(value) && value >= 0
}

function isTimestamp(value: string) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

