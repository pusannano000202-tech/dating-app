export type DepartmentChallengeTeam = {
  id: string
  side: 'challenger' | 'opponent'
  department_label: string
  accepted_count: number
  capacity: number
  is_captain: boolean
  may_request_roster: boolean
  roster: Array<{
    id: string
    alias: string
    status: 'requested' | 'accepted' | 'declined' | 'left'
    is_me: boolean
  }>
}

export type DepartmentChallenge = {
  id: string
  category: 'soccer' | 'gaming'
  title: string
  rules: string
  status: 'recruiting' | 'opponent_pending' | 'scheduled' | 'result_pending' | 'completed' | 'cancelled'
  revision: number
  team_capacity: number
  scheduled_at: string | null
  ends_at: string | null
  place_name: string | null
  can_accept_opponent: boolean
  is_captain: boolean
  teams: DepartmentChallengeTeam[]
  result: { first_score: number; second_score: number } | null
  fair_league?: boolean
  paired_challenge_id?: string | null
}

export type DepartmentRosterSlot = Readonly<{
  key: string
  kind: 'known' | 'hidden' | 'empty'
  label: string
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CHALLENGE_STATUSES = new Set(['recruiting', 'opponent_pending', 'scheduled', 'result_pending', 'completed', 'cancelled'])
const ROSTER_STATUSES = new Set(['requested', 'accepted', 'declined', 'left'])

export function parseDepartmentChallenges(value: unknown): DepartmentChallenge[] | null {
  if (!Array.isArray(value) || value.length > 50) return null
  const challenges: DepartmentChallenge[] = []
  for (const row of value) {
    if (!record(row)
        || !validUuid(row.id)
        || !['soccer', 'gaming'].includes(String(row.category))
        || !validTrimmedLength(row.title, 4, 80)
        || typeof row.rules !== 'string' || row.rules.length > 2000
        || !CHALLENGE_STATUSES.has(String(row.status))
        || !integerInRange(row.revision, 0, Number.MAX_SAFE_INTEGER)
        || !integerInRange(row.team_capacity, 2, 20)
        || typeof row.can_accept_opponent !== 'boolean'
        || typeof row.is_captain !== 'boolean'
        || !Array.isArray(row.teams) || row.teams.length > 2) return null

    const schedule = parseSchedule(row.scheduled_at, row.ends_at, row.place_name)
    if (!schedule) return null
    if (['scheduled', 'result_pending', 'completed'].includes(String(row.status)) && schedule.scheduled_at === null) return null

    const teams: DepartmentChallengeTeam[] = []
    for (const team of row.teams) {
      const parsedTeam = parseTeam(team, row.team_capacity as number)
      if (!parsedTeam) return null
      teams.push(parsedTeam)
    }
    if (new Set(teams.map((team) => team.id)).size !== teams.length
        || new Set(teams.map((team) => team.side)).size !== teams.length) return null

    const result = parseResult(row.result)
    if (result === undefined || (row.status === 'completed') !== (result !== null)) return null
    challenges.push({
      id: row.id as string,
      category: row.category as DepartmentChallenge['category'],
      title: row.title as string,
      rules: row.rules,
      status: row.status as DepartmentChallenge['status'],
      revision: row.revision as number,
      team_capacity: row.team_capacity as number,
      ...schedule,
      can_accept_opponent: row.can_accept_opponent,
      is_captain: row.is_captain,
      teams,
      result,
      fair_league: row.fair_league === true,
      paired_challenge_id: validUuid(row.paired_challenge_id) ? row.paired_challenge_id : null,
    })
  }
  return challenges
}

export function buildDepartmentRosterSlots({
  capacity,
  acceptedCount,
  acceptedMembers,
}: {
  capacity: number
  acceptedCount: number
  acceptedMembers: ReadonlyArray<Readonly<{ id: string; alias: string }>>
}): DepartmentRosterSlot[] {
  const boundedCapacity = Math.max(0, Math.min(20, Math.trunc(capacity)))
  const boundedAcceptedCount = Math.max(0, Math.min(boundedCapacity, Math.trunc(acceptedCount)))
  const knownMembers = acceptedMembers.slice(0, boundedAcceptedCount)
  const slots: DepartmentRosterSlot[] = knownMembers.map((member) => ({
    key: `member:${member.id}`,
    kind: 'known',
    label: member.alias,
  }))

  for (let index = knownMembers.length; index < boundedAcceptedCount; index += 1) {
    slots.push({ key: `hidden:${index}`, kind: 'hidden', label: '참여 중' })
  }
  for (let index = boundedAcceptedCount; index < boundedCapacity; index += 1) {
    slots.push({ key: `empty:${index}`, kind: 'empty', label: '빈 자리' })
  }
  return slots
}

export function resolveCreatedChallengeRefresh(
  createdChallengeId: string | null,
  challenges: ReadonlyArray<Readonly<{ id: string }>> | null,
): 'ready' | 'needs_reload' {
  return validUuid(createdChallengeId) && challenges?.some((challenge) => challenge.id === createdChallengeId)
    ? 'ready'
    : 'needs_reload'
}

function parseTeam(value: unknown, challengeCapacity: number): DepartmentChallengeTeam | null {
  if (!record(value)
      || !validUuid(value.id)
      || !['challenger', 'opponent'].includes(String(value.side))
      || !validTrimmedLength(value.department_label, 1, 120)
      || value.capacity !== challengeCapacity
      || !integerInRange(value.accepted_count, 0, challengeCapacity)
      || typeof value.is_captain !== 'boolean'
      || typeof value.may_request_roster !== 'boolean'
      || !Array.isArray(value.roster)) return null

  const roster: DepartmentChallengeTeam['roster'] = []
  for (const entry of value.roster) {
    if (!record(entry)
        || !validUuid(entry.id)
        || !validTrimmedLength(entry.alias, 1, 120)
        || !ROSTER_STATUSES.has(String(entry.status))
        || typeof entry.is_me !== 'boolean') return null
    roster.push({
      id: entry.id,
      alias: entry.alias as string,
      status: entry.status as DepartmentChallengeTeam['roster'][number]['status'],
      is_me: entry.is_me,
    })
  }
  if (new Set(roster.map((entry) => entry.id)).size !== roster.length
      || roster.filter((entry) => entry.status === 'accepted').length > (value.accepted_count as number)) return null
  return {
    id: value.id,
    side: value.side as DepartmentChallengeTeam['side'],
    department_label: value.department_label as string,
    accepted_count: value.accepted_count as number,
    capacity: value.capacity as number,
    is_captain: value.is_captain,
    may_request_roster: value.may_request_roster,
    roster,
  }
}

function parseSchedule(
  scheduledAt: unknown,
  endsAt: unknown,
  placeName: unknown,
): Pick<DepartmentChallenge, 'scheduled_at' | 'ends_at' | 'place_name'> | null {
  if (scheduledAt === null && endsAt === null && placeName === null) {
    return { scheduled_at: null, ends_at: null, place_name: null }
  }
  if (!validTimestamp(scheduledAt) || !validTimestamp(endsAt)
      || Date.parse(endsAt) <= Date.parse(scheduledAt)
      || !validTrimmedLength(placeName, 2, 80)) return null
  return { scheduled_at: scheduledAt, ends_at: endsAt, place_name: placeName }
}

function parseResult(value: unknown): DepartmentChallenge['result'] | undefined {
  if (value === null) return null
  if (!record(value)
      || !integerInRange(value.first_score, 0, 999)
      || !integerInRange(value.second_score, 0, 999)) return undefined
  return { first_score: value.first_score as number, second_score: value.second_score as number }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
}

function validTrimmedLength(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}
