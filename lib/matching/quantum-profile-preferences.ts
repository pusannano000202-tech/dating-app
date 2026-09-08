export type QuantumDebateChoice = 'A' | 'B' | 'SKIP'

export type QuantumDebateAnswer = {
  questionId: string
  choice: QuantumDebateChoice
  shareOnCard: boolean
}

export type QuantumProfilePreference = {
  schemaVersion: 2
  mbti: string | null
  relationshipBoundary?: string | null
  conversationEnergy: 'listener' | 'balanced' | 'speaker'
  planStyle: 'planner' | 'balanced' | 'spontaneous'
  interests: string[]
  favoriteMusic: string
  debateAnswers: QuantumDebateAnswer[]
  questionBankVersion: string
  updatedAt: string | null
}

export type QuantumProfilePreferenceDraft = Omit<
  QuantumProfilePreference,
  'conversationEnergy' | 'planStyle'
> & {
  conversationEnergy: QuantumProfilePreference['conversationEnergy'] | null
  planStyle: QuantumProfilePreference['planStyle'] | null
}

export type QuantumMeetingMoment = {
  occurrenceKey: string
  mood: 'calm' | 'bright' | 'curious' | 'energetic'
  expectation: 'conversation' | 'activity' | 'new_people' | 'easy_company'
  activityChoice: string
}

export type QuantumMeetingMomentDraft = Omit<QuantumMeetingMoment, 'occurrenceKey'>

export type QuantumPublicParticipantPreview = {
  seatLabel: string
  gender: 'male' | 'female'
  profilePreference: {
    mbti: string | null
    conversationEnergy: QuantumProfilePreference['conversationEnergy']
    planStyle: QuantumProfilePreference['planStyle']
    interests: string[]
    favoriteMusic: string
    debateAnswers: Array<Pick<QuantumDebateAnswer, 'questionId' | 'choice'>>
  } | null
  meetingMoment: Omit<QuantumMeetingMoment, 'occurrenceKey'> | null
}

export type QuantumPreferenceValidation =
  | { ok: true }
  | { ok: false; error: 'invalid_profile_preference' | 'invalid_meeting_moment' }

const CONVERSATION_ENERGIES = new Set<QuantumProfilePreference['conversationEnergy']>([
  'listener',
  'balanced',
  'speaker',
])
const PLAN_STYLES = new Set<QuantumProfilePreference['planStyle']>([
  'planner',
  'balanced',
  'spontaneous',
])
const MOODS = new Set<QuantumMeetingMoment['mood']>(['calm', 'bright', 'curious', 'energetic'])
const EXPECTATIONS = new Set<QuantumMeetingMoment['expectation']>([
  'conversation',
  'activity',
  'new_people',
  'easy_company',
])

const SAFE_TOKEN_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i
const MBTI_PATTERN = /^[IE][NS][FT][JP]$/
const MIN_INTERESTS = 3
const MAX_INTERESTS = 5
const MAX_INTEREST_LENGTH = 32
const MAX_FAVORITE_MUSIC_LENGTH = 120
const MAX_RELATIONSHIP_BOUNDARY_LENGTH = 160
const MAX_ACTIVITY_CHOICE_LENGTH = 80
const MAX_SEAT_LABEL_LENGTH = 24
const MAX_DEBATE_ANSWERS = 20
const MAX_UPDATED_AT_LENGTH = 64

export const QUANTUM_DEBATE_QUESTION_DEFINITIONS = [
  { id: 'jjajang-jjamppong', title: '짜장과 짬뽕', optionA: '짜장', optionB: '짬뽕', required: true },
  { id: 'tangsuyuk', title: '탕수육', optionA: '부먹', optionB: '찍먹', required: true },
  { id: 'mint-chocolate', title: '민트초코', optionA: '민초 가능', optionB: '반민초', required: true },
  { id: 'naengmyeon', title: '냉면', optionA: '물냉', optionB: '비냉', required: true },
  { id: 'perilla-leaf', title: '깻잎을 대신 눌러주기', optionA: '괜찮아요', optionB: '불편해요', required: false },
  { id: 'shrimp-peeling', title: '친구의 새우 껍질 까주기', optionA: '괜찮아요', optionB: '불편해요', required: false },
  { id: 'padding-zipper', title: '친구의 패딩 지퍼 올려주기', optionA: '괜찮아요', optionB: '불편해요', required: false },
  { id: 'bluetooth-history', title: '연인의 차에 이성 친구 블루투스 기록', optionA: '괜찮아요', optionB: '불편해요', required: false },
  { id: 'friend-drinking', title: '연인이 내 친구와 남아 술 마시기', optionA: '괜찮아요', optionB: '불편해요', required: false },
  { id: 'surprise-contact', title: '깜짝 이벤트를 위해 내 친구와 연락하기', optionA: '괜찮아요', optionB: '불편해요', required: false },
  { id: 'hotdog-bite', title: '친구가 연인이 먹던 핫도그 한 입 먹기', optionA: '괜찮아요', optionB: '불편해요', required: false },
] as const

