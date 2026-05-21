// 공용 타입 — 수정 시 반드시 PR + 상대방(성준) 리뷰 필수

export type Gender = 'male' | 'female'

export type AppearanceType = 'cute' | 'pure' | 'chic' | 'warm' | 'stylish' | 'healthy'

export type BodyType = 'slim' | 'average' | 'athletic' | 'chubby'

export type HairDensity = 'full' | 'thinning' | 'bald'

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface TimeSlot {
  day: DayOfWeek
  start: string // "HH:MM"
  end: string   // "HH:MM"
}

export interface AvailableTimeslots {
  slots: TimeSlot[]
}

export interface PreferenceWeights {
  appearance: number
  personality: number
  height: number
  body_type: number
  school: number
  hobby: number
  time_fit: number
  // 합계 = 1.0 보장 필요
}

// 이상형 월드컵 결과 (사용자 노출 금지: raw vector)
// 마이그레이션: supabase/migrations/20260521_profile_add_preference_vectors.sql
export interface PreferredAppearance {
  preferred_appearance_vector: Record<string, number> | null
  preferred_appearance_delta_vector: Record<string, number> | null
  preferred_choice_delta_vector: Record<string, number> | null
  preferred_axis_percentile_vector: Record<string, number> | null
  preferred_axis_z_vector: Record<string, number> | null
  preferred_score_range: { mean: number; min: number; max: number } | null
  // 노출 가능 (유형 표시용)
  preferred_bucket_weights: Record<string, number> | null
  worldcup_pool_mean_vector: Record<string, number> | null
  worldcup_pool_axis_stats: unknown | null
  worldcup_completed_at: string | null
}

export interface MatchingProfile extends PreferredAppearance {
  user_id: string
  gender: Gender
  age: number
  height: number | null
  body_type: BodyType | null
  appearance_score_normalized: number // 0~1, AI 외모 점수 정규화값
  appearance_type: AppearanceType | null
  // 본인 외모 점수 (D-03: GPT Vision 자동값 + 운영자 보정). 사용자 노출 금지.
  // 매칭 계산: A.preferred_score_range vs B.self_appearance_score (양방향)
  self_appearance_score: number | null
  big5: {
    openness: number
    conscientiousness: number
    extraversion: number
    agreeableness: number
    neuroticism: number
  }
  available_timeslots: AvailableTimeslots
  preference_weights: PreferenceWeights
  is_profile_complete: boolean
}

export type GroupStatus = 'forming' | 'ready' | 'in_pool' | 'matched' | 'completed' | 'disbanded'

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'

export type FriendshipStatus = 'active' | 'blocked'

export type GroupInviteStatus = 'pending' | 'accepted' | 'declined' | 'expired'

export interface FriendSummary {
  user_id: string
  display_name: string
  phone?: string | null
  status: FriendshipStatus
  group_status?: 'available' | 'invited' | 'in_group'
}

export type DepositStatus = 'pending' | 'paid' | 'refunded' | 'forfeited' | 'compensated'

export type MatchStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled'
