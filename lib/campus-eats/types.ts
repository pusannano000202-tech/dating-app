export type CandidateChoice =
  | 'both_visited_prefer_a'
  | 'both_visited_prefer_b'
  | 'only_visited_a'
  | 'only_visited_b'

export interface CandidatePair {
  candidateAId: string
  candidateBId: string
}

export interface CandidateChoiceAction {
  type: 'candidate_choice'
  eventId: string
  pair: CandidatePair
  choice: CandidateChoice
}

export interface NeutralSkipAction {
  type: 'neutral_skip'
  eventId: string
  pair: CandidatePair
}

export type BattleAction = CandidateChoiceAction | NeutralSkipAction

export type BracketStatus = 'active' | 'paused_needs_visits' | 'completed' | 'completed_without_winner'

export interface BattleOutcome {
  kind: 'advanced' | 'deferred'
  personalAdvance: boolean
  ratingEligible: boolean
  winnerId?: string
  loserId?: string
}

export interface BracketSession {
  candidateIds: readonly string[]
  status: BracketStatus
  generation: number
  generationAttempts: number
  generationAttemptBudget: number
  attemptedPairKeysInGeneration: readonly string[]
  pairAttempts: Readonly<Record<string, number>>
  roundCandidateIds: readonly string[]
  roundWinners: Readonly<Record<string, string>>
  acceptedComparisonCount: number
  eventOutcomes: Readonly<Record<string, BattleOutcome>>
  eventFingerprints: Readonly<Record<string, string>>
  winnerId?: string
}

export interface RatedComparison {
  winnerId: string
  loserId: string
  winnerRating: number
  loserRating: number
}

export type PublicationReason =
  | 'not_enough_verified_candidates'
  | 'not_enough_verified_users'
  | 'not_enough_valid_comparisons'
  | 'not_enough_public_candidates'
  | 'comparison_graph_disconnected'
  | 'not_enough_distinct_opponents'

export interface CampusRankingEligibilityInput {
  candidateIds: readonly string[]
  publicCandidateIds: readonly string[]
  uniqueVerifiedUserCount: number
  validComparisonCount: number
  comparisonPairs: ReadonlyArray<readonly [string, string]>
}
