import type { Gender } from './types'

const MALE_VALUES = new Set(['male', '남자', 'man', 'm', '남'])
const FEMALE_VALUES = new Set(['female', '여자', 'woman', 'f', '여'])

export function normalizeGender(value: unknown): Gender | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (MALE_VALUES.has(normalized)) return 'male'
  if (FEMALE_VALUES.has(normalized)) return 'female'
  return null
}

export function oppositeGenderForWorldcup(value: unknown): Gender | null {
  const gender = normalizeGender(value)
  if (!gender) return null
  return gender === 'male' ? 'female' : 'male'
}
