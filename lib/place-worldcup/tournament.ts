import type { ContentRecordInput } from '@/lib/content-history/contract'
import type { PlaceCandidate, PlaceCategory } from './contract'

type Selection = Readonly<{ winnerId: string; loserId: string }>
type SetupState = Readonly<{
  status: 'setup'
  candidates: readonly PlaceCandidate[]
  selectedIds: readonly string[]
  error?: 'minimum-two'
}>
type BattleState = Readonly<{
  status: 'battle'
  candidates: readonly PlaceCandidate[]
  candidateIds: readonly string[]
  round: number
  roundEntries: readonly string[]
  roundWinners: readonly string[]
  pairIndex: number
  pair: readonly [string, string]
  selections: readonly Selection[]
}>
type ResultState = Readonly<{
  status: 'result'
  candidates: readonly PlaceCandidate[]
  candidateIds: readonly string[]
  winnerId: string
  selections: readonly Selection[]
}>

export type PlaceWorldcupState = SetupState | BattleState | ResultState
export type PlaceWorldcupAction =
  | Readonly<{ type: 'toggle-visited'; candidateId: string }>
  | Readonly<{ type: 'start' }>
  | Readonly<{ type: 'pick'; candidateId: string }>
  | Readonly<{ type: 'restart' }>

export function createPlaceWorldcupState(candidates: readonly PlaceCandidate[]): PlaceWorldcupState {
  const unique = new Map(candidates.map(candidate => [candidate.id, Object.freeze({ ...candidate })]))
  return Object.freeze({ status: 'setup', candidates: Object.freeze([...unique.values()]), selectedIds: Object.freeze([]) })
}

export function placeWorldcupReducer(state: PlaceWorldcupState, action: PlaceWorldcupAction): PlaceWorldcupState {
  if (action.type === 'restart') return createPlaceWorldcupState(state.candidates)
  if (state.status === 'setup') {
    if (action.type === 'toggle-visited') {
      if (!state.candidates.some(candidate => candidate.id === action.candidateId)) return state
      const selectedIds = state.selectedIds.includes(action.candidateId)
        ? state.selectedIds.filter(id => id !== action.candidateId)
        : [...state.selectedIds, action.candidateId]
      return Object.freeze({ ...state, selectedIds: Object.freeze(selectedIds), error: undefined })
    }
    if (action.type === 'start') {
      if (state.selectedIds.length < 2) return Object.freeze({ ...state, error: 'minimum-two' })
      const entries = state.candidates.filter(candidate => state.selectedIds.includes(candidate.id)).map(candidate => candidate.id)
      return battleState(state.candidates, entries, 1, [], 0, [])
    }
    return state
  }
  if (state.status !== 'battle' || action.type !== 'pick' || !state.pair.includes(action.candidateId)) return state
  const loserId = state.pair[0] === action.candidateId ? state.pair[1] : state.pair[0]
  const selections = [...state.selections, { winnerId: action.candidateId, loserId }]
  const winners = [...state.roundWinners, action.candidateId]
  const nextPairIndex = state.pairIndex + 2
  if (nextPairIndex + 1 < state.roundEntries.length) {
    return battleState(state.candidates, state.roundEntries, state.round, winners, nextPairIndex, selections, state.candidateIds)
  }
  if (nextPairIndex < state.roundEntries.length) winners.push(state.roundEntries[nextPairIndex])
  if (winners.length === 1) {
    return Object.freeze({
      status: 'result', candidates: state.candidates, candidateIds: state.candidateIds,
      winnerId: winners[0], selections: Object.freeze(selections),
    })
  }
  return battleState(state.candidates, winners, state.round + 1, [], 0, selections, state.candidateIds)
}

function battleState(
  candidates: readonly PlaceCandidate[], roundEntries: readonly string[], round: number,
  roundWinners: readonly string[], pairIndex: number, selections: readonly Selection[],
  originalIds: readonly string[] = roundEntries,
): BattleState {
  return Object.freeze({
    status: 'battle', candidates, candidateIds: Object.freeze([...originalIds]), round,
    roundEntries: Object.freeze([...roundEntries]), roundWinners: Object.freeze([...roundWinners]), pairIndex,
    pair: Object.freeze([roundEntries[pairIndex], roundEntries[pairIndex + 1]]) as readonly [string, string],
    selections: Object.freeze([...selections]),
  })
}

export function resultSnapshot(input: {
  state: ResultState
  category: PlaceCategory
  label: string
  catalogRevision: string
  runId: string
  completedAt: string
}): ContentRecordInput {
  const included = new Set(input.state.candidateIds)
  return {
    sourceKey: `places:${input.category}:${input.catalogRevision}:${input.runId}`,
    kind: 'places',
    category: input.category,
    title: `내 ${input.label} 1위`,
    winnerId: input.state.winnerId,
    candidates: input.state.candidates.filter(candidate => included.has(candidate.id)).map(({ id, name }) => ({ id, name })),
    selections: input.state.selections.map(selection => ({ ...selection })),
    completedAt: input.completedAt,
  }
}
