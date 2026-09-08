export type ProfileOnboardingStep = 'basic' | 'worldcup' | 'photos' | 'complete'

export function resolveProfileOnboardingStatus({
  minimumSignupComplete,
  worldcupCompletedAt,
  photoCount,
}: {
  minimumSignupComplete: boolean
  worldcupCompletedAt: string | null
  photoCount: number
}): { communityReady: boolean; isComplete: boolean; nextStep: ProfileOnboardingStep } {
  if (!minimumSignupComplete) return { communityReady: false, isComplete: false, nextStep: 'basic' }
  if (!isCompletedAt(worldcupCompletedAt)) return { communityReady: true, isComplete: false, nextStep: 'worldcup' }
  if (!Number.isInteger(photoCount) || photoCount < 1) return { communityReady: true, isComplete: false, nextStep: 'photos' }
  return { communityReady: true, isComplete: true, nextStep: 'complete' }
}

function isCompletedAt(value: string | null): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}
