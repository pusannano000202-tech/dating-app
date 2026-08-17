import {
  getQuantumEventById,
  isQuantumPartyType,
  quantumEventCatalog,
  type QuantumEventMode,
  type QuantumPartyType,
} from './quantum-event-catalog'

export interface QuantumEventParticipation {
  event_id: string
  event_mode: QuantumEventMode
  party_type: QuantumPartyType
  group_id: string | null
  updated_at: string
}

export type QuantumEventParticipationInputResult =
  | {
      ok: true
      value: {
        eventId: string
        eventMode: QuantumEventMode
        partyType: QuantumPartyType
        groupId: string | null
      }
    }
  | { ok: false; error: 'invalid_body' | 'invalid_event' | 'invalid_party_type' | 'invalid_group_id' | 'friend_group_required' }

export function parseQuantumEventParticipationInput(
  input: unknown,
): QuantumEventParticipationInputResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'invalid_body' }
  }

  const record = input as Record<string, unknown>
  const eventId = typeof record.event_id === 'string' ? record.event_id : ''
  const event = getQuantumEventById(eventId)

  if (!event) return { ok: false, error: 'invalid_event' }
  if (!isQuantumPartyType(record.party_type)) {
    return { ok: false, error: 'invalid_party_type' }
  }
  const groupId = typeof record.group_id === 'string' && UUID_PATTERN.test(record.group_id)
    ? record.group_id
    : null
  if (record.party_type === 'friends' && !groupId) {
    return { ok: false, error: 'friend_group_required' }
  }
  if (record.party_type === 'solo' && record.group_id != null) {
    return { ok: false, error: 'invalid_group_id' }
  }

  const eventMode = findEventMode(eventId)
  if (!eventMode) return { ok: false, error: 'invalid_event' }

  return {
    ok: true,
    value: {
      eventId,
      eventMode,
      partyType: record.party_type,
      groupId,
    },
  }
}

export function isQuantumEventParticipation(value: unknown): value is QuantumEventParticipation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const groupIdIsValid = record.party_type === 'friends'
    ? typeof record.group_id === 'string' && UUID_PATTERN.test(record.group_id)
    : record.group_id == null
  return (
    typeof record.event_id === 'string'
    && getQuantumEventById(record.event_id) !== null
    && (record.event_mode === 'tonight' || record.event_mode === 'scheduled')
    && isQuantumPartyType(record.party_type)
    && groupIdIsValid
    && typeof record.updated_at === 'string'
  )
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function findEventMode(eventId: string): QuantumEventMode | null {
  for (const mode of Object.keys(quantumEventCatalog) as QuantumEventMode[]) {
    if (quantumEventCatalog[mode].some((event) => event.id === eventId)) return mode
  }
  return null
}
