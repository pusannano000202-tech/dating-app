import { requireUuid } from './policy'

export const SPORTS_SOURCE_LABEL = 'operator_manual_review' as const
export const SPORTS_SOURCE_LABEL_KO = '운영자 수동 검수 기록' as const

export type CommunitySportsEventStatus =
  | 'scheduled'
  | 'delayed'
  | 'cancelled'
  | 'completed'

export type CommunitySportsEventInput = {
  sport: 'baseball'
  league: 'KBO'
  eventKey: string
  homeTeam: string
  awayTeam: string
  startsAt: string
  status: CommunitySportsEventStatus
  sourceUrl: string
  sourceRevision: string
  reviewNote: string
}

export type CommunitySportsEventSnapshot = Omit<
  CommunitySportsEventInput,
  'reviewNote'
> & {
  id: string
  schoolScope: string
  sourceLabel: typeof SPORTS_SOURCE_LABEL
  checkedAt: string
  revision: number
}

export type CommunitySportsEventHistory = {
  revision: number
  changeNote: string
  recordedAt: string
  snapshot: CommunitySportsEventSnapshot
}

export type CommunitySportsEvent = CommunitySportsEventSnapshot & {
  history: CommunitySportsEventHistory[]
}

export type CommunitySportsEventMutation = {
  action: 'create' | 'update'
  eventId?: string
  expectedRevision: number
  idempotencyKey: string
  event: CommunitySportsEventInput
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_input')
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (
    Object.keys(value).length !== allowed.length ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error('invalid_input')
}

function text(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string') throw new Error('invalid_input')
  const normalized = value.trim()
  if (
    normalized.length < min ||
    normalized.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(normalized)
  )
    throw new Error('invalid_input')
  return normalized
}

function parseEvent(value: unknown): CommunitySportsEventInput {
  const event = object(value)
  exactKeys(event, [
    'sport',
    'league',
    'eventKey',
    'homeTeam',
    'awayTeam',
    'startsAt',
    'status',
    'sourceUrl',
    'sourceRevision',
    'reviewNote',
  ])
  if (event.sport !== 'baseball' || event.league !== 'KBO')
    throw new Error('invalid_input')
  const eventKey = text(event.eventKey, 3, 120).toLowerCase()
  if (!/^[a-z0-9][a-z0-9:_-]{2,119}$/.test(eventKey))
    throw new Error('invalid_input')
  const homeTeam = text(event.homeTeam, 1, 80)
  const awayTeam = text(event.awayTeam, 1, 80)
  if (homeTeam.toLocaleLowerCase() === awayTeam.toLocaleLowerCase())
    throw new Error('invalid_input')
  const startsAtMillis = Date.parse(text(event.startsAt, 10, 40))
  if (!Number.isFinite(startsAtMillis)) throw new Error('invalid_input')
  if (
    !['scheduled', 'delayed', 'cancelled', 'completed'].includes(
      String(event.status),
    )
  )
    throw new Error('invalid_input')
  let sourceUrl: URL
  try {
    sourceUrl = new URL(text(event.sourceUrl, 10, 500))
  } catch {
    throw new Error('invalid_input')
  }
  if (
    sourceUrl.protocol !== 'https:' ||
    sourceUrl.username ||
    sourceUrl.password ||
    sourceUrl.port ||
    sourceUrl.hash ||
    !['www.koreabaseball.com', 'koreabaseball.com'].includes(
      sourceUrl.hostname,
    )
  )
    throw new Error('invalid_input')
  return {
    sport: 'baseball',
    league: 'KBO',
    eventKey,
    homeTeam,
    awayTeam,
    startsAt: new Date(startsAtMillis).toISOString(),
    status: event.status as CommunitySportsEventStatus,
    sourceUrl: sourceUrl.href,
    sourceRevision: text(event.sourceRevision, 3, 120),
    reviewNote: text(event.reviewNote, 3, 500),
  }
}

export function parseSportsEventMutation(
  input: unknown,
): CommunitySportsEventMutation {
  const value = object(input)
  if (value.action !== 'create' && value.action !== 'update')
    throw new Error('invalid_input')
  const isUpdate = value.action === 'update'
  exactKeys(
    value,
    isUpdate
      ? [
          'action',
          'eventId',
          'expectedRevision',
          'idempotencyKey',
          'event',
        ]
      : ['action', 'expectedRevision', 'idempotencyKey', 'event'],
  )
  if (
    !Number.isSafeInteger(value.expectedRevision) ||
    (value.expectedRevision as number) < 0 ||
    (!isUpdate && value.expectedRevision !== 0)
  )
    throw new Error('invalid_input')
  return {
    action: value.action,
    ...(isUpdate ? { eventId: requireUuid(value.eventId) } : {}),
    expectedRevision: value.expectedRevision as number,
    idempotencyKey: requireUuid(value.idempotencyKey),
    event: parseEvent(value.event),
  }
}
