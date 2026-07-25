import test from 'node:test'
import assert from 'node:assert/strict'
import { redactCampusSevenLocation } from '../../lib/campus-seven/dashboard'

const dashboard = {
  schedule: {
    id: 'schedule-1',
    dayNumber: 1,
    title: '첫 저녁',
    startsAt: '2026-07-18T10:00:00.000Z',
    endsAt: '2026-07-18T13:00:00.000Z',
    meetingPointName: '부산대 정문',
    meetingPointAddress: '부산 금정구',
    venueName: '오늘의 식당',
    venueAddress: '부산 금정구 장전동',
    venueBookingUrl: 'https://example.com/book',
    allowedMenuNote: '식사 메뉴만 주문해 주세요.',
  },
  reservationTask: null,
}

test('dashboard hides location fields before the arrival cue', () => {
  const safe = redactCampusSevenLocation(dashboard, { messages: [] })

  assert.equal(safe.schedule?.title, '첫 저녁')
  assert.equal(safe.schedule?.meetingPointName, null)
  assert.equal(safe.schedule?.meetingPointAddress, null)
  assert.equal(safe.schedule?.venueName, null)
  assert.equal(safe.schedule?.venueAddress, null)
  assert.equal(safe.schedule?.venueBookingUrl, null)
  assert.equal(safe.schedule?.allowedMenuNote, null)
})

test('dashboard reveals location after the arrival cue', () => {
  const safe = redactCampusSevenLocation(dashboard, {
    messages: [{ id: 'day-1-arrival' }],
  })

  assert.equal(safe.schedule?.meetingPointName, '부산대 정문')
  assert.equal(safe.schedule?.venueName, '오늘의 식당')
  assert.equal(safe.schedule?.venueBookingUrl, 'https://example.com/book')
})

test('reservation assignee receives location before the arrival cue', () => {
  const safe = redactCampusSevenLocation({
    ...dashboard,
    reservationTask: { id: 'task-1' },
  }, { messages: [] })

  assert.equal(safe.schedule?.venueName, '오늘의 식당')
  assert.equal(safe.schedule?.allowedMenuNote, '식사 메뉴만 주문해 주세요.')
})
