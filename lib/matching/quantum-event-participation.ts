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
  updated_at: string
}

export type QuantumEventParticipationInputResult =
  | {
      ok: true
      value: {
        eventId: string
        eventMode: QuantumEventMode
        partyType: QuantumPartyType
      }
    }
  | { ok: false; error: 'invalid_body' | 'invalid_event' | 'invalid_party_type' }

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

  const eventMode = findEventMode(eventId)
  if (!eventMode) return { ok: false, error: 'invalid_event' }

  return {
    ok: true,
    value: {
      eventId,
      eventMode,
      partyType: record.party_type,
    },
  }
}

export function isQuantumEventParticipation(value: unknown): value is QuantumEventParticipation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.event_id === 'string'
    && getQuantumEventById(record.event_id) !== null
    && (record.event_mode === 'tonight' || record.event_mode === 'scheduled')
    && isQuantumPartyType(record.party_type)
    && typeof record.updated_at === 'string'
  )
}

function findEventMode(eventId: string): QuantumEventMode | null {
  for (const mode of Object.keys(quantumEventCatalog) as QuantumEventMode[]) {
    if (quantumEventCatalog[mode].some((event) => event.id === eventId)) return mode
  }
  return null
}
