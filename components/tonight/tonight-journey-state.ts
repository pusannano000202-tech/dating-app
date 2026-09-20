export function formatTonightCount(value: unknown, unit: '명' | '팀'): string {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? `${value.toLocaleString('ko-KR')}${unit}`
    : '확인 불가'
}

export function isTonightSnapshotFresh(receivedAt: number|null, now: number, failed: boolean): boolean {
  return !failed && receivedAt !== null && Number.isFinite(receivedAt) && Number.isFinite(now)
    && now >= receivedAt && now - receivedAt < 75_000
}

/** Display-only classification. The server still authorizes every application. */
export function tonightRecruitmentState(data: {
  applicationsOpen: boolean
  applicationsAvailable?: boolean
  round: { status: string; signupOpenAt?: string; signupCloseAt: string }
}, now: number, fresh = true): 'open' | 'upcoming' | 'closed' | 'paused' | 'unavailable' {
  const closes = Date.parse(data.round.signupCloseAt)
  const opens = Date.parse(data.round.signupOpenAt ?? '')
  if (!fresh || data.applicationsAvailable === false || !Number.isFinite(now) || !Number.isFinite(closes)) return 'unavailable'
  if (now >= closes || ['completed', 'cancelled'].includes(data.round.status)) return 'closed'
  if (Number.isFinite(opens) && now < opens) return 'upcoming'
  if (data.round.status !== 'open') return 'closed'
  return data.applicationsOpen ? 'open' : 'paused'
}

export function tonightServiceDateLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '회차 날짜 확인 필요'
  const date = new Date(`${value}T12:00:00+09:00`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '회차 날짜 확인 필요'
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul' }).format(date)
}

type CoachingSnapshot = {
  round: { status: string; serviceDate: string; startsAt: string }
  application: { id: string; status: string; deposit: { status: string } | null } | null
  journey: { applicationId: string; teamId: string | null; teamStatus: string | null; attendanceStatus: string | null; canRevealExactVenue: boolean } | null
}

/** Narrows presentation of public advice; never grants chat, arrival or financial access. */
export function canShowTonightMeetingCoaching(data: CoachingSnapshot, now: number): boolean {
  const { application, journey, round } = data
  const starts = Date.parse(round.startsAt)
  if (!Number.isFinite(now) || !Number.isFinite(starts) || now < starts) return false
  const dateInKorea = new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return Boolean(
    ['accepted', 'in_progress'].includes(round.status) && round.serviceDate === dateInKorea
    && application?.status === 'allocated' && application.deposit?.status === 'paid'
    && journey?.applicationId === application.id && journey.teamId
    && ['accepted', 'revealed', 'in_progress'].includes(journey.teamStatus ?? '') && journey.attendanceStatus === 'arrived'
    && journey.canRevealExactVenue,
  )
}
