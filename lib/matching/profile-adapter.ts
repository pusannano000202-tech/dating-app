import type { MatchingProfile } from '../types'
import { hasPreferenceWeights, isValidAvailabilitySlot } from './match-setup-status'
import type {
  Big5Vector,
  GroupMemberSummary,
  NumericVector,
  Weekday,
  WeekdayAvailability,
} from './types'

export type DatabaseMatchingProfile = Pick<
  MatchingProfile,
  | 'user_id'
  | 'age'
  | 'preferred_age_min'
  | 'preferred_age_max'
  | 'preferred_axis_z_vector'
  | 'preferred_personality_vector'
  | 'big5'
  | 'available_timeslots'
  | 'preference_weights'
>

export type PrivateMatchingAppearance = {
  score_normalized: number
  appearance_type: MatchingProfile['appearance_type']
}

const BIG5_KEYS = [
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'neuroticism',
] as const

const WEEKDAY_SET = new Set<Weekday>([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
])

const APPEARANCE_TYPE_SET = new Set<NonNullable<MatchingProfile['appearance_type']>>([
  'cute',
  'pure',
  'chic',
  'warm',
  'stylish',
  'healthy',
])

export function toGroupMemberSummary(
  profile: DatabaseMatchingProfile,
  privateAppearance?: PrivateMatchingAppearance,
): GroupMemberSummary | null {
  if (
    !privateAppearance ||
    !isNormalizedScore(privateAppearance.score_normalized) ||
    !isAppearanceType(privateAppearance.appearance_type)
  ) {
    return null
  }

  const appearanceVector = toAppearanceVector(privateAppearance.appearance_type)
  const preferredAxisZVector = toNumericVector(profile.preferred_axis_z_vector)
  const big5 = toBig5Vector(profile.big5)
  const preferredBig5 = toBig5Vector(profile.preferred_personality_vector)
  const availability = toWeekdayAvailability(profile.available_timeslots)

  if (
    !appearanceVector ||
    !preferredAxisZVector ||
    !big5 ||
    !preferredBig5 ||
    !availability ||
    !hasPreferenceWeights(profile.preference_weights) ||
    !isAge(profile.age) ||
    !isNullableAge(profile.preferred_age_min) ||
    !isNullableAge(profile.preferred_age_max)
  ) {
    return null
  }

  return {
    userId: profile.user_id,
    appearanceScoreNormalized: privateAppearance.score_normalized,
    appearanceVector,
    preferredAxisZVector,
    big5,
    preferredBig5,
    availability,
    preferenceWeights: {
      appearance: profile.preference_weights.appearance,
      personality: profile.preference_weights.personality,
      height: profile.preference_weights.height,
      bodyType: profile.preference_weights.body_type,
    },
    age: profile.age,
    preferredAgeMin: profile.preferred_age_min,
    preferredAgeMax: profile.preferred_age_max,
  }
}

function toAppearanceVector(
  appearanceType: NonNullable<MatchingProfile['appearance_type']>,
): NumericVector {
  return { [appearanceType]: 1 }
}

function isAppearanceType(
  value: unknown,
): value is NonNullable<MatchingProfile['appearance_type']> {
  return typeof value === 'string' && APPEARANCE_TYPE_SET.has(
    value as NonNullable<MatchingProfile['appearance_type']>,
  )
}

function toNumericVector(value: unknown): NumericVector | null {
  if (!isRecord(value)) return null

  const entries = Object.entries(value)
  if (entries.length === 0 || entries.some(([, entry]) => !isFiniteNumber(entry))) return null

  return Object.fromEntries(entries) as NumericVector
}

function toBig5Vector(value: unknown): Big5Vector | null {
  if (!isRecord(value)) return null

  const result = {} as Big5Vector
  for (const key of BIG5_KEYS) {
    const score = value[key]
    if (!isUnitIntervalNumber(score)) return null
    result[key] = score
  }

  return result
}

function toWeekdayAvailability(value: unknown): WeekdayAvailability | null {
  if (!isRecord(value) || !Array.isArray(value.slots)) return null

  const availability: WeekdayAvailability = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  }

  for (const slot of value.slots) {
    if (!isRecord(slot) || !WEEKDAY_SET.has(slot.day as Weekday) || !isValidAvailabilitySlot(slot)) return null
    const validSlot = slot as { day: Weekday; start: string; end: string }
    availability[validSlot.day].push({ start: validSlot.start, end: validSlot.end })
  }

  return value.slots.length > 0 ? availability : null
}

function isNormalizedScore(value: unknown): value is number {
  return isUnitIntervalNumber(value)
}

function isUnitIntervalNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isAge(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 18 && value <= 60
}

function isNullableAge(value: unknown): value is number | null {
  return value === null || isAge(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
