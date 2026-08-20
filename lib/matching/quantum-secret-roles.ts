export const SECRET_ROLE_KEYS = [
  'explorer',
  'reactor',
  'observer',
  'bridge',
  'pace_maker',
] as const

export type QuantumSecretRoleKey = (typeof SECRET_ROLE_KEYS)[number]

export type QuantumSecretRoleActivity =
  | 'run'
  | 'board-game'
  | 'drinks'
  | 'dinner'
  | 'walk'

export type QuantumSecretRoleDefinition = {
  key: QuantumSecretRoleKey
  label: string
  safetyCopy: string
  genericMission: string
  activityMissions: Record<QuantumSecretRoleActivity, string>
}

export type QuantumMySecretRole = {
  role: QuantumSecretRoleKey
  occurrenceId: string
  label: string
  safetyCopy: string
  mission: string
  eventKey: string | null
  canChange: boolean
  roleConfirmed: boolean
  applicationConfirmed: boolean
  startsAt: string | null
}

export type QuantumRoleGuessTarget = {
  seatLabel: string
  guessedRole: QuantumSecretRoleKey | null
  answerRole?: QuantumSecretRoleKey
  correct?: boolean
}

export type QuantumRoleGuessState = {
  status: 'open' | 'submitted' | 'revealed'
  revealAt: string
  submitted: boolean
  revealAvailable: boolean
  targets: QuantumRoleGuessTarget[]
}

export const QUANTUM_SECRET_ROLE_SAFETY_COPY =
  '사생활·연락처·외모를 묻거나 평가하지 않고, 답변과 행동을 강요하지 않아요.'

export const QUANTUM_SECRET_ROLE_DEFINITIONS: Record<
  QuantumSecretRoleKey,
  QuantumSecretRoleDefinition
> = {
  explorer: {
    key: 'explorer',
    label: '탐구자',
    safetyCopy: QUANTUM_SECRET_ROLE_SAFETY_COPY,
    genericMission: '취향과 경험을 묻는 열린 질문을 두 번 건네요.',
    activityMissions: {
      run: '함께 달리기 편한 속도나 운동 경험을 묻는 열린 질문을 두 번 건네요.',
      'board-game': '선호하는 게임 장르나 재미있었던 경험을 묻는 열린 질문을 두 번 건네요.',
      drinks: '좋아하는 대화 주제나 편한 자리 분위기를 묻는 열린 질문을 두 번 건네요.',
      dinner: '좋아하는 메뉴나 기억에 남는 식사 경험을 묻는 열린 질문을 두 번 건네요.',
      walk: '좋아하는 산책 코스나 요즘 관심사를 묻는 열린 질문을 두 번 건네요.',
    },
  },
  reactor: {
    key: 'reactor',
    label: '리액터',
    safetyCopy: QUANTUM_SECRET_ROLE_SAFETY_COPY,
    genericMission: '상대의 말에 진정성 있는 호응을 보내요.',
    activityMissions: {
      run: '속도와 호흡을 배려한 말에 고마움을 표하고, 운동 이야기에 진정성 있게 호응해요.',
      'board-game': '좋은 플레이와 재미있는 설명에 진정성 있게 호응해요.',
      drinks: '과음을 부추기지 않고 상대의 이야기에 편안한 호응을 보내요.',
      dinner: '메뉴 선택과 식사 이야기에 진정성 있는 호응을 보내요.',
      walk: '산책 중 들은 이야기에 고개를 맞추고 진정성 있게 호응해요.',
    },
  },
  observer: {
    key: 'observer',
    label: '세심한 관찰자',
    safetyCopy: QUANTUM_SECRET_ROLE_SAFETY_COPY,
    genericMission: '행동·배려·취향 중 하나를 구체적으로 한 번 칭찬해요.',
    activityMissions: {
      run: '속도를 맞추거나 코스를 살핀 배려를 구체적으로 한 번 칭찬해요.',
      'board-game': '규칙 설명·팀 배려·기발한 플레이 중 하나를 구체적으로 칭찬해요.',
      drinks: '물을 챙기거나 대화 속도를 맞춘 배려를 구체적으로 칭찬해요.',
      dinner: '메뉴 선택이나 자리의 불편을 살핀 배려를 구체적으로 칭찬해요.',
      walk: '길을 살피거나 걷는 속도를 맞춘 배려를 구체적으로 칭찬해요.',
    },
  },
  bridge: {
    key: 'bridge',
    label: '대화의 다리',
    safetyCopy: QUANTUM_SECRET_ROLE_SAFETY_COPY,
    genericMission: '조용한 참가자가 원할 때 자연스럽게 대화에 연결해요.',
    activityMissions: {
      run: '속도가 다른 참가자가 원할 때 자연스럽게 대화에 연결해요.',
      'board-game': '발언이 적은 참가자가 원할 때 게임 선택이나 팀 대화에 연결해요.',
      drinks: '조용한 참가자가 원할 때 답변을 강요하지 않고 대화 주제에 연결해요.',
      dinner: '메뉴나 취향 이야기로 조용한 참가자가 원할 때 대화에 연결해요.',
      walk: '주변 풍경이나 코스 이야기로 조용한 참가자가 원할 때 대화에 연결해요.',
    },
  },
  pace_maker: {
    key: 'pace_maker',
    label: '페이스 메이커',
    safetyCopy: QUANTUM_SECRET_ROLE_SAFETY_COPY,
    genericMission: '활동의 다음 단계나 쉬는 시점을 선택지로 제안해요.',
    activityMissions: {
      run: '모두의 호흡을 살펴 속도를 유지할지 쉬어 갈지 선택지로 제안해요.',
      'board-game': '한 판을 더 할지 다른 게임으로 바꿀지 선택지로 제안해요.',
      drinks: '과음 없이 물을 챙기거나 자리를 마무리할 시점을 선택지로 제안해요.',
      dinner: '추가 메뉴를 고를지 식사를 마무리할지 선택지로 제안해요.',
      walk: '계속 걸을지 잠시 쉬어 갈지 선택지로 제안해요.',
    },
  },
}

