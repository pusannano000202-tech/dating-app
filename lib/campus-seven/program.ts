export type CampusSevenMeetingMode = 'campus_then_venue' | 'direct_to_venue'

export interface CampusSevenDay {
  dayNumber: number
  title: string
  summary: string
  budgetWon: number
  meetingMode: CampusSevenMeetingMode
  startsAt: '19:00'
  endsAt: '22:00' | '23:00'
}

export const CAMPUS_SEVEN_TOTAL_BUDGET_WON = 100_000
export const CAMPUS_SEVEN_RESERVATION_PENALTY_WON = 10_000

export const CAMPUS_SEVEN_GAMES = [
  '윷놀이',
  '할리갈리',
  '우노',
  '다빈치 코드',
  '루미큐브',
] as const

export const CAMPUS_SEVEN_PREFERENCE_QUESTIONS = [
  { id: 'conversation', label: '호감이 가는 대화 태도' },
  { id: 'date_activity', label: '함께하고 싶은 데이트 활동' },
  { id: 'contact_frequency', label: '편안한 연락 빈도' },
  { id: 'relationship_pace', label: '원하는 관계의 속도' },
  { id: 'affection', label: '좋아하는 애정 표현 방식' },
  { id: 'conflict', label: '갈등이 생겼을 때 푸는 방식' },
  { id: 'partner_value', label: '상대에게 중요하게 보는 가치' },
  { id: 'when_interested', label: '호감이 생겼을 때 나의 모습' },
] as const

export const CAMPUS_SEVEN_DAYS: readonly CampusSevenDay[] = [
  {
    dayNumber: 1,
    title: '첫 만남',
    summary: '3대3 식사와 첫 비공개 관심 선택',
    budgetWon: 12_000,
    meetingMode: 'campus_then_venue',
    startsAt: '19:00',
    endsAt: '22:00',
  },
  {
    dayNumber: 2,
    title: '새로운 두 사람',
    summary: '신규 참가자 공개와 두 개의 2대2 식사',
    budgetWon: 12_000,
    meetingMode: 'direct_to_venue',
    startsAt: '19:00',
    endsAt: '22:00',
  },
  {
    dayNumber: 3,
    title: '여덟 명의 식사',
    summary: '자리 순환과 두 번째 비공개 관심 선택',
    budgetWon: 18_000,
    meetingMode: 'campus_then_venue',
    startsAt: '19:00',
    endsAt: '22:00',
  },
  {
    dayNumber: 4,
    title: '보드게임 팀전',
    summary: '네 개의 혼성 팀이 다섯 게임으로 경쟁',
    budgetWon: 10_000,
    meetingMode: 'campus_then_venue',
    startsAt: '19:00',
    endsAt: '22:00',
  },
  {
    dayNumber: 5,
    title: '서로를 더 알기',
    summary: '우승팀 미션 데이트와 3대3 취향추리 카페',
    budgetWon: 10_000,
    meetingMode: 'direct_to_venue',
    startsAt: '19:00',
    endsAt: '22:00',
  },
  {
    dayNumber: 6,
    title: '특별 데이트',
    summary: '최다 득표 참가자의 상호 동의 특별 데이트',
    budgetWon: 15_000,
    meetingMode: 'direct_to_venue',
    startsAt: '19:00',
    endsAt: '22:00',
  },
  {
    dayNumber: 7,
    title: '마지막 저녁',
    summary: '자리 순환, 비공개 제안과 최종 선택',
    budgetWon: 20_000,
    meetingMode: 'campus_then_venue',
    startsAt: '19:00',
    endsAt: '23:00',
  },
]

export interface CampusSevenFeatureInput {
  nodeEnv?: string
  enabled?: string
  applicationsOpen?: string
  cardPaymentsEnabled?: string
}

export interface CampusSevenFeatureState {
  visible: boolean
  applicationsOpen: boolean
  cardPaymentsEnabled: boolean
}

