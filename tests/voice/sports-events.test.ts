import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SPORTS_SOURCE_LABEL,
  SPORTS_SOURCE_LABEL_KO,
  parseSportsEventMutation,
} from '../../lib/voice/sports-events'

const validEvent = {
  sport: 'baseball',
  league: 'KBO',
  eventKey: 'KBO:2026-09-08-LOTTE-LG-1',
  homeTeam: 'LG 트윈스',
  awayTeam: '롯데 자이언츠',
  startsAt: '2026-09-08T09:30:00+09:00',
  status: 'scheduled',
  sourceUrl: 'https://www.koreabaseball.com/Schedule/Schedule.aspx',
  sourceRevision: '2026-09-07 21:00 운영자 재확인',
  reviewNote: 'KBO 공식 일정 페이지를 직접 확인함',
}

test('sports mutation normalizes a manually reviewed KBO event', () => {
  assert.equal(SPORTS_SOURCE_LABEL, 'operator_manual_review')
  assert.match(SPORTS_SOURCE_LABEL_KO, /수동 검수/)
  assert.deepEqual(
    parseSportsEventMutation({
      action: 'create',
      expectedRevision: 0,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      event: validEvent,
    }),
    {
      action: 'create',
      expectedRevision: 0,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      event: {
        ...validEvent,
        eventKey: 'kbo:2026-09-08-lotte-lg-1',
        startsAt: '2026-09-08T00:30:00.000Z',
        sourceUrl:
          'https://www.koreabaseball.com/Schedule/Schedule.aspx',
      },
    },
  )
})

test('sports update requires CAS identity and rejects unknown or forged fields', () => {
  const base = {
    action: 'update',
    eventId: '22222222-2222-4222-8222-222222222222',
    expectedRevision: 3,
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    event: validEvent,
  }
  assert.equal(parseSportsEventMutation(base).expectedRevision, 3)
  for (const input of [
    { ...base, ownerId: '33333333-3333-4333-8333-333333333333' },
    { ...base, schoolScope: 'other_school' },
    { ...base, expectedRevision: -1 },
    { ...base, eventId: undefined },
    { ...base, event: { ...validEvent, sourceLabel: 'api_verified' } },
  ])
    assert.throws(() => parseSportsEventMutation(input), /invalid_input/)
})

test('sports input accepts only the reviewed KBO source contract', () => {
  const create = (event: Record<string, unknown>) => ({
    action: 'create',
    expectedRevision: 0,
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    event,
  })
  for (const event of [
    { ...validEvent, sport: 'football' },
    { ...validEvent, league: 'MLB' },
    { ...validEvent, sourceUrl: 'https://evil.example/kbo' },
    { ...validEvent, sourceUrl: 'https://koreabaseball.com.evil.example/' },
    { ...validEvent, homeTeam: validEvent.awayTeam },
    { ...validEvent, startsAt: 'not-a-date' },
    { ...validEvent, eventKey: '../unsafe' },
    { ...validEvent, reviewNote: 'x' },
  ])
    assert.throws(() => parseSportsEventMutation(create(event)), /invalid_input/)
})
