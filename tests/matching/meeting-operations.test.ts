import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMeetingOperations } from '../../lib/matching/meeting-operations'

test('meeting operations derive chat, check-in, report, and evidence windows from the server schedule', () => {
  const operations = buildMeetingOperations({
    startsAt: '2026-08-11T10:00:00.000Z',
    endsAt: '2026-08-11T12:00:00.000Z',
    now: '2026-08-11T09:45:00.000Z',
  })

  assert.deepEqual(operations, {
    starts_at: '2026-08-11T10:00:00.000Z',
    ends_at: '2026-08-11T12:00:00.000Z',
    chat_opens_at: '2026-08-11T09:40:00.000Z',
    check_in_opens_at: '2026-08-11T09:40:00.000Z',
    no_show_report_opens_at: '2026-08-11T10:10:00.000Z',
    evidence_upload_opens_at: '2026-08-11T09:40:00.000Z',
    evidence_upload_closes_at: '2026-08-12T12:00:00.000Z',
    phase: 'check_in',
    can_upload_evidence: true,
  })
})

test('meeting operations reject an invalid schedule', () => {
  assert.throws(
    () => buildMeetingOperations({
      startsAt: '2026-08-11T12:00:00.000Z',
      endsAt: '2026-08-11T10:00:00.000Z',
      now: '2026-08-11T09:00:00.000Z',
    }),
    /invalid_meeting_schedule/,
  )
})

test('meeting operations close evidence after the submission window', () => {
  const operations = buildMeetingOperations({
    startsAt: '2026-08-11T10:00:00.000Z',
    endsAt: '2026-08-11T12:00:00.000Z',
    now: '2026-08-12T12:00:00.001Z',
  })

  assert.equal(operations.phase, 'closed')
  assert.equal(operations.can_upload_evidence, false)
})
