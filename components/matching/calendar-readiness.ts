export type CalendarReadiness = {
  status: 'loading' | 'ready' | 'missing' | 'unavailable' | 'account_changed'
  profileHref: string
}

export function parseCalendarReadiness(value: unknown): CalendarReadiness | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (row.availability !== 'ready' || typeof row.matching_ready !== 'boolean'
    || !Array.isArray(row.missing_reasons) || !row.missing_reasons.every(reason => typeof reason === 'string')) return null
  if (row.appearance_status === 'unavailable') return null
  if (!['not_requested', 'pending', 'ready', 'failed', 'stale'].includes(String(row.appearance_status))) return null
  if (row.matching_ready && row.appearance_status !== 'ready') return null
  const profileHref = row.next_step === 'basic' ? '/profile/basic'
    : row.next_step === 'worldcup' ? '/profile/worldcup'
      : row.next_step === 'photos' ? '/profile/photos' : CALENDAR_PREPARATION_PATH
  return { status: row.matching_ready ? 'ready' : 'missing', profileHref }
}
export const CALENDAR_PREPARATION_PATH = '/match/calendar/prepare'
