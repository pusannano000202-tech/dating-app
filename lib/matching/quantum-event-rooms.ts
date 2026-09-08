import { containsBlockedPersonalContact } from './quantum-profile-preferences'

export type QuantumEventRoom = {
  occurrence_id: string
  room_number: number
  room_label: string
  room_code: string
  total: number
  male: number
  female: number
  reserved_total: number
  reserved_male: number
  reserved_female: number
  required_total: number
  male_capacity: number
  female_capacity: number
  is_my_room: boolean
}

export type QuantumEventRoomInviteCandidate = {
  user_id: string
  display_name: string
  avatar_url: string | null
}

export type QuantumEventRoomInvite = {
  token: string
  role: 'inviter' | 'invitee'
  counterpart_user_id: string
  counterpart_display_name: string
  event_id: string
  event_mode: 'tonight' | 'scheduled'
  room_number: number
  room_label: string
  room_code: string
  status: 'pending' | 'accepted'
  expires_at: string
}

export type CreatedQuantumEventRoomInvite = {
  token: string
  event_id: string
  event_mode: 'tonight' | 'scheduled'
  room_number: number
  room_label: string
  room_code: string
  expires_at: string
  status: 'pending'
  invited_user_id: string
}

type QuantumEventRoomProfilePreference = {
  mbti: string | null
  conversation_energy: 'listener' | 'balanced' | 'speaker'
  plan_style: 'planner' | 'balanced' | 'spontaneous'
  interests: string[]
  favorite_music: string
  debate_answers: Array<{
    question_id: string
    choice: 'A' | 'B' | 'SKIP'
  }>
}

type QuantumEventRoomMeetingMoment = {
  mood: 'calm' | 'bright' | 'curious' | 'energetic'
  expectation: 'conversation' | 'activity' | 'new_people' | 'easy_company'
  activity_choice: string
}

type QuantumEventRoomCompatibilityCard = {
  intro: string | null
  mbti: string | null
  conversation_energy: 'listener' | 'balanced' | 'talker' | null
  plan_style: 'planned' | 'balanced' | 'spontaneous' | null
  interests: string[]
  music: string | null
  mint_chocolate: 'A' | 'B' | null
  naengmyeon: 'A' | 'B' | null
  [key: string]: unknown
}

export type QuantumEventRoomParticipant = {
  alias: string
  gender: 'male' | 'female'
  preference_card: QuantumEventRoomCompatibilityCard
  seat_label?: string
  ready?: boolean
  profile_preference?: QuantumEventRoomProfilePreference | null
  meeting_moment?: QuantumEventRoomMeetingMoment | null
}

export type QuantumEventRoomParticipantV2 = QuantumEventRoomParticipant & {
  seat_label: string
  ready: boolean
  profile_preference: QuantumEventRoomProfilePreference | null
  meeting_moment: QuantumEventRoomMeetingMoment | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TOKEN_PATTERN = /^[0-9a-f]{32}$/
const ROOM_CODE_PATTERN = /^[0-9A-Z]{6}$/

export function parseQuantumEventRooms(value: unknown): QuantumEventRoom[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every(isQuantumEventRoom)) return null
  return value.map((room) => ({
    occurrence_id: room.occurrence_id,
    room_number: room.room_number,
    room_label: room.room_label,
    room_code: room.room_code,
    total: room.total,
    male: room.male,
    female: room.female,
    reserved_total: room.reserved_total,
    reserved_male: room.reserved_male,
    reserved_female: room.reserved_female,
    required_total: room.required_total,
    male_capacity: room.male_capacity,
    female_capacity: room.female_capacity,
    is_my_room: room.is_my_room,
  }))
}

export function parseQuantumEventRoomInviteCandidates(
  value: unknown,
): QuantumEventRoomInviteCandidate[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every(isInviteCandidate)) return null
  return value.map((candidate) => ({
    user_id: candidate.user_id,
    display_name: candidate.display_name,
    avatar_url: candidate.avatar_url,
  }))
}