export function getCampusSevenFeatureState(
  input: CampusSevenFeatureInput = {},
): CampusSevenFeatureState {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV
  const enabled = input.enabled ?? process.env.NEXT_PUBLIC_CAMPUS_SEVEN_ENABLED
  const applicationsOpen = input.applicationsOpen ?? process.env.CAMPUS_SEVEN_APPLICATIONS_OPEN
  const cardPaymentsEnabled = input.cardPaymentsEnabled ?? process.env.CAMPUS_SEVEN_CARD_PAYMENTS_ENABLED
  const visible = nodeEnv === 'development' || enabled === 'true'

  return {
    visible,
    applicationsOpen: visible && applicationsOpen === 'true',
    cardPaymentsEnabled: visible && cardPaymentsEnabled === 'true',
  }
}

export interface ParticipantDisclosure {
  alias: true
  verifiedName: boolean
  exactAge: boolean
  department: boolean
  phone: boolean
}

export function getParticipantDisclosure(input: {
  dayNumber: number
  isFinalPair: boolean
}): ParticipantDisclosure {
  const identityVisible = input.dayNumber >= 5
  const finalContactVisible = input.dayNumber >= 7 && input.isFinalPair

  return {
    alias: true,
    verifiedName: identityVisible,
    exactAge: identityVisible,
    department: finalContactVisible,
    phone: finalContactVisible,
  }
}

export interface DayTwoTeamInput {
  existingMen: readonly string[]
  existingWomen: readonly string[]
  newcomerMan: string
  newcomerWoman: string
  newcomerManChoices: readonly string[]
  newcomerWomanChoices: readonly string[]
}

export interface DayTwoTeams {
  teamA: [string, string, string, string]
  teamB: [string, string, string, string]
}

export function buildDayTwoTeams(input: DayTwoTeamInput): DayTwoTeams {
  assertUniqueMembers(input.existingMen, 3, 'existing_men_invalid')
  assertUniqueMembers(input.existingWomen, 3, 'existing_women_invalid')
  assertChoices(input.newcomerManChoices, input.existingWomen, 'newcomer_man_choices_invalid')
  assertChoices(input.newcomerWomanChoices, input.existingMen, 'newcomer_woman_choices_invalid')

  const unselectedMan = input.existingMen.find(
    (userId) => !input.newcomerWomanChoices.includes(userId),
  )
  const unselectedWoman = input.existingWomen.find(
    (userId) => !input.newcomerManChoices.includes(userId),
  )

  if (!unselectedMan || !unselectedWoman) {
    throw new Error('day_two_balance_failed')
  }

  const teamA = [
    input.newcomerMan,
    input.newcomerManChoices[0],
    input.newcomerManChoices[1],
    unselectedMan,
  ] as DayTwoTeams['teamA']
  const teamB = [
    input.newcomerWoman,
    input.newcomerWomanChoices[0],
    input.newcomerWomanChoices[1],
    unselectedWoman,
  ] as DayTwoTeams['teamB']

  assertUniqueMembers([...teamA, ...teamB], 8, 'day_two_duplicate_member')
  return { teamA, teamB }
}

function assertUniqueMembers(
  values: readonly string[],
  expectedLength: number,
  errorCode: string,
): void {
  if (
    values.length !== expectedLength
    || values.some((value) => !value)
    || new Set(values).size !== expectedLength
  ) {
    throw new Error(errorCode)
  }
}

function assertChoices(
  choices: readonly string[],
  allowed: readonly string[],
  errorCode: string,
): void {
  assertUniqueMembers(choices, 2, errorCode)
  if (choices.some((choice) => !allowed.includes(choice))) {
    throw new Error(errorCode)
  }
}

export interface DayFourGameResult {
  game: typeof CAMPUS_SEVEN_GAMES[number]
  orderedTeamIds: readonly string[]
}

export interface DayFourStanding {
  teamId: string
  points: number
  firstPlaceCount: number
}

