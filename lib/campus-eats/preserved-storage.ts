import { getNextPair } from './bracket'
import type { BracketSession } from './types'

type LocalRecordStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Read only an explicit Campus Eats allowlist; never enumerate auth or other app storage. */
export function buildPreservedRecordExport(storage: Pick<LocalRecordStorage, 'getItem'>, schoolId: string, categoryId: string, createdAt: string) {
  if (![schoolId, categoryId].every(value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    || !Number.isFinite(Date.parse(createdAt))) throw new Error('invalid_backup_scope')
  const keys = [
    `quantum-campus-eats-${schoolId}-${categoryId}-v4`,
    `quantum-campus-eats-personal-rating-${schoolId}-${categoryId}-v1`,
  ]
  const records: { key: string; raw: string }[] = []
  const missingKeys: string[] = []
  for (const key of keys) {
    const raw = storage.getItem(key)
    if (raw === null) missingKeys.push(key)
    else records.push({ key, raw })
  }
  return { format: 'quantum-campus-eats-raw-backup-v1' as const, schoolId, categoryId, createdAt, records, missingKeys }
}

export interface PreservedRecord<T> {
  value: T | null
  status: 'ready' | 'protected' | 'unavailable'
  write(value: T): 'saved' | 'protected' | 'unavailable'
  protect(): void
}

/** Never repair an unknown format by deleting it or replacing it with defaults. */
export function readPreservedRecord<T>(storage: LocalRecordStorage, key: string, restore: (value: unknown) => T | null): PreservedRecord<T> {
  let expected: string | null = null
  let status: PreservedRecord<T>['status'] = 'ready'
  let value: T | null = null
  try { expected = storage.getItem(key) } catch { status = 'unavailable' }
  if (status === 'ready' && expected !== null) {
    try {
      value = restore(JSON.parse(expected))
      if (value === null) status = 'protected'
    } catch { status = 'protected' }
  }
  return {
    value,
    get status() { return status },
    protect() { if (status !== 'unavailable') status = 'protected' },
    write(next) {
      if (status !== 'ready') return status
      try {
        // A second tab may have newer choices. Do not silently overwrite them.
        if (storage.getItem(key) !== expected) { status = 'protected'; return status }
        const serialized = JSON.stringify(next)
        storage.setItem(key, serialized)
        expected = serialized
        return 'saved'
      } catch { status = 'unavailable'; return status }
    },
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) {
  return required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key))
}
function count(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 }
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id => typeof id === 'string') && new Set(value).size === value.length
}
function selectedIds(value: unknown, ids: readonly string[]): value is string[] {
  return strings(value) && value.every(id => ids.includes(id))
}

export function isSupportedPersonalRatingRecord(value: unknown, ids: readonly string[]): boolean {
  if (!object(value) || (value.version !== 1 && value.version !== 2)) return false
  const keys = ['version', 'ratings', 'validComparisonCount', 'appliedEventIds']
  if (value.version === 2) keys.push('visitedCandidateIds')
  return exactKeys(value, keys) && object(value.ratings)
    && exactKeys(value.ratings, ids)
    // Restoring rounds ratings: protect non-integer/foreign formats instead of changing them.
    && Object.values(value.ratings).every(Number.isSafeInteger)
    && count(value.validComparisonCount) && strings(value.appliedEventIds)
    && (value.version === 1 || selectedIds(value.visitedCandidateIds, ids))
}

