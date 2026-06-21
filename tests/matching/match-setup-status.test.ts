import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getMatchSetupStatus,
  hasAvailableTimeslots,
  hasPreferenceWeights,
} from '../../lib/matching/match-setup-status'

test('match setup status requires personality, concrete timeslot, and valid four weights', () => {
  assert.deepEqual(
    getMatchSetupStatus({
      personality_preference_completed_at: '2026-06-18T00:00:00.000Z',
      available_timeslots: {
        slots: [{ day: 'friday', start: '18:00', end: '22:00' }],
      },
      preference_weights: {
        appearance: 0.35,
        personality: 0.35,
        height: 0.15,
        body_type: 0.15,
      },
    }),
    {
      personality: true,
      schedule: true,
      preferences: true,
      allDone: true,
    },
  )
})

test('match setup status rejects placeholder timeslots and loose weight objects', () => {
  assert.equal(hasAvailableTimeslots({ slots: [{}] }), false)
  assert.equal(hasPreferenceWeights({ dev: true }), false)
  assert.equal(hasPreferenceWeights({ appearance: 1 }), false)
  assert.equal(
    hasPreferenceWeights({
      appearance: 0.25,
      personality: 0.25,
      height: 0.25,
      body_type: 0.25,
      school: 0,
      hobby: 0,
      time_fit: 0,
    }),
    false,
  )

  assert.deepEqual(
    getMatchSetupStatus({
      personality_preference_completed_at: '2026-06-18T00:00:00.000Z',
      available_timeslots: { slots: [{}] },
      preference_weights: { dev: true },
    }),
    {
      personality: true,
      schedule: false,
      preferences: false,
      allDone: false,
    },
  )
})
