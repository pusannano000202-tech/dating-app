export type WeeklyActivityWindowStatus = 'draft' | 'recruiting' | 'closed' | 'assigned' | 'cancelled'

export interface WeeklyActivityWindow {
  id: string
  activityId: string
  weekKey: string
  status: WeeklyActivityWindowStatus
  startsAt: string
  endsAt: string
  applicationClosesAt: string
  capacity: number
  applicantCount: number
  assignedCount: number
}

export interface ConfirmedSchedule {
  startsAt: string
  endsAt: string
}

export type WeeklyApplicationInput = {
  activityId: string
  weekKey: string
  candidateWindowIds: string[]
  partyGroupId: string | null
  idempotencyKey: string
}

export type WeeklyApplicationInputResult =
  | { ok: true; value: WeeklyApplicationInput }
  | { ok: false; error: 'invalid_body' | 'invalid_activity' | 'invalid_week' | 'invalid_windows' | 'invalid_party_group' | 'invalid_idempotency_key' }

export type WeeklyPartyConsentInput = {
  applicationId: string
  decision: 'accept' | 'withdraw'
  expectedRevision: number
  idempotencyKey: string
}

export type WeeklyPartyConsentInputResult =
  | { ok: true; value: WeeklyPartyConsentInput }
  | { ok: false; error: 'invalid_body' | 'invalid_application' | 'invalid_decision' | 'invalid_revision' | 'invalid_idempotency_key' }

export function mapWeeklyAvailabilityRpcError(error: unknown):
  | { status: 400; error: 'invalid_request' }
  | { status: 409; error: 'not_ready' }
  | { status: 409; error: 'assignment_retry'; retryable: true }
  | null {
  const message = error && typeof error === 'object' && 'message' in error
    && typeof error.message === 'string' ? error.message.toLowerCase() : ''
  if (/duplicate_candidate_window/.test(message)) return { status: 400, error: 'invalid_request' }
  if (/weekly_assignment_retry/.test(message)) {
    return { status: 409, error: 'assignment_retry', retryable: true }
  }
  if (/(?:assigned_application_cannot_cancel|weekly_application_not_open|friend_group_member_count|weekly_window_unavailable|party_(?:roster|snapshot)_changed|application_already_assigned|window_(?:capacity_full|not_assignable)|occurrence_gender_capacity_full)/.test(message)) {
    return { status: 409, error: 'not_ready' }
  }
  return null
}

export function parseWeeklyApplicationInput(value: unknown): WeeklyApplicationInputResult {
  if (!isRecord(value)) return { ok: false, error: 'invalid_body' }
  const activityId = readBoundedText(value.activity_id, 80)
  if (!activityId || !/^[a-z0-9][a-z0-9-]*$/.test(activityId)) return { ok: false, error: 'invalid_activity' }
  const weekKey = readBoundedText(value.week_key, 10)
  if (!weekKey || !isMondayDateKey(weekKey)) return { ok: false, error: 'invalid_week' }
  if (!Array.isArray(value.candidate_window_ids)) return { ok: false, error: 'invalid_windows' }
  const candidateWindowIds = [...new Set(value.candidate_window_ids)]
  if (candidateWindowIds.length < 1 || candidateWindowIds.length > 14 || !candidateWindowIds.every(isUuid)) {
    return { ok: false, error: 'invalid_windows' }
  }
  const partyGroupId = value.party_group_id === null ? null : value.party_group_id
  if (partyGroupId !== null && !isUuid(partyGroupId)) return { ok: false, error: 'invalid_party_group' }
  if (!isUuid(value.idempotency_key)) return { ok: false, error: 'invalid_idempotency_key' }
  return { ok: true, value: { activityId, weekKey, candidateWindowIds, partyGroupId, idempotencyKey: value.idempotency_key } }
}

export function parseWeeklyPartyConsentInput(value: unknown): WeeklyPartyConsentInputResult {
  if (!isRecord(value)) return { ok: false, error: 'invalid_body' }
  if (!isUuid(value.application_id)) return { ok: false, error: 'invalid_application' }
  if (value.decision !== 'accept' && value.decision !== 'withdraw') return { ok: false, error: 'invalid_decision' }
  if (!Number.isInteger(value.expected_revision) || (value.expected_revision as number) < 0
      || (value.expected_revision as number) > 2_147_483_647) {
    return { ok: false, error: 'invalid_revision' }
  }
  if (!isUuid(value.idempotency_key)) return { ok: false, error: 'invalid_idempotency_key' }
  return {
    ok: true,
    value: {
      applicationId: value.application_id,
      decision: value.decision,
      expectedRevision: value.expected_revision as number,
      idempotencyKey: value.idempotency_key,
    },
  }
}

export function validateWeeklyCandidateWindows(input: {
  activityId: string
  weekKey: string
  candidateWindowIds: readonly string[]
  windows: readonly WeeklyActivityWindow[]
  serverNow: string
  confirmedSchedules: readonly ConfirmedSchedule[]
}):
  | { ok: true; assignableWindowIds: string[]; conflictingWindowIds: string[] }
  | { ok: false; error: 'week_mismatch' | 'window_not_found' | 'activity_mismatch' | 'window_closed' | 'window_full' | 'all_windows_conflict' } {
  const byId = new Map(input.windows.map((window) => [window.id, window]))
  const selected = input.candidateWindowIds.map((id) => byId.get(id))
  if (selected.some((window) => !window)) return { ok: false, error: 'window_not_found' }
  const windows = selected as WeeklyActivityWindow[]
  if (windows.some((window) => window.weekKey !== input.weekKey)) return { ok: false, error: 'week_mismatch' }
  if (windows.some((window) => window.activityId !== input.activityId)) return { ok: false, error: 'activity_mismatch' }
  const now = Date.parse(input.serverNow)
  if (!Number.isFinite(now) || windows.some((window) => window.status !== 'recruiting' || Date.parse(window.applicationClosesAt) <= now)) {
    return { ok: false, error: 'window_closed' }
  }
  if (windows.some((window) => window.assignedCount >= window.capacity)) return { ok: false, error: 'window_full' }
  const conflictingWindowIds: string[] = []
  const assignableWindowIds: string[] = []
  for (const window of windows) {
    const conflicts = input.confirmedSchedules.some((schedule) => intervalsOverlap(window, schedule))
    ;(conflicts ? conflictingWindowIds : assignableWindowIds).push(window.id)
  }
  if (assignableWindowIds.length === 0) return { ok: false, error: 'all_windows_conflict' }
  return { ok: true, assignableWindowIds, conflictingWindowIds }
}

export function getSeoulWeekKey(timestamp: string): string {
  const instant = Date.parse(timestamp)
  if (!Number.isFinite(instant)) throw new Error('invalid_timestamp')
  const seoul = new Date(instant + 9 * 60 * 60 * 1000)
  const daysSinceMonday = (seoul.getUTCDay() + 6) % 7
  seoul.setUTCDate(seoul.getUTCDate() - daysSinceMonday)
  return `${seoul.getUTCFullYear()}-${two(seoul.getUTCMonth() + 1)}-${two(seoul.getUTCDate())}`
}

function intervalsOverlap(a: ConfirmedSchedule, b: ConfirmedSchedule) {
  return Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt)
}

function isMondayDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) && date.getUTCDay() === 1
}

function readBoundedText(value: unknown, max: number) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= max ? normalized : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function two(value: number) {
  return String(value).padStart(2, '0')
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
