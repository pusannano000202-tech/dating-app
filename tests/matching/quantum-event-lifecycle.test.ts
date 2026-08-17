import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveQuantumEventLifecycleStage,
  isActiveQuantumEventLifecycle,
  isQuantumEventLifecycle,
  type QuantumEventLifecycle,
} from '../../lib/matching/quantum-event-lifecycle'

const base: QuantumEventLifecycle = {
  occurrence_id: '83a1a5ce-1b3d-4a0e-9d50-d3a3e620398a',
  room_number: 1,
  room_label: 'A방',
  room_code: 'A1B2C3',
  event_id: 'tonight-board-game',
  event_mode: 'tonight',
  party_type: 'solo',
  group_id: null,
  status: 'recruiting',
  starts_at: '2026-08-11T12:00:00.000Z',
  ends_at: '2026-08-11T14:00:00.000Z',
  chat_opens_at: '2026-08-11T11:40:00.000Z',
  server_now: '2026-08-11T09:00:00.000Z',
  match_id: null,
  location_name: null,
  cancel_reason: null,
  participant_counts: {
    total: 3,
    male: 2,
    female: 1,
    required_total: 5,
  },
  party_members: [],
  review_required: false,
  updated_at: '2026-08-11T08:55:00.000Z',
}

test('lifecycle keeps an unmatched application in recruiting', () => {
  assert.equal(deriveQuantumEventLifecycleStage(base), 'recruiting')
})

test('lifecycle moves a matched event through confirmed, chat, meeting, and review states', () => {
  const matched = {
    ...base,
    status: 'confirmed' as const,
    match_id: '0c9da21c-529f-42ba-ad93-0b0d5223b88d',
    location_name: '온천장역 3번 출구',
  }

  assert.equal(deriveQuantumEventLifecycleStage(matched), 'confirmed')
  assert.equal(deriveQuantumEventLifecycleStage({
    ...matched,
    server_now: '2026-08-11T11:40:00.000Z',
  }), 'chat_open')
  assert.equal(deriveQuantumEventLifecycleStage({
    ...matched,
    server_now: '2026-08-11T12:00:00.000Z',
  }), 'in_progress')
  assert.equal(deriveQuantumEventLifecycleStage({
    ...matched,
    status: 'completed',
    server_now: '2026-08-11T14:10:00.000Z',
    review_required: true,
  }), 'completed')
})

test('elapsed time alone never opens post-meeting profiles before server completion', () => {
  assert.equal(deriveQuantumEventLifecycleStage({
    ...base,
    status: 'confirmed',
    match_id: '0c9da21c-529f-42ba-ad93-0b0d5223b88d',
    server_now: '2026-08-11T14:10:00.000Z',
  }), 'in_progress')
})

test('cancelled wins over schedule timestamps', () => {
  const cancelled = {
    ...base,
    status: 'cancelled' as const,
    cancel_reason: 'minimum_participants_not_met',
    server_now: '2026-08-11T13:00:00.000Z',
  }

  assert.equal(deriveQuantumEventLifecycleStage(cancelled), 'cancelled')
  assert.equal(isActiveQuantumEventLifecycle(cancelled), false)
  assert.equal(isActiveQuantumEventLifecycle(base), true)
  assert.equal(isActiveQuantumEventLifecycle({
    ...base,
    status: 'completed',
    review_required: true,
  }), false)
})

test('lifecycle parser rejects client-shaped or incomplete timing data', () => {
  assert.equal(isQuantumEventLifecycle(base), true)
  assert.equal(isQuantumEventLifecycle({ ...base, server_now: 'not-a-date' }), false)
  assert.equal(isQuantumEventLifecycle({ ...base, participant_counts: { total: 3 } }), false)
  assert.equal(isQuantumEventLifecycle({ ...base, status: 'anything' }), false)
  assert.equal(isQuantumEventLifecycle({ ...base, room_code: 'broken' }), false)
})

test('lifecycle accepts an oversubscribed applicant pool while keeping the five-person target', () => {
  assert.equal(isQuantumEventLifecycle({
    ...base,
    participant_counts: {
      total: 14,
      male: 10,
      female: 4,
      required_total: 5,
    },
  }), true)
})
