import type {
  BattleAction,
  BattleOutcome,
  BracketSession,
  CandidatePair,
} from './types'

export interface CreateBracketSessionInput {
  candidateIds: readonly string[]
}

export type BattleTransition =
  | {
      accepted: true
      replayed: boolean
      outcome: BattleOutcome
      state: BracketSession
    }
  | {
      accepted: false
      replayed: false
      reason: 'invalid_pair' | 'stale_pair' | 'inactive_session' | 'event_id_conflict'
      state: BracketSession
    }

export function pairKey(candidateAId: string, candidateBId: string) {
  return JSON.stringify([candidateAId, candidateBId].sort())
}

export function createBracketSession({ candidateIds }: CreateBracketSessionInput): BracketSession {
  if (candidateIds.length !== 8 && candidateIds.length !== 16) {
    throw new Error('Bracket candidate count must be 8 or 16')
  }
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new Error('Bracket candidates must be unique')
  }

  return {
    candidateIds: [...candidateIds],
    status: 'active',
    generation: 0,
    generationAttempts: 0,
    generationAttemptBudget: candidateIds.length / 2,
    attemptedPairKeysInGeneration: [],
    pairAttempts: {},
    roundCandidateIds: [...candidateIds],
    roundWinners: {},
    acceptedComparisonCount: 0,
    eventOutcomes: {},
    eventFingerprints: {},
  }
}

export function getNextPair(state: BracketSession): CandidatePair | undefined {
  if (state.status !== 'active') return undefined

  for (let index = 0; index < state.roundCandidateIds.length; index += 2) {
    if (state.roundWinners[String(index)] !== undefined) continue
    const candidateAId = state.roundCandidateIds[index]
    const candidateBId = state.roundCandidateIds[index + 1]
    const key = pairKey(candidateAId, candidateBId)
    if (state.attemptedPairKeysInGeneration.includes(key)) continue
    if ((state.pairAttempts[key] ?? 0) >= 2) continue
    return { candidateAId, candidateBId }
  }

  return undefined
}

export function applyBattleAction(state: BracketSession, action: BattleAction): BattleTransition {
  const replayedOutcome = state.eventOutcomes[action.eventId]
  if (replayedOutcome !== undefined) {
    if (state.eventFingerprints[action.eventId] !== actionFingerprint(action)) {
      return { accepted: false, replayed: false, reason: 'event_id_conflict', state }
    }
    return { accepted: true, replayed: true, outcome: replayedOutcome, state }
  }
  if (state.status !== 'active') {
    return { accepted: false, replayed: false, reason: 'inactive_session', state }
  }
  if (!isValidPair(state, action.pair)) {
    return { accepted: false, replayed: false, reason: 'invalid_pair', state }
  }

  const currentPair = getNextPair(state)
  if (currentPair === undefined || pairKey(currentPair.candidateAId, currentPair.candidateBId) !== pairKey(action.pair.candidateAId, action.pair.candidateBId)) {
    return { accepted: false, replayed: false, reason: 'stale_pair', state }
  }

  const outcome = actionToOutcome(action)
  const key = pairKey(action.pair.candidateAId, action.pair.candidateBId)
  let nextState: BracketSession = {
    ...state,
    generationAttempts: state.generationAttempts + 1,
    attemptedPairKeysInGeneration: [...state.attemptedPairKeysInGeneration, key],
    pairAttempts: { ...state.pairAttempts, [key]: (state.pairAttempts[key] ?? 0) + 1 },
    eventOutcomes: { ...state.eventOutcomes, [action.eventId]: outcome },
    eventFingerprints: { ...state.eventFingerprints, [action.eventId]: actionFingerprint(action) },
  }

  if (outcome.kind === 'advanced') nextState = advanceRound(nextState, action.pair, outcome)
  if (nextState.status === 'active' && shouldStopCurrentRound(nextState)) {
    nextState = hasUnresolvedSlotWithRetry(nextState)
      ? { ...nextState, status: 'paused_needs_visits' }
      : { ...nextState, status: 'completed_without_winner' }
  }

  return { accepted: true, replayed: false, outcome, state: nextState }
}

export function resumeBracketSession(state: BracketSession): BracketSession {
  if (state.status !== 'paused_needs_visits') return state

  return {
    ...state,
    status: 'active',
    generation: state.generation + 1,
    generationAttempts: 0,
    attemptedPairKeysInGeneration: [],
  }
}

function isValidPair(state: BracketSession, pair: CandidatePair) {
  return pair.candidateAId !== pair.candidateBId
    && state.candidateIds.includes(pair.candidateAId)
    && state.candidateIds.includes(pair.candidateBId)
}

function actionToOutcome(action: BattleAction): BattleOutcome {
  if (action.type === 'neutral_skip' || action.choice === 'only_visited_a' || action.choice === 'only_visited_b') {
    return { kind: 'deferred', personalAdvance: false, ratingEligible: false }
  }

  const winnerId = action.choice === 'both_visited_prefer_a'
    ? action.pair.candidateAId
    : action.pair.candidateBId
  const loserId = winnerId === action.pair.candidateAId
    ? action.pair.candidateBId
    : action.pair.candidateAId
  return { kind: 'advanced', personalAdvance: true, ratingEligible: true, winnerId, loserId }
}

function actionFingerprint(action: BattleAction) {
  return action.type === 'neutral_skip'
    ? JSON.stringify([action.type, action.pair.candidateAId, action.pair.candidateBId])
    : JSON.stringify([action.type, action.pair.candidateAId, action.pair.candidateBId, action.choice])
}

function advanceRound(state: BracketSession, pair: CandidatePair, outcome: BattleOutcome): BracketSession {
  const pairIndex = findRoundPairIndex(state, pair)
  const roundWinners = { ...state.roundWinners, [String(pairIndex)]: outcome.winnerId as string }
  const slotCount = state.roundCandidateIds.length / 2
  const acceptedComparisonCount = state.acceptedComparisonCount + 1

  if (Object.keys(roundWinners).length !== slotCount) {
    return { ...state, roundWinners, acceptedComparisonCount }
  }

  const nextRoundCandidateIds = Array.from({ length: slotCount }, (_, index) => roundWinners[String(index * 2)])
  if (nextRoundCandidateIds.length === 1) {
    return {
      ...state,
      roundWinners,
      acceptedComparisonCount,
      status: 'completed',
      winnerId: nextRoundCandidateIds[0],
    }
  }

  return {
    ...state,
    roundCandidateIds: nextRoundCandidateIds,
    roundWinners: {},
    generationAttempts: 0,
    generationAttemptBudget: nextRoundCandidateIds.length / 2,
    attemptedPairKeysInGeneration: [],
    acceptedComparisonCount,
  }
}

function findRoundPairIndex(state: BracketSession, pair: CandidatePair) {
  const targetKey = pairKey(pair.candidateAId, pair.candidateBId)
  for (let index = 0; index < state.roundCandidateIds.length; index += 2) {
    if (pairKey(state.roundCandidateIds[index], state.roundCandidateIds[index + 1]) === targetKey) return index
  }
  return -1
}

function shouldStopCurrentRound(state: BracketSession) {
  return state.generationAttempts >= state.generationAttemptBudget || getNextPair(state) === undefined
}

function hasUnresolvedSlotWithRetry(state: BracketSession) {
  for (let index = 0; index < state.roundCandidateIds.length; index += 2) {
    if (state.roundWinners[String(index)] !== undefined) continue
    const key = pairKey(state.roundCandidateIds[index], state.roundCandidateIds[index + 1])
    if ((state.pairAttempts[key] ?? 0) < 2) return true
  }
  return false
}
