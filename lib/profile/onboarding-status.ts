export type ProfileOnboardingStep = 'basic' | 'worldcup' | 'photos' | 'complete'

export type ProfileOnboardingRow = {
  display_name?: string | null
  gender?: string | null
  age?: number | null
  school?: string | null
  appearance_type?: string | null
  worldcup_completed_at?: string | null
  big5_openness?: number | null
  big5_conscientiousness?: number | null
  big5_extraversion?: number | null
  big5_agreeableness?: number | null
  big5_neuroticism?: number | null
}

export function resolveProfileOnboardingStatus({
  profile,
  photoCount,
}: {
  profile: ProfileOnboardingRow | null
  photoCount: number
}): { isComplete: boolean; nextStep: ProfileOnboardingStep } {
  if (!hasBasicProfile(profile)) return { isComplete: false, nextStep: 'basic' }
  if (!isCompletedAt(profile.worldcup_completed_at)) return { isComplete: false, nextStep: 'worldcup' }
  if (!Number.isInteger(photoCount) || photoCount < 1) return { isComplete: false, nextStep: 'photos' }
  return { isComplete: true, nextStep: 'complete' }
}

function isCompletedAt(value: string | null | undefined): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function hasBasicProfile(profile: ProfileOnboardingRow | null): profile is ProfileOnboardingRow {
  return Boolean(
    profile
    && typeof profile.display_name === 'string'
    && profile.display_name.trim().length >= 2
    && (profile.gender === 'male' || profile.gender === 'female')
    && typeof profile.age === 'number'
    && profile.age >= 18
    && typeof profile.school === 'string'
    && profile.school.trim().length > 0,
  )
}
