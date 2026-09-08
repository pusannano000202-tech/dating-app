export const MEETUP_GENDER_MODES = ['all', 'male_only', 'female_only'] as const
export type MeetupGenderMode = (typeof MEETUP_GENDER_MODES)[number]
export type MeetupGenderEligibility = 'eligible' | 'gender_required' | 'gender_restricted'

export const MEETUP_GENDER_LABELS: Record<MeetupGenderMode, string> = {
  all: '성별 무관',
  male_only: '남자끼리',
  female_only: '여자끼리',
}

export function isMeetupGenderMode(value: unknown): value is MeetupGenderMode {
  return typeof value === 'string' && MEETUP_GENDER_MODES.includes(value as MeetupGenderMode)
}