/** Validate everything consumed by bracket rendering before any React state is queued. */
export function isSupportedPilotRecord(value: unknown, ids: readonly string[]): boolean {
  if (!object(value) || !exactKeys(value, ['version', 'session', 'view', 'selectedCandidateId',
    'selectedVisitedCandidateIds', 'tournamentStarted', 'tournamentId', 'eventSequence'])) return false
  if (value.version !== 4 || !['map', 'setup', 'battle', 'result'].includes(String(value.view))
    || !(value.selectedCandidateId === null || (typeof value.selectedCandidateId === 'string' && ids.includes(value.selectedCandidateId)))
    || !selectedIds(value.selectedVisitedCandidateIds, ids) || typeof value.tournamentStarted !== 'boolean'
    || typeof value.tournamentId !== 'string' || !value.tournamentId || !count(value.eventSequence)) return false
  const session = value.session
  if (!object(session) || !exactKeys(session, ['candidateIds', 'status', 'generation', 'generationAttempts',
    'generationAttemptBudget', 'attemptedPairKeysInGeneration', 'pairAttempts', 'roundCandidateIds',
    'roundWinners', 'acceptedComparisonCount', 'eventOutcomes', 'eventFingerprints'], ['winnerId'])) return false
  if (!selectedIds(session.candidateIds, ids) || session.candidateIds.length < 2 || session.candidateIds.length > 32
    || !['active', 'paused_needs_visits', 'completed', 'completed_without_winner'].includes(String(session.status))
    || ![session.generation, session.generationAttempts, session.generationAttemptBudget, session.acceptedComparisonCount].every(count)
    || !strings(session.roundCandidateIds) || session.roundCandidateIds.length < 2
    || session.roundCandidateIds.length > 32 || !Number.isInteger(Math.log2(session.roundCandidateIds.length))
    || !object(session.roundWinners) || !object(session.pairAttempts)
    || !object(session.eventOutcomes) || !object(session.eventFingerprints)
    || !strings(session.attemptedPairKeysInGeneration)) return false
  const candidates = session.candidateIds
  const rounds = session.roundCandidateIds
  if (!rounds.every(id => candidates.includes(id) || /^__campus_eats_bye__:\d+$/.test(id))) return false
  for (let index = 0; index < rounds.length; index += 2) {
    const winner = session.roundWinners[String(index)]
    const hasBye = !candidates.includes(rounds[index]) || !candidates.includes(rounds[index + 1])
    if (hasBye && winner === undefined) return false
  }
  if (!Object.entries(session.roundWinners).every(([slot, winner]) => /^(0|[1-9]\d*)$/.test(slot)
    && Number(slot) % 2 === 0 && Number(slot) < rounds.length && typeof winner === 'string'
    && candidates.includes(winner) && [rounds[Number(slot)], rounds[Number(slot) + 1]].includes(winner))) return false
  const validPairKey = (key: string) => {
    try {
      const pair: unknown = JSON.parse(key)
      return selectedIds(pair, candidates) && pair.length === 2 && JSON.stringify([...pair].sort()) === key
    } catch { return false }
  }
  if (!session.attemptedPairKeysInGeneration.every(validPairKey)
    || !Object.entries(session.pairAttempts).every(([key, attempts]) => validPairKey(key) && count(attempts) && attempts <= 2)
    || !exactKeys(session.eventFingerprints, Object.keys(session.eventOutcomes))
    || !Object.values(session.eventFingerprints).every(value => typeof value === 'string')) return false
  for (const outcome of Object.values(session.eventOutcomes)) {
    if (!object(outcome) || !exactKeys(outcome, ['kind', 'personalAdvance', 'ratingEligible'], ['winnerId', 'loserId'])) return false
    if (outcome.kind === 'deferred') {
      if (outcome.personalAdvance !== false || outcome.ratingEligible !== false || outcome.winnerId !== undefined || outcome.loserId !== undefined) return false
    } else if (outcome.kind === 'advanced') {
      if (outcome.personalAdvance !== true || outcome.ratingEligible !== true
        || typeof outcome.winnerId !== 'string' || typeof outcome.loserId !== 'string'
        || !candidates.includes(outcome.winnerId) || !candidates.includes(outcome.loserId) || outcome.winnerId === outcome.loserId) return false
    } else return false
  }
  if (session.status === 'completed') return typeof session.winnerId === 'string'
    && candidates.includes(session.winnerId) && rounds.length === 2
    && session.roundWinners['0'] === session.winnerId && session.acceptedComparisonCount === candidates.length - 1
  if (session.winnerId !== undefined) return false
  // Active means a selectable pair exists, never an empty battle after a corrupt restore.
  return session.status !== 'active' || getNextPair(session as unknown as BracketSession) !== undefined
}
