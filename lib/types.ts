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

export interface MatchingProfile {
  user_id: string
  gender: Gender
  age: number
  height: number | null
  body_type: BodyType | null
  appearance_score_normalized: number // 0~1
  appearance_type: AppearanceType | null
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

export type DepositStatus = 'pending' | 'paid' | 'refunded' | 'forfeited' | 'compensated'

export type MatchStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled'
