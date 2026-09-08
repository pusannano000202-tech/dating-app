import {
  getQuantumEventById,
  quantumEventCatalog,
  type QuantumEventMode,
  type QuantumPartyType,
} from './quantum-event-catalog'

export type QuantumEventApplicantGender = 'male' | 'female' | null

export interface QuantumEventApplicantRow {
  event_id: string
  event_mode: QuantumEventMode
  party_type: QuantumPartyType
  status: 'recruiting' | 'confirmed' | 'cancelled' | 'completed'
  updated_at: string
  gender: QuantumEventApplicantGender
}

export interface QuantumEventApplicantStats {
  waiting_accounts: number
  male_applicants: number
  female_applicants: number
  unknown_applicants: number
  solo_applications: number
  friend_applications: number
}

export type QuantumEventApplicantStatsMap = Record<string, QuantumEventApplicantStats>

const TONIGHT_FRESHNESS_MS = 18 * 60 * 60 * 1000
const SCHEDULED_FRESHNESS_MS = 21 * 24 * 60 * 60 * 1000

export function aggregateQuantumEventApplicantStats(
  rows: readonly QuantumEventApplicantRow[],
  now = new Date(),
): QuantumEventApplicantStatsMap {
  const result: QuantumEventApplicantStatsMap = {}

  for (const row of rows) {
    if (row.status !== 'recruiting') continue
    const event = getQuantumEventById(row.event_id)
    const updatedAt = new Date(row.updated_at)
    if (
      !event
      || !quantumEventCatalog[row.event_mode].some((candidate) => candidate.id === row.event_id)
      || Number.isNaN(updatedAt.getTime())
    ) continue

    const freshness = row.event_mode === 'tonight'
      ? TONIGHT_FRESHNESS_MS
      : SCHEDULED_FRESHNESS_MS
    if (updatedAt.getTime() < now.getTime() - freshness) continue

    const current = result[row.event_id] ?? {
      waiting_accounts: 0,
      male_applicants: 0,
      female_applicants: 0,
      unknown_applicants: 0,
      solo_applications: 0,
      friend_applications: 0,
    }

    current.waiting_accounts += 1
    if (row.gender === 'male') current.male_applicants += 1
    else if (row.gender === 'female') current.female_applicants += 1
    else current.unknown_applicants += 1

    if (row.party_type === 'friends') current.friend_applications += 1
    else current.solo_applications += 1
    result[row.event_id] = current
  }

  return result
}

export function isQuantumEventApplicantStatsMap(value: unknown): value is QuantumEventApplicantStatsMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  return Object.values(value).every((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
    const stats = candidate as Record<string, unknown>
    return [
      'waiting_accounts',
      'male_applicants',
      'female_applicants',
      'unknown_applicants',
      'solo_applications',
      'friend_applications',
    ].every((key) => typeof stats[key] === 'number' && Number.isInteger(stats[key]) && Number(stats[key]) >= 0)
  })
}
