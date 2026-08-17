export const QUANTUM_PRECARD_VERSION = 'quantum-precard-b-v1'

export const QUANTUM_PRECARD_INTEREST_OPTIONS = [
  '보드게임',
  '러닝',
  '산책',
  '맛집',
  '카페',
  '영화',
  '음악',
  '게임',
  '운동',
  '여행',
  '전시',
  '독서',
] as const

export const QUANTUM_PRECARD_MBTI_OPTIONS = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
  'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP',
  'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
] as const

export const QUANTUM_PRECARD_CONVERSATION_OPTIONS = [
  { value: 'listener', label: '잘 들어요' },
  { value: 'balanced', label: '균형형' },
  { value: 'talker', label: '먼저 말해요' },
] as const

export const QUANTUM_PRECARD_PLAN_OPTIONS = [
  { value: 'planned', label: '계획형' },
  { value: 'balanced', label: '균형형' },
  { value: 'spontaneous', label: '즉흥형' },
] as const

export const QUANTUM_PRECARD_ROLE_OPTIONS = [
  { value: 'question_starter', label: '질문 시작' },
  { value: 'mood_connector', label: '분위기 연결' },
  { value: 'good_listener', label: '이야기 경청' },
  { value: 'activity_lead', label: '활동 진행' },
] as const

export type QuantumPrecardConversationEnergy = typeof QUANTUM_PRECARD_CONVERSATION_OPTIONS[number]['value']
export type QuantumPrecardPlanStyle = typeof QUANTUM_PRECARD_PLAN_OPTIONS[number]['value']
export type QuantumPrecardRole = typeof QUANTUM_PRECARD_ROLE_OPTIONS[number]['value']
export type QuantumPrecardBalanceChoice = 'A' | 'B' | ''

export type QuantumPrecardDraft = {
  intro: string
  mbti: string
  conversationEnergy: QuantumPrecardConversationEnergy | ''
  planStyle: QuantumPrecardPlanStyle | ''
  interests: string[]
  music: string
  mintChocolate: QuantumPrecardBalanceChoice
  naengmyeon: QuantumPrecardBalanceChoice
  meetupRole: QuantumPrecardRole | ''
}

export type QuantumPrecardValidation =
  | { ok: true }
  | { ok: false; error: 'card_incomplete' | 'card_too_long' | 'unsafe_public_content' }

const SECTION_LABELS = {
  intro: '나를 보여주는 한 문장',
  mbti: 'MBTI',
  conversationEnergy: '대화 에너지',
  planStyle: '약속 스타일',
  interests: '관심사',
  music: '요즘 가장 자주 듣는 음악',
  balances: '밸런스 취향',
  meetupRole: '오늘의 역할',
} as const

const MIN_INTRO_LENGTH = 10
const MAX_INTRO_LENGTH = 80
const MIN_MUSIC_LENGTH = 2
const MAX_MUSIC_LENGTH = 60
const MIN_INTERESTS = 3
const MAX_INTERESTS = 5
export const QUANTUM_PRECARD_MAX_SUBMISSION_LENGTH = 900

const conversationValues = new Set<string>(QUANTUM_PRECARD_CONVERSATION_OPTIONS.map((option) => option.value))
const planValues = new Set<string>(QUANTUM_PRECARD_PLAN_OPTIONS.map((option) => option.value))
const roleValues = new Set<string>(QUANTUM_PRECARD_ROLE_OPTIONS.map((option) => option.value))
const mbtiValues = new Set<string>(QUANTUM_PRECARD_MBTI_OPTIONS)

export function createEmptyQuantumPrecardDraft(): QuantumPrecardDraft {
  return {
    intro: '',
    mbti: '',
    conversationEnergy: '',
    planStyle: '',
    interests: [],
    music: '',
    mintChocolate: '',
    naengmyeon: '',
    meetupRole: '',
  }
}

export function countCompletedQuantumPrecardSections(draft: QuantumPrecardDraft): number {
  return [
    isShortStoryValid(draft.intro, MIN_INTRO_LENGTH, MAX_INTRO_LENGTH),
    conversationValues.has(draft.conversationEnergy),
    planValues.has(draft.planStyle),
    hasValidInterests(draft.interests),
    isShortStoryValid(draft.music, MIN_MUSIC_LENGTH, MAX_MUSIC_LENGTH),
    isBalanceChoice(draft.mintChocolate) && isBalanceChoice(draft.naengmyeon),
    roleValues.has(draft.meetupRole),
  ].filter(Boolean).length
}

export function isQuantumPrecardComplete(draft: QuantumPrecardDraft): boolean {
  return countCompletedQuantumPrecardSections(draft) === 7
}

export function validateQuantumPrecardDraft(draft: QuantumPrecardDraft): QuantumPrecardValidation {
  if (!isQuantumPrecardComplete(draft)) return { ok: false, error: 'card_incomplete' }

  const publicText = [draft.intro, draft.music, ...draft.interests].join(' ')
  if (containsUnsafePublicContact(publicText)) return { ok: false, error: 'unsafe_public_content' }

  const submission = buildQuantumPrecardSubmissionText(draft)
  if (submission.length > QUANTUM_PRECARD_MAX_SUBMISSION_LENGTH) {
    return { ok: false, error: 'card_too_long' }
  }
  return { ok: true }
}