export function parseQuantumEventRoomInvites(value: unknown): QuantumEventRoomInvite[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every(isRoomInvite)) return null
  return value.map((invite) => ({
    token: invite.token,
    role: invite.role,
    counterpart_user_id: invite.counterpart_user_id,
    counterpart_display_name: invite.counterpart_display_name,
    event_id: invite.event_id,
    event_mode: invite.event_mode,
    room_number: invite.room_number,
    room_label: invite.room_label,
    room_code: invite.room_code,
    status: invite.status,
    expires_at: invite.expires_at,
  }))
}

export function parseQuantumEventRoomParticipants(
  value: unknown,
): QuantumEventRoomParticipantV2[] | null {
  if (!Array.isArray(value)) return null
  const participants: QuantumEventRoomParticipantV2[] = []
  for (const item of value) {
    const participant = parseRoomParticipant(item)
    if (!participant) return null
    participants.push(participant)
  }
  return participants
}

export function isCreatedQuantumEventRoomInvite(
  value: unknown,
): value is CreatedQuantumEventRoomInvite {
  if (!isRecord(value)) return false
  return isToken(value.token)
    && typeof value.event_id === 'string'
    && isEventMode(value.event_mode)
    && isPositiveInteger(value.room_number)
    && isNonEmptyString(value.room_label)
    && isRoomCode(value.room_code)
    && isTimestamp(value.expires_at)
    && value.status === 'pending'
    && isUuid(value.invited_user_id)
}

export function isQuantumRoomInviteToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

function isQuantumEventRoom(value: unknown): value is QuantumEventRoom {
  if (!isRecord(value)) return false
  return isUuid(value.occurrence_id)
    && isPositiveInteger(value.room_number)
    && isNonEmptyString(value.room_label)
    && isRoomCode(value.room_code)
    && isCount(value.total)
    && isCount(value.male)
    && isCount(value.female)
    && isCount(value.reserved_total)
    && isCount(value.reserved_male)
    && isCount(value.reserved_female)
    && isPositiveInteger(value.required_total)
    && isCount(value.male_capacity)
    && isCount(value.female_capacity)
    && typeof value.is_my_room === 'boolean'
    && value.male + value.female <= value.total
    && value.reserved_male + value.reserved_female <= value.reserved_total
}

function isInviteCandidate(value: unknown): value is QuantumEventRoomInviteCandidate {
  if (!isRecord(value)) return false
  return isUuid(value.user_id)
    && isNonEmptyString(value.display_name)
    && (value.avatar_url === null || typeof value.avatar_url === 'string')
}

function isRoomInvite(value: unknown): value is QuantumEventRoomInvite {
  if (!isRecord(value)) return false
  return isToken(value.token)
    && (value.role === 'inviter' || value.role === 'invitee')
    && isUuid(value.counterpart_user_id)
    && isNonEmptyString(value.counterpart_display_name)
    && typeof value.event_id === 'string'
    && isEventMode(value.event_mode)
    && isPositiveInteger(value.room_number)
    && isNonEmptyString(value.room_label)
    && isRoomCode(value.room_code)
    && (value.status === 'pending' || value.status === 'accepted')
    && isTimestamp(value.expires_at)
}

function parseRoomParticipant(value: unknown): QuantumEventRoomParticipantV2 | null {
  if (!isRecord(value) || !isShortText(value.seat_label, 24)) return null
  if (value.gender !== 'male' && value.gender !== 'female') return null
  if (typeof value.ready !== 'boolean') return null

  const profilePreference = parseRoomProfilePreference(value.profile_preference)
  const meetingMoment = parseRoomMeetingMoment(value.meeting_moment)
  if (value.ready
    ? profilePreference === null || meetingMoment === null
    : value.profile_preference !== null || value.meeting_moment !== null) return null

  const participant = {
    seat_label: value.seat_label,
    gender: value.gender,
    ready: value.ready,
    profile_preference: profilePreference,
    meeting_moment: meetingMoment,
  }

  return Object.defineProperties(participant, {
    alias: { value: value.seat_label, enumerable: false },
    preference_card: {
      value: toCompatibilityCard(profilePreference),
      enumerable: false,
    },
  }) as QuantumEventRoomParticipantV2
}

