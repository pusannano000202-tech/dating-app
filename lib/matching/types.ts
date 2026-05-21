export type Gender = 'male' | 'female'

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface TimeWindow {
  start: string
  end: string
}

export type WeekdayAvailability = Record<Weekday, TimeWindow[]>

export type NumericVector = Record<string, number>

export interface Big5Vector {
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
}

export interface MatchingPreferenceWeights {
  appearance: number
  personality: number
  time: number
  scoreBand: number
  weightAlignment: number
}

export interface GroupSummary {
  groupId: string
  gender: Gender
  size: number
  departmentCodes: string[]
  avgSelfAppearanceScore: number | null
  avgAppearanceVector: NumericVector | null
  avgPreferredAppearanceVector: NumericVector | null
  avgPreferredAxisZVector: NumericVector | null
  avgBig5: Big5Vector | null
  preferredBig5: Big5Vector | null
  availability: WeekdayAvailability
  excludedGroupIds: string[]
  preferenceWeights: MatchingPreferenceWeights
}

export interface GroupMemberSummary {
  userId: string
  selfAppearanceScore: number
  appearanceVector: NumericVector
  preferredAxisZVector: NumericVector
  big5: Big5Vector
  preferredBig5: Big5Vector
  availability: WeekdayAvailability
  preferenceWeights: MatchingPreferenceWeights
}

export interface GroupSummaryInput {
  groupId: string
  gender: Gender
  size: number
  departmentCodes: string[]
  excludedGroupIds: string[]
  members: GroupMemberSummary[]
}

export type MatchRejectReason =
  | 'same_gender'
  | 'size_mismatch'
  | 'department_blocked'
  | 'no_time_overlap'
  | 'excluded_pair'
  | 'score_band_mismatch'
  | 'missing_required_profile_data'

export type MatchableResult =
  | { ok: true }
  | { ok: false; reason: MatchRejectReason }

export interface PairScoreBreakdown {
  appearanceAB: number
  appearanceBA: number
  appearance: number
  personality: number
  time: number
  scoreBand: number
  weightAlignment: number
  asymmetryPenalty: number
}

export interface PairScore {
  groupAId: string
  groupBId: string
  score: number
  matchable: MatchableResult
  breakdown: PairScoreBreakdown
}

export interface SimulatedRejectedPair {
  groupAId: string
  groupBId: string
  reason: MatchRejectReason | 'below_threshold'
}

export interface SimulatedBatch {
  candidates: PairScore[]
  rejected: SimulatedRejectedPair[]
}

export const WEEKDAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]