const EVENT_ACTIVITIES: Record<string, QuantumSecretRoleActivity> = {
  'tonight-onsenjjang-run': 'run',
  'tonight-board-game': 'board-game',
  'tonight-casual-drinks': 'drinks',
  'tonight-late-dinner': 'dinner',
  'scheduled-board-game': 'board-game',
  'scheduled-jogging': 'run',
  'scheduled-dinner': 'dinner',
  'scheduled-walk': 'walk',
}

const ACTIVITIES = new Set<QuantumSecretRoleActivity>([
  'run',
  'board-game',
  'drinks',
  'dinner',
  'walk',
])
const EVENT_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_MISSION_LENGTH = 240
const MAX_SEAT_LABEL_LENGTH = 24
const MAX_TIMESTAMP_LENGTH = 64
const STRICT_UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/

export function getQuantumSecretRoleMission(
  role: unknown,
  eventKey: unknown,
): string | null {
  if (!isSecretRoleKey(role)) return null

  const activity = resolveActivity(eventKey)
  return activity
    ? QUANTUM_SECRET_ROLE_DEFINITIONS[role].activityMissions[activity]
    : QUANTUM_SECRET_ROLE_DEFINITIONS[role].genericMission
}

export function parseMySecretRole(value: unknown): QuantumMySecretRole | null {
  if (!isRecord(value) || !isSecretRoleKey(value.role)) return null

  const occurrenceIdValue = value.occurrence_id ?? value.occurrenceId
  const eventKeyValue = value.event_key ?? value.eventKey
  const canChangeValue = value.can_change ?? value.canChange
  const roleConfirmedValue = value.role_confirmed ?? value.roleConfirmed
  const applicationConfirmedValue = value.application_confirmed ?? value.applicationConfirmed
  const startsAtValue = value.starts_at ?? value.startsAt
  if (typeof occurrenceIdValue !== 'string' || !UUID_PATTERN.test(occurrenceIdValue)) return null
  if (eventKeyValue !== undefined && !isEventKey(eventKeyValue)) return null
  if (canChangeValue !== undefined && typeof canChangeValue !== 'boolean') return null
  if (typeof roleConfirmedValue !== 'boolean'
    || typeof applicationConfirmedValue !== 'boolean'
    || roleConfirmedValue !== applicationConfirmedValue) return null
  if (startsAtValue !== undefined && startsAtValue !== null && !isTimestamp(startsAtValue)) return null

  const suppliedMission = parseShortText(value.mission, MAX_MISSION_LENGTH)
  const eventKey = typeof eventKeyValue === 'string' ? eventKeyValue : null
  const definition = QUANTUM_SECRET_ROLE_DEFINITIONS[value.role]

  return {
    role: value.role,
    occurrenceId: occurrenceIdValue,
    label: definition.label,
    safetyCopy: definition.safetyCopy,
    mission: eventKey
      ? getQuantumSecretRoleMission(value.role, eventKey) ?? definition.genericMission
      : suppliedMission ?? definition.genericMission,
    eventKey,
    canChange: canChangeValue === true,
    roleConfirmed: roleConfirmedValue,
    applicationConfirmed: applicationConfirmedValue,
    startsAt: typeof startsAtValue === 'string' ? startsAtValue : null,
  }
}

