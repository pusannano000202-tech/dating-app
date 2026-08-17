import type { RatedComparison } from './types'

export const INITIAL_RATING = 1500
export const ELO_K_FACTOR = 16

export interface EloRatingResult {
  winnerId: string
  loserId: string
  winnerRating: number
  loserRating: number
  winnerDelta: number
  loserDelta: number
}

export function getCampusEatsEvidenceWeight({
  visitedCandidateCount,
  totalCandidateCount,
  validComparisonCount,
}: {
  visitedCandidateCount: number
  totalCandidateCount: number
  validComparisonCount: number
}): number {
  const coverage = totalCandidateCount > 0
    ? Math.min(1, Math.max(0, visitedCandidateCount / totalCandidateCount))
    : 0
  const comparisonDepth = Math.min(1, Math.max(0, validComparisonCount / 6))
  const weight = Math.min(1, 0.5 + coverage * 0.3 + comparisonDepth * 0.21)
  return Number((weight + Number.EPSILON).toFixed(2))
}

export function applyEloRating({ winnerId, loserId, winnerRating, loserRating, evidenceWeight = 1 }: RatedComparison): EloRatingResult {
  const expectedWinnerScore = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400))
  const safeEvidenceWeight = Math.min(1, Math.max(0.5, evidenceWeight))
  const winnerDelta = ELO_K_FACTOR * (1 - expectedWinnerScore) * safeEvidenceWeight

  return {
    winnerId,
    loserId,
    winnerRating: winnerRating + winnerDelta,
    loserRating: loserRating - winnerDelta,
    winnerDelta,
    loserDelta: -winnerDelta,
  }
}

export function getSemesterSeason({ year, month }: { year: number; month: number }) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Month must be between 1 and 12')
  if (month >= 3 && month <= 8) return `${year}-S1`
  return month >= 9 ? `${year}-S2` : `${year - 1}-S2`
}

export function carrySeasonRating({
  previousRating,
  wasPublic,
  isActive,
}: {
  previousRating: number
  wasPublic: boolean
  isActive: boolean
}) {
  return wasPublic && isActive
    ? INITIAL_RATING + 0.5 * (previousRating - INITIAL_RATING)
    : INITIAL_RATING
}