export const CURRENT_QUANTUM_DEBATE_QUESTION_BANK = {
  version: 'quantum-debate-v1',
  numericVersion: 1,
  questionIds: QUANTUM_DEBATE_QUESTION_DEFINITIONS.map((question) => question.id),
} as const

const CURRENT_DEBATE_QUESTION_IDS = new Set<string>(
  CURRENT_QUANTUM_DEBATE_QUESTION_BANK.questionIds,
)

const PHONE_SEPARATOR = String.raw`[\s./-]*`
const KOREAN_MOBILE_PHONE_PATTERN = new RegExp(
  String.raw`(?:\+?82${PHONE_SEPARATOR})?\(?0?1[016789]\)?${PHONE_SEPARATOR}\d{3,4}${PHONE_SEPARATOR}\d{4}`,
)
const KOREAN_LANDLINE_PHONE_PATTERN = new RegExp(
  String.raw`\(?0(?:2|[3-6]\d|70)\)?${PHONE_SEPARATOR}\d{3,4}${PHONE_SEPARATOR}\d{4}`,
)
const INTERNATIONAL_PHONE_SEGMENT_PATTERN = /(?:^|[^\p{L}\p{N}])\+\d{1,3}(?:[\s./-]*\(?\d{1,4}\)?){2,4}(?=$|[^\p{L}\p{N}])/u
const KOREAN_MAJOR_OR_DEPARTMENT_PATTERN = /(?:[가-힣]{1,12}(?:공학|학과|학부|전공)|(?:경영|심리|경제|간호|법)학|(?:의|치의|한의)예과|컴공)/
const STUDENT_ID_PATTERN = /\b20\d{2}(?:[\s./-]?\d{4,6})\b/
const STRICT_UTC_ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const BLOCKED_PERSONAL_CONTACT_PATTERNS = [
  /https?:\/\//i,
  /www\./i,
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,63}\b/i,
  /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
  /@[\p{L}\p{N}_.-]+/u,
  KOREAN_MOBILE_PHONE_PATTERN,
  KOREAN_LANDLINE_PHONE_PATTERN,
  /(?:카카오|카톡|인스타|텔레그램|연락처|전화번호|디엠)/i,
  /(?:연락\s*(?:주세요|줘(?:요)?|바랍니다|가능|해(?:요)?|부탁|하자)|번호\s*(?:알려\s*줄게|줄게))/,
  /\b(?:kakao|instagram|telegram|sns|contact|phone|dm|message\s*me)\b/i,
  KOREAN_MAJOR_OR_DEPARTMENT_PATTERN,
  /\b(?:department|student\s*id|school\s*id|computer\s*science|mechanical\s*engineering)\b/i,
  STUDENT_ID_PATTERN,
] as const

export function createEmptyQuantumProfilePreference(): QuantumProfilePreferenceDraft {
  return {
    schemaVersion: 2,
    mbti: null,
    relationshipBoundary: null,
    conversationEnergy: null,
    planStyle: null,
    interests: [],
    favoriteMusic: '',
    debateAnswers: [],
    questionBankVersion: CURRENT_QUANTUM_DEBATE_QUESTION_BANK.version,
    updatedAt: null,
  }
}

export function validateQuantumProfilePreference(value: unknown): QuantumPreferenceValidation {
  return parseQuantumProfilePreference(value)
    ? { ok: true }
    : { ok: false, error: 'invalid_profile_preference' }
}