export function buildQuantumPrecardSubmissionText(draft: QuantumPrecardDraft): string {
  const mbti = mbtiValues.has(draft.mbti) ? draft.mbti : '선택 안 함'
  return [
    QUANTUM_PRECARD_VERSION,
    section(SECTION_LABELS.intro, cleanLine(draft.intro)),
    section(SECTION_LABELS.mbti, mbti),
    section(SECTION_LABELS.conversationEnergy, draft.conversationEnergy),
    section(SECTION_LABELS.planStyle, draft.planStyle),
    section(SECTION_LABELS.interests, normalizeInterests(draft.interests).join(' · ')),
    section(SECTION_LABELS.music, cleanLine(draft.music)),
    section(SECTION_LABELS.balances, `mint=${draft.mintChocolate};naengmyeon=${draft.naengmyeon}`),
    section(SECTION_LABELS.meetupRole, draft.meetupRole),
  ].join('\n\n')
}

export function createQuantumPrecardDraftFromSubmissionText(value: string): QuantumPrecardDraft {
  if (!value.startsWith(QUANTUM_PRECARD_VERSION)) return createEmptyQuantumPrecardDraft()

  const sections = parseSections(value)
  const balance = parseBalance(sections.get(SECTION_LABELS.balances) ?? '')
  const mbti = sections.get(SECTION_LABELS.mbti) ?? ''
  const conversationEnergy = sections.get(SECTION_LABELS.conversationEnergy) ?? ''
  const planStyle = sections.get(SECTION_LABELS.planStyle) ?? ''
  const meetupRole = sections.get(SECTION_LABELS.meetupRole) ?? ''

  return {
    intro: cleanLine(sections.get(SECTION_LABELS.intro) ?? ''),
    mbti: mbtiValues.has(mbti) ? mbti : '',
    conversationEnergy: conversationValues.has(conversationEnergy)
      ? conversationEnergy as QuantumPrecardConversationEnergy
      : '',
    planStyle: planValues.has(planStyle) ? planStyle as QuantumPrecardPlanStyle : '',
    interests: normalizeInterests((sections.get(SECTION_LABELS.interests) ?? '').split('·')),
    music: cleanLine(sections.get(SECTION_LABELS.music) ?? ''),
    mintChocolate: balance.mintChocolate,
    naengmyeon: balance.naengmyeon,
    meetupRole: roleValues.has(meetupRole) ? meetupRole as QuantumPrecardRole : '',
  }
}

export function containsUnsafePublicContact(value: string): boolean {
  return /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|01[016789][\s-]?\d{3,4}[\s-]?\d{4}|(?:카톡|카카오|인스타|instagram|텔레그램|telegram|연락처|전화번호|아이디|\bid\b)\s*[:：]?\s*[a-z0-9_.-]{3,})/i.test(value)
}

export function getQuantumPrecardChoiceLabel(
  kind: 'conversation' | 'plan' | 'role',
  value: string,
): string {
  const options = kind === 'conversation'
    ? QUANTUM_PRECARD_CONVERSATION_OPTIONS
    : kind === 'plan'
      ? QUANTUM_PRECARD_PLAN_OPTIONS
      : QUANTUM_PRECARD_ROLE_OPTIONS
  return options.find((option) => option.value === value)?.label ?? '아직 선택하지 않았어요'
}

function section(label: string, value: string) {
  return `[${label}]\n${value}`
}

function cleanLine(value: string) {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeInterests(values: string[]) {
  return Array.from(new Set(values.map(cleanLine).filter(Boolean))).slice(0, MAX_INTERESTS)
}

function hasValidInterests(values: string[]) {
  const normalized = normalizeInterests(values)
  return normalized.length >= MIN_INTERESTS && normalized.length <= MAX_INTERESTS
}

function isShortStoryValid(value: string, minimum: number, maximum: number) {
  const length = cleanLine(value).length
  return length >= minimum && length <= maximum
}

function isBalanceChoice(value: string): value is 'A' | 'B' {
  return value === 'A' || value === 'B'
}

function parseSections(value: string) {
  const sections = new Map<string, string>()
  const pattern = /^\[([^\]]+)\]\s*\n([\s\S]*?)(?=\n\n\[[^\]]+\]\s*\n|$)/gm
  for (const match of value.matchAll(pattern)) {
    sections.set(match[1], match[2].trim())
  }
  return sections
}

function parseBalance(value: string): Pick<QuantumPrecardDraft, 'mintChocolate' | 'naengmyeon'> {
  const mint = /(?:^|;)mint=(A|B)(?:;|$)/.exec(value)?.[1] ?? ''
  const naengmyeon = /(?:^|;)naengmyeon=(A|B)(?:;|$)/.exec(value)?.[1] ?? ''
  return {
    mintChocolate: mint as QuantumPrecardBalanceChoice,
    naengmyeon: naengmyeon as QuantumPrecardBalanceChoice,
  }
}
