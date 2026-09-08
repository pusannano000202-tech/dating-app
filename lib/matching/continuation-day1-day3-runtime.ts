export type ContinuationDay1Game = 'dalmuti' | 'halligalli' | 'one-card'
export type ContinuationDay3Team = 'A' | 'B' | 'C'

export type ContinuationDay1PrivateGameRuntime = {
  kind: 'day1'
  voteOpen: boolean
  canVote: boolean
  resultAvailable: boolean
  myVote: ContinuationDay1Game | null
  selectedGame: ContinuationDay1Game | null
  canFinish: boolean
}

export type ContinuationDay3TiebreakRuntime = {
  kind: 'day3'
  phase: 'none' | 'needs_last_frame' | 'needs_one_ball' | 'resolved'
  tiedTeams: ContinuationDay3Team[]
}

const DAY1_RUNTIME_KEYS = [
  'kind', 'vote_open', 'can_vote', 'result_available', 'my_vote', 'selected_game', 'can_finish',
] as const
const DAY3_RUNTIME_KEYS = ['kind', 'tie_break_phase', 'tied_teams'] as const

export function parseDay1PrivateGameRuntime(value: unknown): ContinuationDay1PrivateGameRuntime | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, DAY1_RUNTIME_KEYS)) return null
  if (value.kind !== 'day1'
      || typeof value.vote_open !== 'boolean'
      || typeof value.can_vote !== 'boolean'
      || typeof value.result_available !== 'boolean'
      || typeof value.can_finish !== 'boolean') return null
  const myVote = nullableDay1Game(value.my_vote)
  const selectedGame = nullableDay1Game(value.selected_game)
  if (myVote === undefined || selectedGame === undefined) return null
  if (!value.result_available && selectedGame !== null) return null
  return {
    kind: 'day1',
    voteOpen: value.vote_open,
    canVote: value.can_vote,
    resultAvailable: value.result_available,
    myVote,
    selectedGame,
    canFinish: value.can_finish,
  }
}

export function parseDay3TiebreakRuntime(value: unknown): ContinuationDay3TiebreakRuntime | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, DAY3_RUNTIME_KEYS)
      || value.kind !== 'day3'
      || !isDay3Phase(value.tie_break_phase)
      || !Array.isArray(value.tied_teams)) return null
  const tiedTeams: ContinuationDay3Team[] = []
  for (const team of value.tied_teams) {
    if (!isDay3Team(team) || tiedTeams.includes(team)) return null
    tiedTeams.push(team)
  }
  if ((value.tie_break_phase === 'needs_last_frame' || value.tie_break_phase === 'needs_one_ball')
      !== (tiedTeams.length > 0)) return null
  return { kind: 'day3', phase: value.tie_break_phase, tiedTeams }
}

export function buildDay3LastFramePayload(
  aliases: readonly string[],
  values: Readonly<Record<string, string>>,
): { scores: Array<{ alias: string; score: number }> } | null {
  const normalizedAliases = exactUniqueStrings(aliases)
  if (!normalizedAliases || !isPlainRecord(values)
      || !sameKeys(Object.keys(values), normalizedAliases)) return null
  const scores = normalizedAliases.map((alias) => ({ alias, score: parseAsciiInteger(values[alias], 30) }))
  return scores.every(({ score }) => score !== null)
    ? { scores: scores as Array<{ alias: string; score: number }> }
    : null
}

export function buildDay3OneBallPayload(
  teams: readonly ContinuationDay3Team[],
  values: Readonly<Partial<Record<ContinuationDay3Team, string>>>,
): { team_scores: Array<{ team: ContinuationDay3Team; score: number }> } | null {
  if (!Array.isArray(teams) || teams.length === 0 || !isPlainRecord(values)) return null
  const normalizedTeams: ContinuationDay3Team[] = []
  for (const team of teams) {
    if (!isDay3Team(team) || normalizedTeams.includes(team)) return null
    normalizedTeams.push(team)
  }
  if (!sameKeys(Object.keys(values), normalizedTeams)) return null
  const teamScores = normalizedTeams.map((team) => ({ team, score: parseAsciiInteger(values[team], 10) }))
  return teamScores.every(({ score }) => score !== null)
    ? { team_scores: teamScores as Array<{ team: ContinuationDay3Team; score: number }> }
    : null
}

function nullableDay1Game(value: unknown): ContinuationDay1Game | null | undefined {
  return value === null ? null : isDay1Game(value) ? value : undefined
}

function isDay1Game(value: unknown): value is ContinuationDay1Game {
  return value === 'dalmuti' || value === 'halligalli' || value === 'one-card'
}

function isDay3Team(value: unknown): value is ContinuationDay3Team {
  return value === 'A' || value === 'B' || value === 'C'
}

function isDay3Phase(value: unknown): value is ContinuationDay3TiebreakRuntime['phase'] {
  return value === 'none' || value === 'needs_last_frame' || value === 'needs_one_ball' || value === 'resolved'
}

function exactUniqueStrings(values: readonly string[]) {
  if (!Array.isArray(values) || values.length === 0) return null
  const normalized: string[] = []
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim() || normalized.includes(value)) return null
    normalized.push(value)
  }
  return normalized
}

function parseAsciiInteger(value: unknown, maximum: number) {
  if (typeof value !== 'string' || !/^\s*[0-9]+\s*$/.test(value)) return null
  const parsed = Number(value.trim())
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null
}

function sameKeys(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length && actual.every((key) => expected.includes(key))
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  return sameKeys(Object.keys(value), expected)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
