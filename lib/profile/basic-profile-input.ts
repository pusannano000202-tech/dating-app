import {
  MINIMUM_SIGNUP_MAX_AGE,
  MINIMUM_SIGNUP_MIN_AGE,
  MINIMUM_SIGNUP_SCHOOL_SCOPE,
  calculateAgeOnDate,
  isCommunityGender,
  type CommunityGender,
} from './eligibility'
import { parseFriendRecognitionName } from '../friends/recognition-name'

export type BasicProfileInput = {
  displayName: string
  friendRecognitionName?: string
  aliasTicket: string
  gender: CommunityGender
  birthDate: string
  age: number
  height: number | null
  bodyType: 'slim' | 'average' | 'athletic' | 'chubby' | null
  hairDensity: 'full' | 'thinning' | 'bald' | null
  schoolScope: typeof MINIMUM_SIGNUP_SCHOOL_SCOPE
  department: string
  year: number | null
}

export type BasicProfileInputResult =
  | { ok: true; value: BasicProfileInput }
  | { ok: false; error: string }

export function parseBasicProfileInput(input: unknown, today = koreaCalendarDate()): BasicProfileInputResult {
  if (!isRecord(input)) return { ok: false, error: 'invalid_request' }

  const displayName = normalizeText(input.display_name)
  const friendRecognitionName = input.friend_recognition_name === undefined
    ? null
    : parseFriendRecognitionName(input.friend_recognition_name)
  const aliasTicket = typeof input.alias_ticket === 'string' ? input.alias_ticket.trim() : ''
  const gender = isCommunityGender(input.gender) ? input.gender : null
  const birthDate = typeof input.birth_date === 'string' ? input.birth_date.trim() : ''
  const age = calculateAgeOnDate(birthDate, today)
  const height = input.height == null ? null : readInteger(input.height)
  const bodyType = input.body_type == null ? null : readBodyType(input.body_type)
  const hairDensity = input.hair_density == null ? null : readHairDensity(input.hair_density)
  const schoolScope = input.school_scope === MINIMUM_SIGNUP_SCHOOL_SCOPE ? input.school_scope : null
  const department = normalizeText(input.department)
  const year = input.year == null ? null : readInteger(input.year)

  if (displayName.length < 2 || displayName.length > 20) return { ok: false, error: 'invalid_alias' }
  if (input.friend_recognition_name !== undefined && !friendRecognitionName) {
    return { ok: false, error: 'invalid_friend_recognition_name' }
  }
  if (!aliasTicket || aliasTicket.length > 4096) return { ok: false, error: 'invalid_alias_ticket' }
  if (!gender) return { ok: false, error: 'invalid_gender' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || age == null) {
    return { ok: false, error: 'invalid_birth_date' }
  }
  if (age < MINIMUM_SIGNUP_MIN_AGE || age > MINIMUM_SIGNUP_MAX_AGE) {
    return { ok: false, error: 'invalid_age' }
  }
  if (height != null && (height < 100 || height > 250)) return { ok: false, error: 'invalid_height' }
  if (input.body_type != null && bodyType == null) return { ok: false, error: 'invalid_body_type' }
  if (input.hair_density != null && hairDensity == null) return { ok: false, error: 'invalid_hair_density' }
  if (!schoolScope) return { ok: false, error: 'invalid_school_scope' }
  if (!department || department.length > 120) return { ok: false, error: 'invalid_department' }
  if (year != null && (year < 1 || year > 6)) return { ok: false, error: 'invalid_year' }

  return {
    ok: true,
    value: {
      displayName,
      ...(friendRecognitionName ? { friendRecognitionName } : {}),
      aliasTicket,
      gender,
      birthDate,
      age,
      height,
      bodyType,
      hairDensity: gender === 'male' ? hairDensity : null,
      schoolScope,
      department,
      year,
    },
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function readInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function readBodyType(value: unknown): BasicProfileInput['bodyType'] {
  return value === 'slim' || value === 'average' || value === 'athletic' || value === 'chubby' ? value : null
}

function readHairDensity(value: unknown): BasicProfileInput['hairDensity'] {
  return value === 'full' || value === 'thinning' || value === 'bald' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function koreaCalendarDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return new Date(Date.UTC(read('year'), read('month') - 1, read('day')))
}
