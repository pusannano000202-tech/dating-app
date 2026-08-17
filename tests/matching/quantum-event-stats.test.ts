import assert from 'node:assert/strict'
import test from 'node:test'

import {
  aggregateQuantumEventApplicantStats,
  type QuantumEventApplicantRow,
} from '../../lib/matching/quantum-event-stats'

const now = new Date('2026-08-10T12:00:00.000Z')

function row(overrides: Partial<QuantumEventApplicantRow> = {}): QuantumEventApplicantRow {
  return {
    event_id: 'tonight-onsenjjang-run',
    event_mode: 'tonight',
    party_type: 'solo',
    status: 'recruiting',
    updated_at: '2026-08-10T09:00:00.000Z',
    gender: 'male',
    ...overrides,
  }
}

test('event applicant stats count real accounts by gender and party choice', () => {
  const stats = aggregateQuantumEventApplicantStats([
    row(),
    row({ gender: 'female', party_type: 'friends' }),
    row({ gender: null }),
  ], now)

  assert.deepEqual(stats['tonight-onsenjjang-run'], {
    waiting_accounts: 3,
    male_applicants: 1,
    female_applicants: 1,
    unknown_applicants: 1,
    solo_applications: 2,
    friend_applications: 1,
  })
})

test('event applicant stats exclude cancelled accounts from live demand', () => {
  const stats = aggregateQuantumEventApplicantStats([
    row(),
    row({ status: 'cancelled', gender: 'female' }),
  ], now)

  assert.equal(stats['tonight-onsenjjang-run']?.waiting_accounts, 1)
  assert.equal(stats['tonight-onsenjjang-run']?.female_applicants, 0)
})

test('event applicant stats drop stale tonight selections instead of presenting fake live demand', () => {
  const stats = aggregateQuantumEventApplicantStats([
    row({ updated_at: '2026-08-09T12:00:00.000Z' }),
    row({ event_mode: 'scheduled', event_id: 'scheduled-board-game', updated_at: '2026-08-01T12:00:00.000Z' }),
  ], now)

  assert.equal(stats['tonight-onsenjjang-run'], undefined)
  assert.equal(stats['scheduled-board-game']?.waiting_accounts, 1)
})
