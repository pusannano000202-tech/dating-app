import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getSeoulWeekKey,
  parseWeeklyApplicationInput,
  validateWeeklyCandidateWindows,
  type ConfirmedSchedule,
  type WeeklyActivityWindow,
} from '../../lib/matching/weekly-availability'
import * as weeklyAvailability from '../../lib/matching/weekly-availability'

const windows: WeeklyActivityWindow[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    activityId: 'weekly-walk',
    weekKey: '2026-09-07',
    status: 'recruiting',
    startsAt: '2026-09-11T10:00:00.000Z',
    endsAt: '2026-09-11T12:00:00.000Z',
    applicationClosesAt: '2026-09-10T10:00:00.000Z',
    capacity: 6,
    applicantCount: 4,
    assignedCount: 2,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    activityId: 'weekly-walk',
    weekKey: '2026-09-07',
    status: 'recruiting',
    startsAt: '2026-09-12T10:00:00.000Z',
    endsAt: '2026-09-12T12:00:00.000Z',
    applicationClosesAt: '2026-09-11T10:00:00.000Z',
    capacity: 6,
    applicantCount: 3,
    assignedCount: 1,
  },
]

test('multiple candidate dates remain one weekly application command', () => {
  const parsed = parseWeeklyApplicationInput({
    activity_id: 'weekly-walk',
    week_key: '2026-09-07',
    candidate_window_ids: [windows[0].id, windows[1].id, windows[0].id],
    party_group_id: null,
    idempotency_key: '20000000-0000-4000-8000-000000000001',
  })

  assert.deepEqual(parsed, {
    ok: true,
    value: {
      activityId: 'weekly-walk',
      weekKey: '2026-09-07',
      candidateWindowIds: [windows[0].id, windows[1].id],
      partyGroupId: null,
      idempotencyKey: '20000000-0000-4000-8000-000000000001',
    },
  })
})

test('a weekly friend party application carries one exact accepted group', () => {
  const parsed = parseWeeklyApplicationInput({
    activity_id: 'weekly-walk',
    week_key: '2026-09-07',
    candidate_window_ids: windows.map((window) => window.id),
    party_group_id: '30000000-0000-4000-8000-000000000001',
    idempotency_key: '20000000-0000-4000-8000-000000000002',
  })

  assert.deepEqual(parsed, {
    ok: true,
    value: {
      activityId: 'weekly-walk',
      weekKey: '2026-09-07',
      candidateWindowIds: windows.map((window) => window.id),
      partyGroupId: '30000000-0000-4000-8000-000000000001',
      idempotencyKey: '20000000-0000-4000-8000-000000000002',
    },
  })

  assert.deepEqual(parseWeeklyApplicationInput({
    activity_id: 'weekly-walk',
    week_key: '2026-09-07',
    candidate_window_ids: [windows[0].id],
    party_group_id: 'not-a-uuid',
    idempotency_key: '20000000-0000-4000-8000-000000000003',
  }), { ok: false, error: 'invalid_party_group' })
})

test('party consent commands require an exact application revision and stable key', () => {
  const parseWeeklyPartyConsentInput = (weeklyAvailability as unknown as {
    parseWeeklyPartyConsentInput?: (value: unknown) => unknown
  }).parseWeeklyPartyConsentInput
  assert.equal(typeof parseWeeklyPartyConsentInput, 'function')
  if (!parseWeeklyPartyConsentInput) return

  assert.deepEqual(parseWeeklyPartyConsentInput({
    application_id: '40000000-0000-4000-8000-000000000001',
    decision: 'accept',
    expected_revision: 2,
    idempotency_key: '50000000-0000-4000-8000-000000000001',
  }), {
    ok: true,
    value: {
      applicationId: '40000000-0000-4000-8000-000000000001',
      decision: 'accept',
      expectedRevision: 2,
      idempotencyKey: '50000000-0000-4000-8000-000000000001',
    },
  })

  assert.deepEqual(parseWeeklyPartyConsentInput({
    application_id: '40000000-0000-4000-8000-000000000001',
    decision: 'accept',
    expected_revision: -1,
    idempotency_key: '50000000-0000-4000-8000-000000000001',
  }), { ok: false, error: 'invalid_revision' })
  assert.deepEqual(parseWeeklyPartyConsentInput({
    application_id: '40000000-0000-4000-8000-000000000001',
    decision: 'decline',
    expected_revision: 2,
    idempotency_key: '50000000-0000-4000-8000-000000000001',
  }), { ok: false, error: 'invalid_decision' })
})

test('weekly party state conflicts never surface as service outages', () => {
  const mapWeeklyAvailabilityRpcError = (weeklyAvailability as unknown as {
    mapWeeklyAvailabilityRpcError?: (value: unknown) => unknown
  }).mapWeeklyAvailabilityRpcError
  assert.equal(typeof mapWeeklyAvailabilityRpcError, 'function')
  if (!mapWeeklyAvailabilityRpcError) return

  assert.deepEqual(
    mapWeeklyAvailabilityRpcError({ message: 'assigned_application_cannot_cancel' }),
    { status: 409, error: 'not_ready' },
  )
  assert.deepEqual(
    mapWeeklyAvailabilityRpcError({ message: 'party_roster_changed' }),
    { status: 409, error: 'not_ready' },
  )
  assert.deepEqual(
    mapWeeklyAvailabilityRpcError({ message: 'duplicate_candidate_window' }),
    { status: 400, error: 'invalid_request' },
  )
  assert.deepEqual(
    mapWeeklyAvailabilityRpcError({ message: 'weekly_assignment_retry' }),
    { status: 409, error: 'assignment_retry', retryable: true },
  )
  assert.equal(mapWeeklyAvailabilityRpcError({ message: 'unexpected_database_error' }), null)
})

test('weekly candidate validation rejects rollover, closed capacity, and impossible schedule sets', () => {
  const confirmed: ConfirmedSchedule[] = [{
    startsAt: '2026-09-11T09:30:00.000Z',
    endsAt: '2026-09-11T10:30:00.000Z',
  }]

  assert.deepEqual(
    validateWeeklyCandidateWindows({
      activityId: 'weekly-walk',
      weekKey: '2026-09-07',
      candidateWindowIds: windows.map((window) => window.id),
      windows,
      serverNow: '2026-09-09T00:00:00.000Z',
      confirmedSchedules: confirmed,
    }),
    { ok: true, assignableWindowIds: [windows[1].id], conflictingWindowIds: [windows[0].id] },
  )

  assert.deepEqual(
    validateWeeklyCandidateWindows({
      activityId: 'weekly-walk',
      weekKey: '2026-09-14',
      candidateWindowIds: [windows[0].id],
      windows,
      serverNow: '2026-09-09T00:00:00.000Z',
      confirmedSchedules: [],
    }),
    { ok: false, error: 'week_mismatch' },
  )

  assert.equal(getSeoulWeekKey('2026-09-13T15:01:00.000Z'), '2026-09-14')
})
