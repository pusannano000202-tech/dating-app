export type CampusSevenActionWindowState =
  | 'not_scheduled'
  | 'wrong_day'
  | 'before_window'
  | 'open'
  | 'closed'

export type CampusSevenActionWindow = {
  isOpen: boolean
  opensAt: string | null
  closesAt: string | null
  state: CampusSevenActionWindowState
}

export type CampusSevenActionAvailability = {
  dayTwoChoices: CampusSevenActionWindow
  gameRank: CampusSevenActionWindow
  interestVote: CampusSevenActionWindow
  dateChoice: CampusSevenActionWindow
  dateResponse: CampusSevenActionWindow
  finalProposal: CampusSevenActionWindow
  finalResponse: CampusSevenActionWindow
  nextChangeAt: string | null
}

export type CampusSevenActionAvailabilityInput = {
  schedule: null | {
    dayNumber: number
    startsAt: string
    endsAt: string
  }
  now?: string
}

type ActionKey = Exclude<keyof CampusSevenActionAvailability, 'nextChangeAt'>
type WindowDefinition = { opensAtMs: number; closesAtMs: number }

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export function getCampusSevenActionAvailability(
  input: CampusSevenActionAvailabilityInput,
): CampusSevenActionAvailability {
  if (!input.schedule) return unavailable('not_scheduled')

  const startMs = parseTime(input.schedule.startsAt, 'startsAt')
  const endMs = parseTime(input.schedule.endsAt, 'endsAt')
  const nowMs = parseTime(input.now ?? new Date().toISOString(), 'now')
  if (endMs <= startMs) throw new Error('campus_seven_invalid_schedule')

  const definitions = definitionsForDay(input.schedule.dayNumber, startMs, endMs)
  const result = unavailable('wrong_day')
  const futureChanges: number[] = []

  for (const [key, definition] of Object.entries(definitions) as Array<[ActionKey, WindowDefinition]>) {
    const actionWindow = toWindow(definition, nowMs)
    result[key] = actionWindow
    if (actionWindow.state === 'before_window') futureChanges.push(definition.opensAtMs)
    if (actionWindow.state === 'open') futureChanges.push(definition.closesAtMs)
  }

  result.nextChangeAt = futureChanges.length > 0
    ? new Date(Math.min(...futureChanges)).toISOString()
    : null
  return result
}

export function getCampusSevenNextRefreshAt(input: {
  guideNextUnlockAt: string | null
  actionNextChangeAt: string | null
}): string | null {
  const candidates = [input.guideNextUnlockAt, input.actionNextChangeAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: parseTime(value, 'next_refresh') }))

  if (candidates.length === 0) return null
  return candidates.reduce((earliest, candidate) => (
    candidate.time < earliest.time ? candidate : earliest
  )).value
}

function definitionsForDay(
  dayNumber: number,
  startMs: number,
  endMs: number,
): Partial<Record<ActionKey, WindowDefinition>> {
  if (dayNumber === 2) {
    return { dayTwoChoices: actionWindow(startMs, startMs + 30 * MINUTE) }
  }
  if (dayNumber === 4) {
    return { gameRank: actionWindow(startMs + 155 * MINUTE, endMs + 30 * MINUTE) }
  }
  if ([1, 3, 5].includes(dayNumber)) {
    return { interestVote: actionWindow(startMs + 155 * MINUTE, endMs + 30 * MINUTE) }
  }
  if (dayNumber === 6) {
    return {
      dateChoice: actionWindow(startMs - 7 * HOUR, startMs - 4 * HOUR),
      dateResponse: actionWindow(startMs - 7 * HOUR, startMs - 2 * HOUR),
    }
  }
  if (dayNumber === 7) {
    const finalWindow = actionWindow(endMs, endMs + 2 * HOUR)
    return { finalProposal: finalWindow, finalResponse: finalWindow }
  }
  return {}
}

function actionWindow(opensAtMs: number, closesAtMs: number): WindowDefinition {
  return { opensAtMs, closesAtMs }
}

function toWindow(definition: WindowDefinition, nowMs: number): CampusSevenActionWindow {
  const state = nowMs < definition.opensAtMs
    ? 'before_window'
    : nowMs >= definition.closesAtMs
      ? 'closed'
      : 'open'
  return {
    isOpen: state === 'open',
    opensAt: new Date(definition.opensAtMs).toISOString(),
    closesAt: new Date(definition.closesAtMs).toISOString(),
    state,
  }
}

function unavailable(state: 'not_scheduled' | 'wrong_day'): CampusSevenActionAvailability {
  const closed = (): CampusSevenActionWindow => ({
    isOpen: false,
    opensAt: null,
    closesAt: null,
    state,
  })
  return {
    dayTwoChoices: closed(),
    gameRank: closed(),
    interestVote: closed(),
    dateChoice: closed(),
    dateResponse: closed(),
    finalProposal: closed(),
    finalResponse: closed(),
    nextChangeAt: null,
  }
}

function parseTime(value: string, field: string): number {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) throw new Error(`campus_seven_invalid_${field}`)
  return parsed
}
