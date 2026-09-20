import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarMonthCells, seoulDateKey, shiftCalendarMonth, formatCalendarCount, isCalendarEventOpen, canShowCalendarCoaching, calendarSelectedDay, canStartCalendarParticipation } from '../../lib/matching/calendar-navigation'
import { matchingEntryFor } from '../../lib/matching/match-entry-policy'

test('September 2026 begins Tuesday with no invented adjacent dates', () => {
  const cells = calendarMonthCells('2026-09')
  assert.equal(cells.length, 35)
  assert.deepEqual(cells.slice(0, 4), [null, null, '2026-09-01', '2026-09-02'])
  assert.equal(cells.indexOf('2026-09-20') % 7, 0)
  assert.equal(cells.indexOf('2026-09-30') % 7, 3)
})
test('month validation and year boundaries', () => {
  assert.deepEqual(calendarMonthCells('2026-13'), [])
  assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01')
  assert.equal(shiftCalendarMonth('2026-01', -1), '2025-12')
})
test('date grouping uses Korea time, not the device timezone', () => {
  assert.equal(seoulDateKey('2026-09-19T16:00:00Z'), '2026-09-20')
  assert.equal(seoulDateKey('invalid'), null)
})
test('an event deep link returns to its own date instead of the next recruiting date', () => {
  assert.equal(calendarSelectedDay({ month: '2026-09', requestedDay: null, eventStartsAt: '2026-09-27T07:00:00Z', nextEventDay: '2026-09-20', today: '2026-09-20' }), '2026-09-27')
  assert.equal(calendarSelectedDay({ month: '2026-09', requestedDay: '2026-09-21', eventStartsAt: null, nextEventDay: '2026-09-20', today: '2026-09-20' }), '2026-09-21')
  assert.equal(calendarSelectedDay({ month: '2026-09', requestedDay: '2026-02-31', eventStartsAt: '2026-10-01T07:00:00Z', nextEventDay: null, today: '2026-10-01' }), '2026-09-01')
})
test('count availability never turns failed/missing counts into zero', () => {
  assert.equal(formatCalendarCount(0), '신청 0명')
  assert.equal(formatCalendarCount(31), '신청 31명')
  assert.equal(formatCalendarCount(null), '신청 인원 확인 중')
  assert.equal(formatCalendarCount(8, true), '신청 인원 재확인 필요')
})
test('closed, stale and invalid schedules cannot enable admission', () => {
  const event = { status: 'recruiting', applicationClosesAt: '2026-09-20T03:00:00Z' }
  assert.equal(isCalendarEventOpen(event, '2026-09-20T02:59:00Z', false), true)
  assert.equal(isCalendarEventOpen(event, '2026-09-20T03:00:00Z', false), false)
  assert.equal(isCalendarEventOpen(event, '2026-09-20T02:59:00Z', true), false)
  assert.equal(isCalendarEventOpen({ ...event, status: 'cancelled' }, '2026-09-20T02:59:00Z', false), false)
})
test('relationship changes affect discovery only; unknown is not a single declaration', () => {
  assert.equal(matchingEntryFor('in_relationship').showTonight, false)
  assert.equal(matchingEntryFor('in_relationship').calendarHref, '/match/calendar?audience=couple')
  assert.equal(matchingEntryFor('single').showTonight, true)
  assert.equal(matchingEntryFor(null).calendarTitle, '이벤트 캘린더')
  assert.equal(matchingEntryFor(null).audience, 'unknown')
  assert.equal(matchingEntryFor(null).showTonight, false)
})
test('live coaching requires verified arrival as well as assignment, fresh data and event time', () => {
  const event={status:'assigned',startsAt:'2026-09-20T06:00:00Z',endsAt:'2026-09-20T08:00:00Z',myApplication:{status:'matched',attendanceStatus:'arrived'}}
  assert.equal(canShowCalendarCoaching(event,'2026-09-20T06:00:00Z'),true)
  assert.equal(canShowCalendarCoaching(event,'2026-09-20T05:59:59Z'),false)
  assert.equal(canShowCalendarCoaching(event,'2026-09-20T08:00:00Z'),false)
  assert.equal(canShowCalendarCoaching(event,'2026-09-20T06:00:00Z',true),false)
  for(const status of ['cancelled','completed'])assert.equal(canShowCalendarCoaching({...event,status},'2026-09-20T06:00:00Z'),false)
  assert.equal(canShowCalendarCoaching({...event,myApplication:null},'2026-09-20T06:00:00Z'),false)
  assert.equal(canShowCalendarCoaching({...event,myApplication:{status:'ready'}},'2026-09-20T06:00:00Z'),false)
  assert.equal(canShowCalendarCoaching({...event,myApplication:{status:'matched'}},'2026-09-20T06:00:00Z'),false)
  assert.equal(canShowCalendarCoaching({...event,myApplication:{status:'matched',attendanceStatus:'pending'}},'2026-09-20T06:00:00Z'),false)
})

test('browse links never make the wrong relationship audience eligible to start an application', () => {
  assert.equal(canStartCalendarParticipation('couple', 'single'), false)
  assert.equal(canStartCalendarParticipation('couple', null), false)
  assert.equal(canStartCalendarParticipation('single', 'in_relationship'), false)
  assert.equal(canStartCalendarParticipation('couple', 'in_relationship'), true)
  assert.equal(canStartCalendarParticipation('single', 'single'), true)
})