function parseRoomProfilePreference(value: unknown): QuantumEventRoomProfilePreference | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'mbti',
    'conversation_energy',
    'plan_style',
    'interests',
    'favorite_music',
    'debate_answers',
  ])) return null
  if (!isNullableEnum(value.mbti, [
    'ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP',
    'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
  ])) return null
  if (!isNullableEnum(value.conversation_energy, ['listener', 'balanced', 'speaker'])
    || value.conversation_energy === null
    || !isNullableEnum(value.plan_style, ['planner', 'balanced', 'spontaneous'])
    || value.plan_style === null
    || !isBoundedStringArray(value.interests, 3, 5, 32)
    || !isShortText(value.favorite_music, 120)
    || !Array.isArray(value.debate_answers)
    || value.debate_answers.length > 3) return null

  const debateAnswers: QuantumEventRoomProfilePreference['debate_answers'] = []
  const questionIds = new Set<string>()
  for (const answer of value.debate_answers) {
    if (!isRecord(answer)
      || !hasOnlyKeys(answer, ['question_id', 'choice'])
      || !isSafeToken(answer.question_id)
      || (answer.choice !== 'A' && answer.choice !== 'B' && answer.choice !== 'SKIP')
      || questionIds.has(answer.question_id)) return null
    questionIds.add(answer.question_id)
    debateAnswers.push({ question_id: answer.question_id, choice: answer.choice })
  }

  return {
    mbti: value.mbti,
    conversation_energy: value.conversation_energy,
    plan_style: value.plan_style,
    interests: [...value.interests],
    favorite_music: value.favorite_music,
    debate_answers: debateAnswers,
  }
}

function parseRoomMeetingMoment(value: unknown): QuantumEventRoomMeetingMoment | null {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ['mood', 'expectation', 'activity_choice'])
    || !isNullableEnum(value.mood, ['calm', 'bright', 'curious', 'energetic'])
    || value.mood === null
    || !isNullableEnum(value.expectation, [
      'conversation', 'activity', 'new_people', 'easy_company',
    ])
    || value.expectation === null
    || !isShortText(value.activity_choice, 80)) return null

  return {
    mood: value.mood,
    expectation: value.expectation,
    activity_choice: value.activity_choice,
  }
}

function toCompatibilityCard(
  preference: QuantumEventRoomProfilePreference | null,
): QuantumEventRoomCompatibilityCard {
  return {
    intro: null,
    mbti: preference?.mbti ?? null,
    conversation_energy: preference?.conversation_energy === 'speaker'
      ? 'talker'
      : preference?.conversation_energy ?? null,
    plan_style: preference?.plan_style === 'planner'
      ? 'planned'
      : preference?.plan_style ?? null,
    interests: preference ? [...preference.interests] : [],
    music: preference?.favorite_music ?? null,
    mint_chocolate: null,
    naengmyeon: null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_PATTERN.test(value)
}

function isEventMode(value: unknown): value is 'tonight' | 'scheduled' {
  return value === 'tonight' || value === 'scheduled'
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNullableEnum<const T extends string>(value: unknown, allowed: readonly T[]): value is T | null {
  return value === null || (typeof value === 'string' && allowed.includes(value as T))
}

function isBoundedStringArray(
  value: unknown,
  minimumItems: number,
  maximumItems: number,
  maximumItemLength: number,
): value is string[] {
  return Array.isArray(value)
    && value.length >= minimumItems
    && value.length <= maximumItems
    && new Set(value).size === value.length
    && value.every((item) => isShortText(item, maximumItemLength))
}

function isShortText(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && value.length <= maximumLength
    && !/[\r\n]/.test(value)
    && !containsBlockedPersonalContact(value)
}

function isSafeToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return keys.every((key) => key in value)
    && Object.keys(value).every((key) => allowed.has(key))
}
