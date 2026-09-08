export const MINIMUM_SIGNUP_SCHOOL_SCOPE = 'pnu_self_selected' as const
export const MINIMUM_SIGNUP_MIN_AGE = 19
export const MINIMUM_SIGNUP_MAX_AGE = 35

export type CommunityGender = 'male' | 'female' | 'other' | 'prefer_not_to_say' | 'unknown'

export type CommunityProfileEligibilityRow = {
  birthDate: string | null
  schoolScope: string | null
  department: string | null
  communityGender: string | null
  displayName: string | null
  aliasClaimedAt: string | null
}

export type ProfileEligibilityInput = {
  accountAuthenticated: boolean
  authPhoneE164: string | null
  authPhoneConfirmedAt: string | null
  communityProfile: CommunityProfileEligibilityRow | null
  worldcupCompletedAt: string | null
  photoCount: number
  privateAppearanceReady: boolean
  matchingProfileGender: string | null
  legacyIsProfileComplete?: boolean | null
}

export type ProfileEligibilityMissingReason =
  | 'account_unauthenticated'
  | 'phone_unverified'
  | 'minimum_profile_missing'
  | 'age_ineligible'
  | 'school_scope_missing'
  | 'department_missing'
  | 'gender_missing'
  | 'server_alias_missing'
  | 'worldcup_incomplete'
  | 'photos_missing'
  | 'matching_gender_unsupported'
  | 'appearance_review_required'

export type ProfileEligibility = {
  accountAuthenticated: boolean
  minimumSignupComplete: boolean
  profileOnboardingComplete: boolean
  matchingReady: boolean
  ageYears: number | null
  missingReasons: ProfileEligibilityMissingReason[]
}

const COMMUNITY_GENDERS = new Set<CommunityGender>([
  'male',
  'female',
  'other',
  'prefer_not_to_say',
  'unknown',
])

export function calculateAgeOnDate(birthDate: string, now = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate)
  if (!match || !Number.isFinite(now.getTime())) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) return null

  const todayYear = now.getUTCFullYear()
  const todayMonth = now.getUTCMonth() + 1
  const todayDay = now.getUTCDate()
  let age = todayYear - year
  if (todayMonth < month || (todayMonth === month && todayDay < day)) age -= 1
  return age >= 0 && age <= 130 ? age : null
}

export function isCommunityGender(value: unknown): value is CommunityGender {
  return typeof value === 'string' && COMMUNITY_GENDERS.has(value as CommunityGender)
}

export function resolveProfileEligibility(
  input: ProfileEligibilityInput,
  now = new Date(),
): ProfileEligibility {
  const reasons: ProfileEligibilityMissingReason[] = []
  const community = input.communityProfile
  const ageYears = community?.birthDate ? calculateAgeOnDate(community.birthDate, now) : null

  if (!input.accountAuthenticated) reasons.push('account_unauthenticated')
  if (!isVerifiedAuthPhone(input.authPhoneE164, input.authPhoneConfirmedAt)) {
    reasons.push('phone_unverified')
  }
  if (!community) reasons.push('minimum_profile_missing')
  if (community && (ageYears == null || ageYears < MINIMUM_SIGNUP_MIN_AGE || ageYears > MINIMUM_SIGNUP_MAX_AGE)) {
    reasons.push('age_ineligible')
  }
  if (community && community.schoolScope !== MINIMUM_SIGNUP_SCHOOL_SCOPE) {
    reasons.push('school_scope_missing')
  }
  if (community && !hasText(community.department)) reasons.push('department_missing')
  if (community && !isCommunityGender(community.communityGender)) reasons.push('gender_missing')
  if (community && (!hasText(community.displayName) || !isTimestamp(community.aliasClaimedAt))) {
    reasons.push('server_alias_missing')
  }

  const minimumReasons = new Set<ProfileEligibilityMissingReason>([
    'account_unauthenticated',
    'phone_unverified',
    'minimum_profile_missing',
    'age_ineligible',
    'school_scope_missing',
    'department_missing',
    'gender_missing',
    'server_alias_missing',
  ])
  const minimumSignupComplete = !reasons.some((reason) => minimumReasons.has(reason))

  if (!isTimestamp(input.worldcupCompletedAt)) reasons.push('worldcup_incomplete')
  if (!Number.isInteger(input.photoCount) || input.photoCount < 1) reasons.push('photos_missing')
  const profileOnboardingComplete = minimumSignupComplete
    && isTimestamp(input.worldcupCompletedAt)
    && Number.isInteger(input.photoCount)
    && input.photoCount >= 1

  const matchingGenderSupported = community?.communityGender === 'male'
    || community?.communityGender === 'female'
  const matchingGenderConsistent = matchingGenderSupported
    && input.matchingProfileGender === community?.communityGender
  if (minimumSignupComplete && (!matchingGenderSupported || !matchingGenderConsistent)) {
    reasons.push('matching_gender_unsupported')
  }
  if (profileOnboardingComplete && !input.privateAppearanceReady) {
    reasons.push('appearance_review_required')
  }

  return {
    accountAuthenticated: input.accountAuthenticated,
    minimumSignupComplete,
    profileOnboardingComplete,
    matchingReady: profileOnboardingComplete
      && matchingGenderConsistent
      && input.privateAppearanceReady,
    ageYears,
    missingReasons: reasons,
  }
}

function isVerifiedAuthPhone(phone: string | null, confirmedAt: string | null): boolean {
  return Boolean(phone && /^(?:\+)?8210\d{8}$/.test(phone) && isTimestamp(confirmedAt))
}

function isTimestamp(value: string | null | undefined): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}
