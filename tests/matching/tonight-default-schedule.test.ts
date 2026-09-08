import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDefaultTonightScheduleKst } from '../../lib/matching/tonight-ranked/schedule'

test('19:30 Tonight default finishes capacity, payment, partner acceptance, and reveal within one hour', () => {
  const schedule = buildDefaultTonightScheduleKst('2026-09-03')

  assert.deepEqual(schedule, {
    signupCloseAt: '2026-09-03T18:30:00+09:00',
    capacityLockAt: '2026-09-03T18:30:00+09:00',
    allocationPublishAt: '2026-09-03T18:32:00+09:00',
    depositDueAt: '2026-09-03T18:45:00+09:00',
    partnerAcceptanceDueAt: '2026-09-03T18:50:00+09:00',
    revealAt: '2026-09-03T18:55:00+09:00',
    arrivalAt: '2026-09-03T19:20:00+09:00',
    startsAt: '2026-09-03T19:30:00+09:00',
  })
})

test('default schedule rejects impossible service dates', () => {
  for (const date of ['2026-02-30', '2026-9-3', '', 'not-a-date']) {
    assert.throws(() => buildDefaultTonightScheduleKst(date), /invalid_service_date/)
  }
})
