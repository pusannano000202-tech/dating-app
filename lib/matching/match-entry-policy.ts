import type { RelationshipStatus } from '../relationship/contract'

/** Presentation only. Admission remains an authenticated server/DB decision. */
export function matchingEntryFor(status: RelationshipStatus | null) {
  if (status === null) return {
    audience: 'unknown' as const, showTonight: false,
    calendarTitle: '이벤트 캘린더', calendarHref: '/match/calendar',
  }
  return status === 'in_relationship'
    ? { audience: 'couple' as const, showTonight: false, calendarTitle: '커플 이벤트 캘린더', calendarHref: '/match/calendar?audience=couple' }
    : { audience: 'single' as const, showTonight: true, calendarTitle: '이벤트 캘린더', calendarHref: '/match/calendar' }
}
