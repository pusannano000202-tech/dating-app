import type { PreferenceWeights } from '../types'

export type MatchSetupStepKey = 'personality' | 'schedule' | 'preferences'

export type MatchSetupStatus = Record<MatchSetupStepKey, boolean> & {
  allDone: boolean
}

export type MatchSetupProfile = {
  personality_preference_completed_at: string | null
  available_timeslots: { slots?: unknown[] } | null
  preference_weights: unknown | null
}

export const DEFAULT_MATCH_PREFERENCE_WEIGHTS: PreferenceWeights = {
  appearance: 0.35,
  personality: 0.35,
  height: 0.15,
  body_type: 0.15,
}

export const EMPTY_MATCH_SETUP_STATUS: MatchSetupStatus = {
  personality: false,
  schedule: false,
  preferences: false,
  allDone: false,
}

const REQUIRED_WEIGHT_KEYS = ['appearance', 'personality', 'height', 'body_type'] as const

export function hasAvailableTimeslots(payload: MatchSetupProfile['available_timeslots']): boolean {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.slots)) return false

  return payload.slots.some((slot) => {
    if (!slot || typeof slot !== 'object') return false
    const row = slot as Record<string, unknown>
    return (
      typeof row.day === 'string' &&
      typeof row.start === 'string' &&
      typeof row.end === 'string' &&
      row.day.length > 0 &&
      row.start.length > 0 &&
      row.end.length > 0
    )
  })
}

export function hasPreferenceWeights(payload: unknown): payload is PreferenceWeights {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false

  const row = payload as Record<string, unknown>
  let total = 0

  for (const key of REQUIRED_WEIGHT_KEYS) {
    const value = row[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return false
    }
    total += value
  }

  return total > 0 && Math.abs(total - 1) <= 0.01
}

export function getMatchSetupStatus(profile: MatchSetupProfile | null): MatchSetupStatus {
  const personality = Boolean(profile?.personality_preference_completed_at)
  const schedule = hasAvailableTimeslots(profile?.available_timeslots ?? null)
  const preferences = hasPreferenceWeights(profile?.preference_weights ?? null)

  return {
    personality,
    schedule,
    preferences,
    allDone: personality && schedule && preferences,
  }
}

export function buildMatchSetupStatus(status: Record<MatchSetupStepKey, boolean>): MatchSetupStatus {
  return {
    ...status,
    allDone: status.personality && status.schedule && status.preferences,
  }
}