export function parseQuantumRoleGuessState(value: unknown): QuantumRoleGuessState | null {
  if (!isRecord(value) || !isGuessStatus(value.status)) return null
  if (!isTimestamp(value.reveal_at)
    || typeof value.submitted !== 'boolean'
    || typeof value.reveal_available !== 'boolean'
    || !Array.isArray(value.targets)
    || value.targets.length < 1
    || value.targets.length > 4) {
    return null
  }
  if ((value.status === 'revealed') !== value.reveal_available) return null
  if (value.status === 'submitted' && !value.submitted) return null

  const targets: QuantumRoleGuessTarget[] = []
  const seatLabels = new Set<string>()
  for (const target of value.targets) {
    if (!isRecord(target)) return null
    const seatLabel = parseShortText(target.seat_label, MAX_SEAT_LABEL_LENGTH)
    const guessedRole = target.guessed_role === null
      ? null
      : isSecretRoleKey(target.guessed_role) ? target.guessed_role : undefined
    if (!seatLabel || guessedRole === undefined || seatLabels.has(seatLabel)) return null
    seatLabels.add(seatLabel)

    if (value.status !== 'revealed') {
      if ('answer_role' in target || 'correct' in target) return null
      targets.push({ seatLabel, guessedRole })
      continue
    }

    if (!isSecretRoleKey(target.answer_role) || typeof target.correct !== 'boolean') return null
    targets.push({
      seatLabel,
      guessedRole,
      answerRole: target.answer_role,
      correct: target.correct,
    })
  }

  return {
    status: value.status,
    revealAt: value.reveal_at,
    submitted: value.submitted,
    revealAvailable: value.reveal_available,
    targets,
  }
}

function resolveActivity(value: unknown): QuantumSecretRoleActivity | null {
  if (typeof value !== 'string') return null
  if (ACTIVITIES.has(value as QuantumSecretRoleActivity)) {
    return value as QuantumSecretRoleActivity
  }
  return EVENT_ACTIVITIES[value] ?? null
}

function isSecretRoleKey(value: unknown): value is QuantumSecretRoleKey {
  return typeof value === 'string'
    && (SECRET_ROLE_KEYS as readonly string[]).includes(value)
}

function isGuessStatus(value: unknown): value is QuantumRoleGuessState['status'] {
  return value === 'open' || value === 'submitted' || value === 'revealed'
}

function isEventKey(value: unknown): value is string {
  return typeof value === 'string' && EVENT_KEY_PATTERN.test(value)
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string'
    || value.length > MAX_TIMESTAMP_LENGTH
    || !STRICT_UTC_TIMESTAMP_PATTERN.test(value)) {
    return false
  }
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return false

  return timestamp.toISOString().slice(0, 19) === value.slice(0, 19)
}

function parseShortText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.length > 0 && normalized.length <= maximumLength ? normalized : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
