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
  /** 그룹 평균 나이 (멤버 age 평균). null 이면 age_fit 가중치는 중립값 1.0 으로 적용. */
  avgAge: number | null
  /** 그룹 멤버들이 명시한 선호 나이 하한의 최댓값 (모든 멤버를 만족시키려면 가장 엄격한 하한) */
  preferredAgeMin: number | null
  /** 그룹 멤버들이 명시한 선호 나이 상한의 최솟값 (모든 멤버를 만족시키려면 가장 엄격한 상한) */
  preferredAgeMax: number | null
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
  /** 본인 나이 */
  age: number
  /** 본인이 명시한 선호 상대 나이 하한 (null = 기본값 age-3 으로 fallback) */
  preferredAgeMin: number | null
  /** 본인이 명시한 선호 상대 나이 상한 (null = 기본값 age+3 으로 fallback) */
  preferredAgeMax: number | null
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
  /** 나이 적합도 (0~1). 양 그룹 평균 나이 차이 + 선호 범위 기반. */
  ageFit: number
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