export function getDayFourStandings(input: {
  results: readonly DayFourGameResult[]
  halliGalliTieBreakOrder: readonly string[]
}): DayFourStanding[] {
  if (input.results.length !== CAMPUS_SEVEN_GAMES.length) {
    throw new Error('day_four_results_incomplete')
  }

  const expectedGames = new Set(CAMPUS_SEVEN_GAMES)
  const seenGames = new Set(input.results.map((result) => result.game))
  if (seenGames.size !== expectedGames.size || [...expectedGames].some((game) => !seenGames.has(game))) {
    throw new Error('day_four_games_invalid')
  }

  const firstTeams = input.results[0]?.orderedTeamIds ?? []
  assertUniqueMembers(firstTeams, 4, 'day_four_teams_invalid')
  const teamSet = new Set(firstTeams)
  const standings = new Map<string, DayFourStanding>(
    firstTeams.map((teamId) => [teamId, { teamId, points: 0, firstPlaceCount: 0 }]),
  )

  for (const result of input.results) {
    assertUniqueMembers(result.orderedTeamIds, 4, 'day_four_teams_invalid')
    if (result.orderedTeamIds.some((teamId) => !teamSet.has(teamId))) {
      throw new Error('day_four_team_set_changed')
    }
    result.orderedTeamIds.forEach((teamId, index) => {
      const standing = standings.get(teamId)
      if (!standing) throw new Error('day_four_team_missing')
      standing.points += 4 - index
      if (index === 0) standing.firstPlaceCount += 1
    })
  }

  assertUniqueMembers(input.halliGalliTieBreakOrder, 4, 'halli_galli_tiebreak_invalid')
  if (input.halliGalliTieBreakOrder.some((teamId) => !teamSet.has(teamId))) {
    throw new Error('halli_galli_team_set_changed')
  }
  const tieBreakIndex = new Map(
    input.halliGalliTieBreakOrder.map((teamId, index) => [teamId, index]),
  )

  return [...standings.values()].sort((a, b) => (
    b.points - a.points
    || b.firstPlaceCount - a.firstPlaceCount
    || (tieBreakIndex.get(a.teamId) ?? 99) - (tieBreakIndex.get(b.teamId) ?? 99)
  ))
}

export interface FinalProposal {
  proposerId: string
  targetId: string
}

export interface FinalResponse {
  targetId: string
  acceptedProposerId: string | null
}

export function resolveFinalPairs(input: {
  proposals: readonly FinalProposal[]
  responses: readonly FinalResponse[]
}): FinalProposal[] {
  assertUniqueMembers(
    input.proposals.map((proposal) => proposal.proposerId),
    input.proposals.length,
    'duplicate_final_proposer',
  )
  assertUniqueMembers(
    input.responses.map((response) => response.targetId),
    input.responses.length,
    'duplicate_final_target',
  )

  return input.responses.flatMap((response) => {
    if (!response.acceptedProposerId) return []
    const proposal = input.proposals.find((candidate) => (
      candidate.proposerId === response.acceptedProposerId
      && candidate.targetId === response.targetId
    ))
    return proposal ? [proposal] : []
  })
}

const PROHIBITED_CONTACT_PATTERNS = [
  /(?:^|\D)01[016789][\s.-]*\d{3,4}[\s.-]*\d{4}(?:\D|$)/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(^|\s)@[A-Z0-9._-]{2,}/i,
  /카\s*톡|카카오\s*톡|오픈\s*채팅|인스?타(?:그램)?|텔레그램|라인\s*아이디|디엠|DM\s*(?:줘|주세요|해)/i,
]

export function containsProhibitedContact(value: string): boolean {
  const normalized = value.normalize('NFKC')
  return PROHIBITED_CONTACT_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function getReservationPenaltyCandidate(input: {
  deadlinePassed: boolean
  remindersSent: number
  attempted: boolean
  substituteRequested: boolean
  venueUnavailableReported: boolean
}): boolean {
  return input.deadlinePassed
    && input.remindersSent >= 2
    && !input.attempted
    && !input.substituteRequested
    && !input.venueUnavailableReported
}

export function isAdultOnDate(dateOfBirth: string, referenceDate: string): boolean {
  const birth = parseIsoDate(dateOfBirth)
  const reference = parseIsoDate(referenceDate)
  if (!birth || !reference) return false

  const nineteenthBirthday = birth.year * 10_000 + 19 * 10_000 + birth.month * 100 + birth.day
  const referenceValue = reference.year * 10_000 + reference.month * 100 + reference.day
  return referenceValue >= nineteenthBirthday
}

function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null
  return { year, month, day }
}
