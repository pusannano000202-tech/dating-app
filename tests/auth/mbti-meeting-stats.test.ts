import assert from 'node:assert/strict'
import test from 'node:test'

import {
  aggregateMeetingStats,
  protectMeetingStatsAggregate,
  type MeetingStatsAggregate,
} from '../../lib/community/mbti/meeting-stats'

const now = new Date('2026-09-05T12:00:00.000Z')

test('meeting stats require authoritative attendance and active consent from both participants', () => {
  const result = aggregateMeetingStats({
    attendances: [
      { occurrenceId: 'occ-1', ownerUserId: 'owner-a', authoritative: true, attended: true },
      { occurrenceId: 'occ-1', ownerUserId: 'owner-b', authoritative: true, attended: true },
    ],
    consents: [
      { ownerUserId: 'owner-a', selfMbti: 'ENFP', selfGender: 'female', expiresAt: '2026-12-01T00:00:00.000Z', withdrawnAt: null },
    ],
    now,
  })
  assert.deepEqual(result.cells, [])
  assert.equal(result.eligibleOccurrenceCount, 0)
})

test('same occurrence and type-gender composition is counted once', () => {
  const result = aggregateMeetingStats({
    attendances: [
      { occurrenceId: 'occ-1', ownerUserId: 'owner-a', authoritative: true, attended: true },
      { occurrenceId: 'occ-1', ownerUserId: 'owner-b', authoritative: true, attended: true },
      { occurrenceId: 'occ-1', ownerUserId: 'owner-c', authoritative: true, attended: true },
    ],
    consents: [
      { ownerUserId: 'owner-a', selfMbti: 'ENFP', selfGender: 'female', expiresAt: '2026-12-01T00:00:00.000Z', withdrawnAt: null },
      { ownerUserId: 'owner-b', selfMbti: 'INFP', selfGender: 'male', expiresAt: '2026-12-01T00:00:00.000Z', withdrawnAt: null },
      { ownerUserId: 'owner-c', selfMbti: 'INFP', selfGender: 'male', expiresAt: '2026-12-01T00:00:00.000Z', withdrawnAt: null },
    ],
    now,
  })

  assert.equal(result.cells.length, 1)
  assert.equal(result.cells[0].occurrenceCount, 1)
  assert.equal(result.cells[0].uniqueConsentingParticipantCount, 3)
})

test('non-authoritative, absent, expired or withdrawn participation fails closed', () => {
  const result = aggregateMeetingStats({
    attendances: [
      { occurrenceId: 'occ-1', ownerUserId: 'owner-a', authoritative: false, attended: true },
      { occurrenceId: 'occ-1', ownerUserId: 'owner-b', authoritative: true, attended: false },
    ],
    consents: [
      { ownerUserId: 'owner-a', selfMbti: 'ENFP', selfGender: 'female', expiresAt: '2026-09-05T11:59:59.999Z', withdrawnAt: null },
      { ownerUserId: 'owner-b', selfMbti: 'INFP', selfGender: 'male', expiresAt: '2026-12-01T00:00:00.000Z', withdrawnAt: '2026-09-05T00:00:00.000Z' },
    ],
    now,
  })
  assert.deepEqual(result.cells, [])
  assert.equal(result.eligibleOccurrenceCount, 0)
})

function aggregateWithTwoSafeCells(generatedAt = now.toISOString()): MeetingStatsAggregate {
  return {
    source: 'authoritative_attendance',
    generatedAt,
    eligibleOccurrenceCount: 20,
    uniqueConsentingParticipantCount: 40,
    cells: [
      { firstMbti: 'ENFP', firstGender: 'female', secondMbti: 'INFP', secondGender: 'male', occurrenceCount: 10, uniqueConsentingParticipantCount: 20 },
      { firstMbti: 'ISFJ', firstGender: 'female', secondMbti: 'ISTJ', secondGender: 'male', occurrenceCount: 10, uniqueConsentingParticipantCount: 20 },
    ],
  }
}

test('meeting cells require k occurrences, k people and safe complements', () => {
  const published = protectMeetingStatsAggregate(aggregateWithTwoSafeCells(), null)
  assert.equal(published.status, 'published')
  assert.equal(published.cells.length, 2)

  const unsafe = protectMeetingStatsAggregate({
    ...aggregateWithTwoSafeCells(),
    eligibleOccurrenceCount: 10,
    uniqueConsentingParticipantCount: 20,
    cells: [aggregateWithTwoSafeCells().cells[0]],
  }, null)
  assert.equal(unsafe.status, 'insufficient_sample')
  assert.deepEqual(unsafe.cells, [])
})

test('a sub-k change suppresses the whole authoritative attendance release', () => {
  const previous = protectMeetingStatsAggregate(aggregateWithTwoSafeCells(), null)
  const current = aggregateWithTwoSafeCells('2026-09-06T12:00:00.000Z')
  current.eligibleOccurrenceCount = 21
  current.cells[0] = { ...current.cells[0], occurrenceCount: 11 }

  const protectedCurrent = protectMeetingStatsAggregate(current, previous)
  assert.equal(protectedCurrent.status, 'suppressed')
  assert.deepEqual(protectedCurrent.cells, [])
})
