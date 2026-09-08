export type ContinuationActivityKind = 'board_game' | 'walk' | 'meal' | 'bowling' | 'other'
export type ContinuationSeriesStatus = 'active' | 'completed' | 'cancelled' | 'review_required'
export type ContinuationTransitionState =
  | 'awaiting_choices'
  | 'payment_pending'
  | 'ready_to_schedule'
  | 'scheduled'
  | 'closed'
  | 'review_required'
export type ContinuationNextAction =
  | 'open_transition'
  | 'choose'
  | 'wait_private_choices'
  | 'pay_fee'
  | 'wait_private_payments'
  | 'wait_schedule'
  | 'open_occurrence'
  | 'completed'

export interface ContinuationFee {
  orderId: string
  purpose: 'next_occurrence' | 'friend_request'
  provider: 'local_verified_simulator' | 'toss_sandbox' | 'toss'
  amountKrw: 1000
  currency: 'KRW'
  status: 'prepared' | 'verifying' | 'verified' | 'cancelled' | 'recovery_required'
  revision: number
}

export interface ContinuationTransition {
  transitionId: string
  transitionIndex: number
  targetProgramDay: 1 | 2 | 3 | 4 | 5
  physicalMeetingNo: 2 | 3 | 4 | 5 | 6
  state: ContinuationTransitionState
  closesAt: string
  rosterRevision: number
  ownChoice: 'continue' | 'end' | null
  ownFee: ContinuationFee | null
}

export interface ContinuationOccurrence {
  occurrenceId: string
  programDay: 1 | 2 | 3 | 4 | 5
  physicalMeetingNo: 2 | 3 | 4 | 5 | 6
  status: 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'review_required'
  startsAt: string
  endsAt: string
  location: Record<string, unknown>
  contentRevision: number
  chatPhase: 'locked' | 'send' | 'read_only' | 'hidden'
  members: Array<{ alias: string; attendanceStatus: string }>
}