export function validateQuantumMeetingMoment(value: unknown): QuantumPreferenceValidation {
  return parseQuantumMeetingMoment(value)
    ? { ok: true }
    : { ok: false, error: 'invalid_meeting_moment' }
}

export function parseQuantumMeetingMomentDraft(value: unknown): QuantumMeetingMomentDraft | null {
  if (!isRecord(value)) return null
  if (!MOODS.has(value.mood as QuantumMeetingMoment['mood'])) return null
  if (!EXPECTATIONS.has(value.expectation as QuantumMeetingMoment['expectation'])) return null

  const activityChoice = parseSafeText(value.activityChoice, MAX_ACTIVITY_CHOICE_LENGTH)
  if (!activityChoice) return null

  return {
    mood: value.mood as QuantumMeetingMoment['mood'],
    expectation: value.expectation as QuantumMeetingMoment['expectation'],
    activityChoice,
  }
}

export function normalizeDebateChoice(value: unknown): QuantumDebateChoice | null {
  return value === 'A' || value === 'B' || value === 'SKIP' ? value : null
}

export function pickSharedDebateAnswers(answers: QuantumDebateAnswer[]): QuantumDebateAnswer[] {
  if (!Array.isArray(answers)) return []

  const shared: QuantumDebateAnswer[] = []
  for (const answer of answers) {
    const parsed = parseQuantumDebateAnswer(answer)
    if (!parsed || !parsed.shareOnCard) continue

    shared.push(parsed)
    if (shared.length === 3) break
  }
  return shared
}

export function toPublicParticipantPreview(value: unknown): QuantumPublicParticipantPreview | null {
  if (!isRecord(value)) return null
  const seatLabel = parsePublicSeatLabel(value.seatLabel)
  const gender = value.gender === 'male' || value.gender === 'female' ? value.gender : null
  if (!seatLabel || !gender) return null

  const profilePreference = parseQuantumProfilePreference(value.profilePreference)
  const meetingMoment = parseQuantumMeetingMoment(value.meetingMoment)

  return {
    seatLabel,
    gender,
    profilePreference: profilePreference
      ? {
          mbti: profilePreference.mbti,
          conversationEnergy: profilePreference.conversationEnergy,
          planStyle: profilePreference.planStyle,
          interests: [...profilePreference.interests],
          favoriteMusic: profilePreference.favoriteMusic,
          debateAnswers: pickSharedDebateAnswers(profilePreference.debateAnswers).map((answer) => ({
            questionId: answer.questionId,
            choice: answer.choice,
          })),
        }
      : null,
    meetingMoment: meetingMoment
      ? {
          mood: meetingMoment.mood,
          expectation: meetingMoment.expectation,
          activityChoice: meetingMoment.activityChoice,
        }
      : null,
  }
}

export function buildMatchingSignals(value: QuantumProfilePreference): {
  conversationEnergy: QuantumProfilePreference['conversationEnergy']
  planStyle: QuantumProfilePreference['planStyle']
} {
  return {
    conversationEnergy: value.conversationEnergy,
    planStyle: value.planStyle,
  }
}

export function containsBlockedPersonalContact(value: unknown): boolean {
  if (typeof value !== 'string') return true

  const securityText = cleanText(value)
  const compactSecurityText = securityText.replace(/\s+/g, '')
  return [securityText, compactSecurityText].some((text) => (
    BLOCKED_PERSONAL_CONTACT_PATTERNS.some((pattern) => pattern.test(text))
    || containsInternationalPhoneSegment(text)
  ))
}

