import {
  getQuantumEventById,
  isQuantumPartyType,
  type QuantumEventMode,
  type QuantumPartyType,
} from './quantum-event-catalog'

export type QuantumEventStoredStatus =
  | 'recruiting'
  | 'confirmed'
  | 'cancelled'
  | 'completed'

export type QuantumEventLifecycleStage =
  | 'recruiting'
  | 'confirmed'
  | 'chat_open'
  | 'in_progress'
  | 'cancelled'
  | 'completed'

export type QuantumEventPartyMember = {
  user_id: string
  display_name: string
  avatar_url: string | null
}

export type QuantumEventParticipantCounts = {
  total: number
  male: number
  female: number
  required_total: number
}

export type QuantumEventLifecycle = {
  occurrence_id: string
  room_number: number
  room_label: string
  room_code: string
  event_id: string
  event_mode: QuantumEventMode
  party_type: QuantumPartyType
  group_id: string | null
  status: QuantumEventStoredStatus
  starts_at: string
  ends_at: string
  chat_opens_at: string
  server_now: string
  match_id: string | null
  location_name: string | null
  cancel_reason: string | null
  participant_counts: QuantumEventParticipantCounts
  party_members: QuantumEventPartyMember[]
  review_required: boolean
  updated_at: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STORED_STATUSES = new Set<QuantumEventStoredStatus>([
  'recruiting',
  'confirmed',
  'cancelled',
  'completed',
])

export function deriveQuantumEventLifecycleStage(
  lifecycle: QuantumEventLifecycle,
): QuantumEventLifecycleStage {
  if (lifecycle.status === 'cancelled') return 'cancelled'
  if (lifecycle.status === 'completed') return 'completed'

  const now = Date.parse(lifecycle.server_now)
  const startsAt = Date.parse(lifecycle.starts_at)
  const endsAt = Date.parse(lifecycle.ends_at)
  const chatOpensAt = Date.parse(lifecycle.chat_opens_at)

  if (!lifecycle.match_id || lifecycle.status === 'recruiting') return 'recruiting'
  if (now >= startsAt) return 'in_progress'
  if (now >= chatOpensAt) return 'chat_open'
  return 'confirmed'
}

export function isActiveQuantumEventLifecycle(
  lifecycle: QuantumEventLifecycle,
): boolean {
  const stage = deriveQuantumEventLifecycleStage(lifecycle)
  return stage !== 'cancelled' && stage !== 'completed'
}

export function isQuantumEventLifecycle(value: unknown): value is QuantumEventLifecycle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>

  if (
    typeof record.event_id !== 'string'
    || getQuantumEventById(record.event_id) === null
    || (record.event_mode !== 'tonight' && record.event_mode !== 'scheduled')
    || !isQuantumPartyType(record.party_type)
    || typeof record.status !== 'string'
    || !STORED_STATUSES.has(record.status as QuantumEventStoredStatus)
    || !isUuid(record.occurrence_id)
    || !isPositiveInteger(record.room_number)
    || typeof record.room_label !== 'string'
    || record.room_label.trim().length === 0
    || typeof record.room_code !== 'string'
    || !/^[0-9A-Z]{6}$/.test(record.room_code)
    || !isNullableUuid(record.group_id)
    || !isNullableUuid(record.match_id)
    || !isNullableString(record.location_name)
    || !isNullableString(record.cancel_reason)
    || !isTimestamp(record.starts_at)
    || !isTimestamp(record.ends_at)
    || !isTimestamp(record.chat_opens_at)
    || !isTimestamp(record.server_now)
    || !isTimestamp(record.updated_at)
    || typeof record.review_required !== 'boolean'
  ) return false

  if (record.party_type === 'friends' && !isUuid(record.group_id)) return false
  if (record.party_type === 'solo' && record.group_id !== null) return false

  return isParticipantCounts(record.participant_counts)
    && Array.isArray(record.party_members)
    && record.party_members.every(isPartyMember)
}

function isParticipantCounts(value: unknown): value is QuantumEventParticipantCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return isCount(record.total)
    && isCount(record.male)
    && isCount(record.female)
    && isCount(record.required_total)
    && record.male + record.female <= record.total
    && record.required_total > 0
}

function isPartyMember(value: unknown): value is QuantumEventPartyMember {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return isUuid(record.user_id)
    && typeof record.display_name === 'string'
    && record.display_name.trim().length > 0
    && isNullableString(record.avatar_url)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}
