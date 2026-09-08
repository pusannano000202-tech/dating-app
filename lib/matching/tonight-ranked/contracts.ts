import type { DepartmentAllocationIdentity } from '../department-identity'

export type TonightSex = 'male' | 'female'

export type TonightActivityId = string

/**
 * A round has exactly three activities. Their tuple order is also the final,
 * deterministic tie-break order after points and vote-count tie-breaks.
 */
export type TonightActivityTuple = readonly [TonightActivityId, TonightActivityId, TonightActivityId]

/** Server-only allocator input. Never return this shape to a client. */
export interface TonightAllocationApplicant extends DepartmentAllocationIdentity {
  applicantId: string
  sex: TonightSex
  age: number
  /** Normalized private appearance score, as an integer from 0 through 10,000. */
  appearanceScoreBp: number
  /** An exact permutation of the current round's three activity ids. */
  activityRanking: TonightActivityTuple
  /** Null means a solo application. A non-null group must contain 1-3 people. */
  friendBundleId: string | null
}

export interface TonightAllocationLimits {
  /** Server-owned fail-closed search ceiling. Intended mainly for deterministic tests. */
  maxEvaluations?: number
}

export interface TonightAllocationInput {
  activities: TonightActivityTuple
  applicants: readonly TonightAllocationApplicant[]
  limits?: TonightAllocationLimits
}

export type TonightAllocationIssueCode =
  | 'invalid_root_input'
  | 'activities_not_exactly_three'
  | 'activities_not_unique'
  | 'invalid_activity_id'
  | 'invalid_applicants'
  | 'invalid_applicant_id'
  | 'duplicate_applicant_id'
  | 'invalid_sex'
  | 'invalid_age'
  | 'invalid_appearance_score'
  | 'invalid_activity_ranking'
  | 'invalid_friend_bundle_id'
  | 'invalid_department_identity'
  | 'invalid_companion_application_id'
  | 'friend_bundle_too_large'
  | 'invalid_evaluation_budget'

export interface TonightAllocationIssue {
  code: TonightAllocationIssueCode
  applicantId?: string
}

export interface TonightActivityTotal {
  activityId: TonightActivityId
  points: number
  firstChoiceCount: number
  secondChoiceCount: number
}

export interface TonightActivityResolution {
  activityId: TonightActivityId
  /** Aggregated totals only. Individual ballots are intentionally absent. */
  totals: readonly TonightActivityTotal[]
}

export interface TonightTeamQuality {
  minimumPairQualityBp: number
  totalPairQualityBp: number
  averagePairQualityBp: number
  pairCount: number
}

export interface TonightAllocatedTeam {
  memberIds: readonly string[]
  sexCounts: Readonly<Record<TonightSex, number>>
  activity: TonightActivityResolution
  /** Aggregate server-side diagnostics; no individual score is exposed. */
  quality: TonightTeamQuality
}

export type TonightWaitlistReason = 'no_feasible_team' | 'budget_exhausted'

export interface TonightWaitlistedUnit {
  /** A friend unit is represented by its members, not by its private bundle reference. */
  memberIds: readonly string[]
  reason: TonightWaitlistReason
}

export interface TonightAllocationDiagnostics {
  evaluations: number
  maxEvaluations: number
  passesCompleted: number
  repairAttempts: number
}

export type TonightAllocationStatus = 'allocated' | 'invalid_input' | 'budget_exhausted'

/**
 * Server-owned, serialization-minimized result. This is not a public DTO; it
 * deliberately omits age, appearance, friend-bundle ids, and individual
 * activity rankings so downstream code cannot leak them by simple spreading.
 */
export interface TonightAllocationResult {
  status: TonightAllocationStatus
  teams: readonly TonightAllocatedTeam[]
  waitlistedUnits: readonly TonightWaitlistedUnit[]
  issues: readonly TonightAllocationIssue[]
  allocationSignature: string
  diagnostics: TonightAllocationDiagnostics
}

export interface TonightPairQuality {
  appearanceCompatibilityBp: number
  ageCompatibilityBp: number
  qualityBp: number
}

export interface TonightTeamObjective extends TonightTeamQuality {
  signature: string
}