export function parseQuantumProfilePreference(value: unknown): QuantumProfilePreference | null {
  if (!isRecord(value) || value.schemaVersion !== 2) return null
  if (!isNullableMbti(value.mbti)
    || (value.relationshipBoundary !== undefined
      && !isNullableSafeText(value.relationshipBoundary, MAX_RELATIONSHIP_BOUNDARY_LENGTH))) {
    return null
  }
  if (!CONVERSATION_ENERGIES.has(value.conversationEnergy as QuantumProfilePreference['conversationEnergy'])) {
    return null
  }
  if (!PLAN_STYLES.has(value.planStyle as QuantumProfilePreference['planStyle'])) return null

  const interests = parseInterests(value.interests)
  const favoriteMusic = parseSafeText(value.favoriteMusic, MAX_FAVORITE_MUSIC_LENGTH)
  if (value.questionBankVersion !== CURRENT_QUANTUM_DEBATE_QUESTION_BANK.version) return null

  const debateAnswers = parseDebateAnswers(value.debateAnswers)
  const updatedAt = parseUpdatedAt(value.updatedAt)
  if (!interests || !favoriteMusic || !debateAnswers || updatedAt === undefined) {
    return null
  }

  return {
    schemaVersion: 2,
    mbti: value.mbti,
    relationshipBoundary: typeof value.relationshipBoundary === 'string'
      ? cleanText(value.relationshipBoundary)
      : null,
    conversationEnergy: value.conversationEnergy as QuantumProfilePreference['conversationEnergy'],
    planStyle: value.planStyle as QuantumProfilePreference['planStyle'],
    interests,
    favoriteMusic,
    debateAnswers,
    questionBankVersion: value.questionBankVersion,
    updatedAt,
  }
}

export function parseQuantumMeetingMoment(value: unknown): QuantumMeetingMoment | null {
  if (!isRecord(value) || !isSafeToken(value.occurrenceKey)) return null
  const draft = parseQuantumMeetingMomentDraft(value)
  if (!draft) return null

  return {
    occurrenceKey: value.occurrenceKey,
    ...draft,
  }
}

function parseDebateAnswers(value: unknown): QuantumDebateAnswer[] | null {
  if (!Array.isArray(value) || value.length > MAX_DEBATE_ANSWERS) return null

  const parsedAnswers: QuantumDebateAnswer[] = []
  const questionIds = new Set<string>()
  for (const answer of value) {
    const parsed = parseQuantumDebateAnswer(answer)
    if (!parsed || questionIds.has(parsed.questionId)) return null
    questionIds.add(parsed.questionId)
    parsedAnswers.push(parsed)
  }
  return parsedAnswers
}

function parseQuantumDebateAnswer(value: unknown): QuantumDebateAnswer | null {
  if (!isRecord(value)
    || !isSafeToken(value.questionId)
    || !CURRENT_DEBATE_QUESTION_IDS.has(value.questionId)
    || typeof value.shareOnCard !== 'boolean') return null
  const choice = normalizeDebateChoice(value.choice)
  return choice ? { questionId: value.questionId, choice, shareOnCard: value.shareOnCard } : null
}

function parseInterests(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_INTERESTS) return null
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const interest of value) {
    const parsed = parseSafeText(interest, MAX_INTEREST_LENGTH)
    if (!parsed) return null
    if (seen.has(parsed)) continue
    seen.add(parsed)
    normalized.push(parsed)
  }
  if (normalized.length < MIN_INTERESTS || normalized.length > MAX_INTERESTS) return null
  return normalized
}

function parsePublicSeatLabel(value: unknown): string | null {
  const seatLabel = parseSafeText(value, MAX_SEAT_LABEL_LENGTH)
  return seatLabel && /^[a-z0-9][a-z0-9 _-]*$/i.test(seatLabel) ? seatLabel : null
}

function parseSafeText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = cleanText(value)
  return normalized.length > 0 && normalized.length <= maximumLength && !containsBlockedPersonalContact(normalized)
    ? normalized
    : null
}

function isNullableSafeText(value: unknown, maximumLength: number): value is string | null {
  return value === null || parseSafeText(value, maximumLength) !== null
}

function isNullableMbti(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && MBTI_PATTERN.test(value))
}

function parseUpdatedAt(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string'
    || value.length > MAX_UPDATED_AT_LENGTH
    || !STRICT_UTC_ISO_TIMESTAMP_PATTERN.test(value)) {
    return undefined
  }

  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return undefined

  const canonicalInput = value.includes('.') ? value : value.replace('Z', '.000Z')
  return timestamp.toISOString() === canonicalInput ? timestamp.toISOString() : undefined
}

function isSafeToken(value: unknown): value is string {
  return typeof value === 'string' && SAFE_TOKEN_PATTERN.test(value)
}

function cleanText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsInternationalPhoneSegment(value: string): boolean {
  const matches = value.match(new RegExp(INTERNATIONAL_PHONE_SEGMENT_PATTERN.source, 'gu')) ?? []
  return matches.some((match) => {
    const digits = match.replace(/\D/g, '')
    return digits.length >= 10 && digits.length <= 15
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
