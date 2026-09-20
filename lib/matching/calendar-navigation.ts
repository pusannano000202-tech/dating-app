const validMonth = (month: string) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(month)

export function calendarMonthCells(month: string): Array<string | null> {
  if (!validMonth(month)) return []
  const [year, number] = month.split('-').map(Number)
  const offset = new Date(Date.UTC(year, number - 1, 1)).getUTCDay()
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1
    return day < 1 || day > count ? null : `${month}-${String(day).padStart(2, '0')}`
  })
}

export function shiftCalendarMonth(month: string, delta: number) {
  if (!validMonth(month) || !Number.isInteger(delta)) return month
  const [year, number] = month.split('-').map(Number)
  const next = new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7)
  return validMonth(next) ? next : month
}

export function seoulDateKey(timestamp: string): string | null {
  const instant = Date.parse(timestamp)
  if (!Number.isFinite(instant)) return null
  return new Date(instant + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

export function calendarSelectedDay(input: {
  month: string; requestedDay: string | null; eventStartsAt?: string | null; nextEventDay: string | null; today: string | null
}): string {
  const dates = calendarMonthCells(input.month)
  const eventDay = input.eventStartsAt ? seoulDateKey(input.eventStartsAt) : null
  for (const day of [eventDay, input.requestedDay, input.nextEventDay, input.today]) {
    if (day && dates.includes(day)) return day
  }
  return `${input.month}-01`
}

export function formatCalendarCount(count: number | null, stale = false) {
  if (stale) return '신청 인원 재확인 필요'
  return count !== null && Number.isSafeInteger(count) && count >= 0
    ? `신청 ${count.toLocaleString('ko-KR')}명` : '신청 인원 확인 중'
}

export function isCalendarEventOpen(event: {status: string; applicationClosesAt: string}, now: string, stale = false) {
  return !stale && event.status === 'recruiting'
    && Number.isFinite(Date.parse(now)) && Date.parse(now) < Date.parse(event.applicationClosesAt)
}

export function canStartCalendarParticipation(audience: 'single' | 'couple', relationshipStatus: string | null): boolean {
  return audience === 'couple' ? relationshipStatus === 'in_relationship' : relationshipStatus === 'single'
}

export function canShowCalendarCoaching(event: {status: string; startsAt: string; endsAt: string; myApplication: {status: string; attendanceStatus?: string}|null}, now: string, stale = false) {
  // The calendar projection currently has no arrival evidence. Its cards stay
  // previews; only an authoritative participation projection can unlock them.
  return !stale && ['assigned','closed','recruiting'].includes(event.status)
    && !!event.myApplication && ['assigned','matched'].includes(event.myApplication.status)
    && event.myApplication.attendanceStatus === 'arrived'
    && Date.parse(now) >= Date.parse(event.startsAt) && Date.parse(now) < Date.parse(event.endsAt)
}