export interface ContinuationSeries {
  serverNow: string
  seriesId: string
  sourceId: string
  source: {
    sourceKind: 'tonight_team' | 'scheduled_event_occurrence'
    activityKind: ContinuationActivityKind
    activity: Record<string, unknown>
    sourceCompletedAt: string
    rosterRevision: number
  }
  startProgramDay: 1 | 2
  maximumPhysicalMeetingNo: 5 | 6
  status: ContinuationSeriesStatus
  revision: number
  nextAction: ContinuationNextAction
  latestOccurrenceId: string | null
  transitions: ContinuationTransition[]
  occurrences: ContinuationOccurrence[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FORBIDDEN_PROJECTION_KEYS = /(?:decline|end)_count|member_choices|other_choices|phone|contact/i

export function parseContinuationSeries(value: unknown): ContinuationSeries | null {
  if (!isRecord(value) || Object.keys(value).some((key) => FORBIDDEN_PROJECTION_KEYS.test(key))) return null
  const source = value.source
  if (!isRecord(source)) return null
  const sourceKind = oneOf(source.source_kind, ['tonight_team', 'scheduled_event_occurrence'] as const)
  const activityKind = oneOf(source.activity_kind, ['board_game', 'walk', 'meal', 'bowling', 'other'] as const)
  const status = oneOf(value.status, ['active', 'completed', 'cancelled', 'review_required'] as const)
  const nextAction = oneOf(value.next_action, [
    'open_transition', 'choose', 'wait_private_choices', 'pay_fee',
    'wait_private_payments', 'wait_schedule', 'open_occurrence', 'completed',
  ] as const)
  const startProgramDay = integerOneOf(value.start_program_day, [1, 2] as const)
  const maximumPhysicalMeetingNo = integerOneOf(value.maximum_physical_meeting_no, [5, 6] as const)
  if (!uuid(value.series_id) || !uuid(value.source_id) || !iso(value.server_now)
    || !sourceKind || !activityKind || !status || !nextAction
    || !startProgramDay || !maximumPhysicalMeetingNo || !isRecord(source.activity)
    || !iso(source.source_completed_at) || !nonNegativeInteger(source.roster_revision)
    || !nonNegativeInteger(value.revision) || !Array.isArray(value.transitions)
    || !Array.isArray(value.occurrences)
    || !(value.latest_occurrence_id === null || uuid(value.latest_occurrence_id))) return null

  const transitions = value.transitions.map(parseTransition)
  const occurrences = value.occurrences.map(parseOccurrence)
  if (transitions.some((item) => item === null) || occurrences.some((item) => item === null)) return null
  return {
    serverNow: value.server_now,
    seriesId: value.series_id,
    sourceId: value.source_id,
    source: {
      sourceKind,
      activityKind,
      activity: source.activity,
      sourceCompletedAt: source.source_completed_at,
      rosterRevision: source.roster_revision,
    },
    startProgramDay,
    maximumPhysicalMeetingNo,
    status,
    revision: value.revision,
    nextAction,
    latestOccurrenceId: value.latest_occurrence_id,
    transitions: transitions as ContinuationTransition[],
    occurrences: occurrences as ContinuationOccurrence[],
  }
}

function parseTransition(value: unknown): ContinuationTransition | null {
  if (!isRecord(value) || Object.keys(value).some((key) => FORBIDDEN_PROJECTION_KEYS.test(key))) return null
  const targetProgramDay = integerOneOf(value.target_program_day, [1, 2, 3, 4, 5] as const)
  const physicalMeetingNo = integerOneOf(value.physical_meeting_no, [2, 3, 4, 5, 6] as const)
  const state = oneOf(value.state, [
    'awaiting_choices', 'payment_pending', 'ready_to_schedule',
    'scheduled', 'closed', 'review_required',
  ] as const)
  const ownChoice = value.own_choice === null
    ? null
    : oneOf(value.own_choice, ['continue', 'end'] as const)
  const ownFee = value.own_fee === null ? null : parseFee(value.own_fee)
  if (!uuid(value.transition_id) || !nonNegativeInteger(value.transition_index)
    || !targetProgramDay || !physicalMeetingNo || !state || !iso(value.closes_at)
    || !nonNegativeInteger(value.roster_revision)
    || (value.own_choice !== null && ownChoice === null)
    || ownFee === undefined) return null
  return {
    transitionId: value.transition_id,
    transitionIndex: value.transition_index,
    targetProgramDay,
    physicalMeetingNo,
    state,
    closesAt: value.closes_at,
    rosterRevision: value.roster_revision,
    ownChoice,
    ownFee,
  }
}

function parseFee(value: unknown): ContinuationFee | null | undefined {
  if (!isRecord(value) || !uuid(value.order_id) || value.amount_krw !== 1000 || value.currency !== 'KRW'
    || !nonNegativeInteger(value.revision)) return undefined
  const purpose = oneOf(value.purpose, ['next_occurrence', 'friend_request'] as const)
  const provider = oneOf(value.provider, ['local_verified_simulator', 'toss_sandbox', 'toss'] as const)
  const status = oneOf(value.status, ['prepared', 'verifying', 'verified', 'cancelled', 'recovery_required'] as const)
  if (!purpose || !provider || !status) return undefined
  return { orderId: value.order_id, purpose, provider, amountKrw: 1000, currency: 'KRW', status, revision: value.revision }
}

function parseOccurrence(value: unknown): ContinuationOccurrence | null {
  if (!isRecord(value) || !uuid(value.occurrence_id) || !isRecord(value.location)
    || !iso(value.starts_at) || !iso(value.ends_at) || !nonNegativeInteger(value.content_revision)
    || !Array.isArray(value.members)) return null
  const programDay = integerOneOf(value.program_day, [1, 2, 3, 4, 5] as const)
  const physicalMeetingNo = integerOneOf(value.physical_meeting_no, [2, 3, 4, 5, 6] as const)
  const status = oneOf(value.status, ['confirmed', 'in_progress', 'completed', 'cancelled', 'review_required'] as const)
  const chatPhase = oneOf(value.chat_phase, ['locked', 'send', 'read_only', 'hidden'] as const)
  const members = value.members.map((member) => isRecord(member)
    && typeof member.alias === 'string' && typeof member.attendance_status === 'string'
    ? { alias: member.alias, attendanceStatus: member.attendance_status }
    : null)
  if (!programDay || !physicalMeetingNo || !status || !chatPhase || members.some((member) => member === null)) return null
  return {
    occurrenceId: value.occurrence_id, programDay, physicalMeetingNo, status,
    startsAt: value.starts_at, endsAt: value.ends_at, location: value.location,
    contentRevision: value.content_revision, chatPhase,
    members: members as Array<{ alias: string; attendanceStatus: string }>,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function iso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === 'string' && allowed.includes(value as T[number]) ? value as T[number] : null
}

function integerOneOf<const T extends readonly number[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === 'number' && Number.isInteger(value) && allowed.includes(value as T[number])
    ? value as T[number]
    : null
}
