import { applyEloRating, INITIAL_RATING } from './rating'

export interface PersonalRatingState {
  version: 1
  ratings: Readonly<Record<string, number>>
  validComparisonCount: number
  appliedEventIds: readonly string[]
}

export interface PersonalRatingEvent {
  eventId: string
  winnerId: string
  loserId: string
}

export interface PersonalRatingTransition {
  applied: boolean
  state: PersonalRatingState
  winnerDelta: number
  loserDelta: number
}

export function createPersonalRatingState(candidateIds: readonly string[]): PersonalRatingState {
  return {
    version: 1,
    ratings: Object.fromEntries([...new Set(candidateIds)].map((candidateId) => [candidateId, INITIAL_RATING])),
    validComparisonCount: 0,
    appliedEventIds: [],
  }
}

export function restorePersonalRatingState(value: unknown, candidateIds: readonly string[]): PersonalRatingState {
  const initial = createPersonalRatingState(candidateIds)
  if (!value || typeof value !== 'object') return initial

  const stored = value as Partial<PersonalRatingState>
  if (stored.version !== 1 || !stored.ratings || typeof stored.ratings !== 'object') return initial

  const ratings = Object.fromEntries(candidateIds.map((candidateId) => {
    const rating = stored.ratings?.[candidateId]
    return [candidateId, typeof rating === 'number' && Number.isFinite(rating) ? Math.round(rating) : INITIAL_RATING]
  }))
  const validComparisonCount = typeof stored.validComparisonCount === 'number'
    && Number.isInteger(stored.validComparisonCount)
    && stored.validComparisonCount >= 0
    ? stored.validComparisonCount
    : 0
  const appliedEventIds = Array.isArray(stored.appliedEventIds)
    ? [...new Set(stored.appliedEventIds.filter((eventId): eventId is string => typeof eventId === 'string'))]
    : []

  return { version: 1, ratings, validComparisonCount, appliedEventIds }
}

export function applyPersonalRatingEvent(
  state: PersonalRatingState,
  event: PersonalRatingEvent,
): PersonalRatingTransition {
  const winnerRating = state.ratings[event.winnerId]
  const loserRating = state.ratings[event.loserId]
  const invalid = event.winnerId === event.loserId
    || winnerRating === undefined
    || loserRating === undefined
    || state.appliedEventIds.includes(event.eventId)

  if (invalid) return { applied: false, state, winnerDelta: 0, loserDelta: 0 }

  const result = applyEloRating({
    winnerId: event.winnerId,
    loserId: event.loserId,
    winnerRating,
    loserRating,
  })
  const nextWinnerRating = Math.round(result.winnerRating)
  const nextLoserRating = Math.round(result.loserRating)

  return {
    applied: true,
    winnerDelta: nextWinnerRating - winnerRating,
    loserDelta: nextLoserRating - loserRating,
    state: {
      version: 1,
      ratings: {
        ...state.ratings,
        [event.winnerId]: nextWinnerRating,
        [event.loserId]: nextLoserRating,
      },
      validComparisonCount: state.validComparisonCount + 1,
      appliedEventIds: [...state.appliedEventIds, event.eventId],
    },
  }
}
