import { seoulDateKey } from './calendar-navigation'
import { getSeoulWeekKey } from './weekly-availability'

type SearchParams = Record<string, string | string[] | undefined>

export function calendarWeeklyApplicationsPath(event: { id: string; startsAt: string }): string {
  const day = seoulDateKey(event.startsAt)
  if (!day) return '/match/weekly'
  const query = new URLSearchParams({
    week_key: getSeoulWeekKey(event.startsAt), month: day.slice(0, 7), event: event.id,
  })
  return `/match/weekly?${query}`
}

/** Keep the weekly API's Monday date policy; never accept an arbitrary return URL. */
export function weeklyPageNavigation(params: SearchParams): { weekKey?: string; calendarHref: string } | null {
  const weekKey = params.week_key
  if (weekKey !== undefined) {
    if (typeof weekKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return null
    try {
      if (getSeoulWeekKey(`${weekKey}T00:00:00.000Z`) !== weekKey) return null
    } catch { return null }
  }
  const query = new URLSearchParams()
  if (typeof params.month === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(params.month)) {
    query.set('audience', 'single')
    query.set('month', params.month)
    if (typeof params.event === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.event)) {
      query.set('event', params.event)
      query.set('step', 'participation')
    }
  }
  return { weekKey, calendarHref: query.size ? `/match/calendar?${query}` : '/match/calendar' }
}
