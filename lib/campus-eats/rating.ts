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

export function applyEloRating({ winnerId, loserId, winnerRating, loserRating }: RatedComparison): EloRatingResult {
  const expectedWinnerScore = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400))
  const winnerDelta = ELO_K_FACTOR * (1 - expectedWinnerScore)

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
