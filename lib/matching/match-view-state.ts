export type MatchViewState =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'inactive'
  | 'unknown'

export function getMatchViewState(status: string | null | undefined): MatchViewState {
  if (status === 'pending') return 'pending'
  if (status === 'confirmed') return 'confirmed'
  if (status === 'completed') return 'completed'
  if (status === 'cancelled' || status === 'no_show') return 'inactive'
  return 'unknown'
}

export function isActiveMatchStatus(status: string | null | undefined): boolean {
  const state = getMatchViewState(status)
  return state === 'pending' || state === 'confirmed'
}
