import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyBattleAction,
  createBracketSession,
  getNextPair,
  pairKey,
  resumeBracketSession,
} from '../../lib/campus-eats/bracket'
import { canPublishCampusRanking } from '../../lib/campus-eats/eligibility'
import {
  applyPersonalRatingEvent,
  createPersonalRatingState,
  restorePersonalRatingState,
} from '../../lib/campus-eats/personal-rating'
import { applyEloRating, carrySeasonRating, getSemesterSeason } from '../../lib/campus-eats/rating'
import { PNU_CAMPUS_EATS_CATEGORIES } from '../../lib/campus-eats/fixtures/pnu-categories'
import type { BattleAction, CandidateChoice } from '../../lib/campus-eats/types'

function ids(count: number) {
  return Array.from({ length: count }, (_, index) => `restaurant-${index + 1}`)
}

test('personal device ratings apply a valid event once and ignore its replay', () => {
  const initial = createPersonalRatingState(['restaurant-a', 'restaurant-b'])
  const first = applyPersonalRatingEvent(initial, {
    eventId: 'personal-event-1',
    winnerId: 'restaurant-a',
    loserId: 'restaurant-b',
  })

  assert.equal(first.applied, true)
  assert.equal(first.winnerDelta, 8)
  assert.equal(first.loserDelta, -8)
  assert.equal(first.state.ratings['restaurant-a'], 1508)
  assert.equal(first.state.ratings['restaurant-b'], 1492)
  assert.equal(first.state.validComparisonCount, 1)

  const replay = applyPersonalRatingEvent(first.state, {
    eventId: 'personal-event-1',
    winnerId: 'restaurant-a',
    loserId: 'restaurant-b',
  })

  assert.equal(replay.applied, false)
  assert.equal(replay.winnerDelta, 0)
  assert.equal(replay.loserDelta, 0)
  assert.deepEqual(replay.state, first.state)
})

test('personal device ratings reject unknown or self comparisons without mutation', () => {
  const initial = createPersonalRatingState(['restaurant-a', 'restaurant-b'])

  for (const event of [
    { eventId: 'unknown', winnerId: 'restaurant-a', loserId: 'restaurant-c' },
    { eventId: 'self', winnerId: 'restaurant-a', loserId: 'restaurant-a' },
  ]) {
    const result = applyPersonalRatingEvent(initial, event)
    assert.equal(result.applied, false)
    assert.deepEqual(result.state, initial)
  }
})

test('personal device ratings restore known candidates and discard stale candidate data', () => {
  const restored = restorePersonalRatingState({
    version: 1,
    ratings: { 'restaurant-a': 1512, 'stale-restaurant': 1800 },
    validComparisonCount: 3,
    appliedEventIds: ['event-1', 'event-1', 17],
  }, ['restaurant-a', 'restaurant-b'])

  assert.deepEqual(restored, {
    version: 1,
    ratings: { 'restaurant-a': 1512, 'restaurant-b': 1500 },
    validComparisonCount: 3,
    appliedEventIds: ['event-1'],
  })

  assert.deepEqual(
    restorePersonalRatingState({ broken: true }, ['restaurant-a']),
    createPersonalRatingState(['restaurant-a']),
  )
})

function candidateAction(
  eventId: string,
  candidateAId: string,
  candidateBId: string,
  choice: CandidateChoice = 'both_visited_prefer_a',
): BattleAction {
  return {
    type: 'candidate_choice',
    eventId,
    pair: { candidateAId, candidateBId },
    choice,
  }
}

function skipAction(eventId: string, candidateAId: string, candidateBId: string): BattleAction {
  return {
    type: 'neutral_skip',
    eventId,
    pair: { candidateAId, candidateBId },
  }
}

test('PNU category fixtures expose 13 verified places per category without held candidates', () => {
  assert.deepEqual(PNU_CAMPUS_EATS_CATEGORIES.map((category) => category.id), ['donkatsu', 'coffee'])

  for (const category of PNU_CAMPUS_EATS_CATEGORIES) {
    assert.equal(category.candidates.length, 13, `${category.label} active candidate count`)
    assert.ok(category.candidates.every((candidate) => candidate.coordinateStatus === 'search_verified'))
    assert.ok(category.candidates.every((candidate) => candidate.roadAddress.startsWith('부산 금정구 ')))
    assert.equal(new Set(category.candidates.map((candidate) => candidate.id)).size, 13)
  }

  const names = PNU_CAMPUS_EATS_CATEGORIES.flatMap((category) => category.candidates.map((candidate) => candidate.name))
  for (const heldName of ['카츠면', '동경생돈까스네', '이태리삼촌', '쑝쑝돈까스 부산대점']) {
    assert.equal(names.includes(heldName), false, `${heldName} must stay out of active candidates`)
  }
})

function resolveNext(state: ReturnType<typeof createBracketSession>, eventId: string) {
  const pair = getNextPair(state)
  assert.ok(pair)
  return applyBattleAction(state, candidateAction(eventId, pair.candidateAId, pair.candidateBId))
}

function requireAccepted(result: ReturnType<typeof applyBattleAction>) {
  if (!result.accepted) assert.fail(`Expected accepted action, received ${result.reason}`)
  return result
}

test('four candidate choices classify only both-visited selections as a winner and rating eligible', () => {
  const choices: Array<{ choice: CandidateChoice; expectedWinner: string | undefined; ratingEligible: boolean }> = [
    { choice: 'both_visited_prefer_a', expectedWinner: 'a', ratingEligible: true },
    { choice: 'both_visited_prefer_b', expectedWinner: 'b', ratingEligible: true },
    { choice: 'only_visited_a', expectedWinner: undefined, ratingEligible: false },
    { choice: 'only_visited_b', expectedWinner: undefined, ratingEligible: false },
  ]

  for (const item of choices) {
    const result = requireAccepted(applyBattleAction(
      createBracketSession({ candidateIds: ids(8) }),
      candidateAction(`choice-${item.choice}`, 'restaurant-1', 'restaurant-2', item.choice),
    ))

    assert.equal(result.outcome.winnerId, item.expectedWinner === 'a' ? 'restaurant-1' : item.expectedWinner === 'b' ? 'restaurant-2' : undefined)
    assert.equal(result.outcome.personalAdvance, item.expectedWinner !== undefined)
    assert.equal(result.outcome.ratingEligible, item.ratingEligible)
  }
})

test('neutral skip is a separate control that defers without a winner or rating intent', () => {
  const start = createBracketSession({ candidateIds: ids(8) })
  const result = requireAccepted(applyBattleAction(
    start,
    skipAction('skip-1', 'restaurant-1', 'restaurant-2'),
  ))

  assert.equal(result.outcome.kind, 'deferred')
  assert.equal(result.outcome.winnerId, undefined)
  assert.equal(result.outcome.personalAdvance, false)
  assert.equal(result.outcome.ratingEligible, false)
  assert.equal(result.state.status, 'active')
  assert.deepEqual(getNextPair(result.state), { candidateAId: 'restaurant-3', candidateBId: 'restaurant-4' })
})

test('pairKey treats A-B and B-A as the same pair', () => {
  assert.equal(pairKey('restaurant-a', 'restaurant-b'), pairKey('restaurant-b', 'restaurant-a'))
})

test('an unordered action is accepted and its A choice advances the action A candidate', () => {
  const result = applyBattleAction(
    createBracketSession({ candidateIds: ids(8) }),
    candidateAction('unordered', 'restaurant-2', 'restaurant-1'),
  )

  assert.equal(result.accepted, true)
  assert.equal(result.outcome.winnerId, 'restaurant-2')
})

test('replaying an event returns its saved outcome without changing state again', () => {
  const start = createBracketSession({ candidateIds: ids(8) })
  const action = candidateAction('event-once', 'restaurant-1', 'restaurant-2')
  const first = requireAccepted(applyBattleAction(start, action))
  const replay = requireAccepted(applyBattleAction(first.state, action))

  assert.equal(first.accepted, true)
  assert.equal(replay.replayed, true)
  assert.deepEqual(replay.outcome, first.outcome)
  assert.deepEqual(replay.state, first.state)
})

test('reusing an event id with different action data is rejected instead of replayed', () => {
  const start = createBracketSession({ candidateIds: ids(8) })
  const first = requireAccepted(applyBattleAction(start, candidateAction('event-id', 'restaurant-1', 'restaurant-2')))
  const conflict = applyBattleAction(
    first.state,
    candidateAction('event-id', 'restaurant-3', 'restaurant-4', 'both_visited_prefer_b'),
  )

  assert.deepEqual(conflict, {
    accepted: false,
    replayed: false,
    reason: 'event_id_conflict',
    state: first.state,
  })
})

test('stale, inactive, and invalid pairs are rejected without mutation', () => {
  const start = createBracketSession({ candidateIds: ids(8) })
  const stale = applyBattleAction(start, candidateAction('stale', 'restaurant-3', 'restaurant-4'))
  const invalid = applyBattleAction(start, candidateAction('invalid', 'restaurant-1', 'not-in-session'))
  let paused = start
  for (let index = 0; index < 4; index += 1) {
    const pair = getNextPair(paused)
    assert.ok(pair)
    paused = applyBattleAction(paused, skipAction(`pause-${index}`, pair.candidateAId, pair.candidateBId)).state
  }
  const inactive = applyBattleAction(paused, candidateAction('inactive', 'restaurant-3', 'restaurant-4'))

  assert.deepEqual(stale, { accepted: false, replayed: false, reason: 'stale_pair', state: start })
  assert.deepEqual(invalid, { accepted: false, replayed: false, reason: 'invalid_pair', state: start })
  assert.equal(inactive.accepted, false)
  assert.equal(inactive.reason, 'inactive_session')
  assert.deepEqual(inactive.state, paused)
})

test('generation attempt budgets use current round slots: four for eight and eight for sixteen', () => {
  assert.equal(createBracketSession({ candidateIds: ids(8) }).generationAttemptBudget, 4)
  assert.equal(createBracketSession({ candidateIds: ids(16) }).generationAttemptBudget, 8)
})

test('eight valid comparisons resolve an eight-candidate bracket in seven comparisons', () => {
  let state = createBracketSession({ candidateIds: ids(8) })
  for (let index = 0; index < 7; index += 1) {
    state = resolveNext(state, `eight-${index}`).state
  }

  assert.equal(state.status, 'completed')
  assert.equal(state.winnerId, 'restaurant-1')
  assert.equal(state.acceptedComparisonCount, 7)
})

test('fifteen valid comparisons resolve a sixteen-candidate bracket', () => {
  let state = createBracketSession({ candidateIds: ids(16) })
  for (let index = 0; index < 15; index += 1) {
    state = resolveNext(state, `sixteen-${index}`).state
  }

  assert.equal(state.status, 'completed')
  assert.equal(state.acceptedComparisonCount, 15)
})

test('only-visited and skip defer each first-round pair then pause without a loop', () => {
  let state = createBracketSession({ candidateIds: ids(8) })
  const actions: CandidateChoice[] = ['only_visited_a', 'only_visited_b']

  for (let index = 0; index < 4; index += 1) {
    const pair = getNextPair(state)
    assert.ok(pair)
    const action = index % 2 === 0
      ? candidateAction(`only-${index}`, pair.candidateAId, pair.candidateBId, actions[index % 2])
      : skipAction(`skip-${index}`, pair.candidateAId, pair.candidateBId)
    state = applyBattleAction(state, action).state
  }

  assert.equal(state.status, 'paused_needs_visits')
  assert.equal(getNextPair(state), undefined)
  assert.equal(state.acceptedComparisonCount, 0)
  assert.equal(state.generationAttempts, 4)
})

test('resume creates a new generation and keeps each pair to two session attempts', () => {
  let state = createBracketSession({ candidateIds: ids(8) })
  for (let index = 0; index < 4; index += 1) {
    const pair = getNextPair(state)
    assert.ok(pair)
    state = applyBattleAction(state, skipAction(`g0-${index}`, pair.candidateAId, pair.candidateBId)).state
  }
  assert.equal(state.status, 'paused_needs_visits')

  state = resumeBracketSession(state)
  assert.equal(state.status, 'active')
  assert.equal(state.generation, 1)
  assert.equal(state.generationAttempts, 0)

  state = applyBattleAction(state, skipAction('g1', 'restaurant-1', 'restaurant-2')).state
  assert.equal(state.pairAttempts[pairKey('restaurant-1', 'restaurant-2')], 2)
})

test('a fully deferred eight-candidate session finishes without a personal winner after two generations', () => {
  let state = createBracketSession({ candidateIds: ids(8) })

  for (let index = 0; index < 4; index += 1) {
    const pair = getNextPair(state)
    assert.ok(pair)
    state = applyBattleAction(state, skipAction(`first-${index}`, pair.candidateAId, pair.candidateBId)).state
  }
  state = resumeBracketSession(state)
  for (let index = 0; index < 4; index += 1) {
    const pair = getNextPair(state)
    assert.ok(pair)
    state = applyBattleAction(state, skipAction(`second-${index}`, pair.candidateAId, pair.candidateBId)).state
  }

  assert.equal(state.status, 'completed_without_winner')
  assert.equal(state.winnerId, undefined)
  assert.equal(state.acceptedComparisonCount, 0)
})

test('Elo uses 1500/K16 at equal rating and conserves total rating', () => {
  const result = applyEloRating({ winnerId: 'a', loserId: 'b', winnerRating: 1500, loserRating: 1500 })

  assert.equal(result.winnerRating, 1508)
  assert.equal(result.loserRating, 1492)
  assert.equal(result.winnerRating + result.loserRating, 3000)
})

test('Elo awards less for a favorite win and more for an upset while preserving the sum', () => {
  const favorite = applyEloRating({ winnerId: 'favorite', loserId: 'underdog', winnerRating: 1700, loserRating: 1500 })
  const upset = applyEloRating({ winnerId: 'underdog', loserId: 'favorite', winnerRating: 1500, loserRating: 1700 })

  assert.ok(favorite.winnerDelta < 8)
  assert.ok(upset.winnerDelta > 8)
  assert.equal(favorite.winnerRating + favorite.loserRating, 3200)
  assert.equal(upset.winnerRating + upset.loserRating, 3200)
})

test('semester boundaries and carryover retain only public active candidates', () => {
  assert.equal(getSemesterSeason({ year: 2026, month: 3 }), '2026-S1')
  assert.equal(getSemesterSeason({ year: 2026, month: 8 }), '2026-S1')
  assert.equal(getSemesterSeason({ year: 2026, month: 9 }), '2026-S2')
  assert.equal(getSemesterSeason({ year: 2027, month: 2 }), '2026-S2')
  assert.equal(carrySeasonRating({ previousRating: 1600, wasPublic: true, isActive: true }), 1550)
  assert.equal(carrySeasonRating({ previousRating: 1600, wasPublic: false, isActive: true }), 1500)
  assert.equal(carrySeasonRating({ previousRating: 1600, wasPublic: true, isActive: false }), 1500)
})

function connectedPairs(candidateIds: readonly string[]) {
  return candidateIds.slice(1).map((candidateId, index) => [candidateIds[index], candidateId] as const)
}

function publishableInput() {
  const candidateIds = ids(8)
  return {
    candidateIds,
    publicCandidateIds: candidateIds.slice(0, 5),
    uniqueVerifiedUserCount: 30,
    validComparisonCount: 50,
    comparisonPairs: connectedPairs(candidateIds).concat([
      ['restaurant-1', 'restaurant-3'],
      ['restaurant-1', 'restaurant-4'],
      ['restaurant-1', 'restaurant-5'],
      ['restaurant-1', 'restaurant-6'],
      ['restaurant-2', 'restaurant-4'],
      ['restaurant-2', 'restaurant-5'],
      ['restaurant-2', 'restaurant-6'],
      ['restaurant-2', 'restaurant-7'],
      ['restaurant-3', 'restaurant-5'],
      ['restaurant-3', 'restaurant-6'],
      ['restaurant-3', 'restaurant-7'],
      ['restaurant-4', 'restaurant-6'],
      ['restaurant-4', 'restaurant-7'],
      ['restaurant-4', 'restaurant-8'],
      ['restaurant-5', 'restaurant-7'],
      ['restaurant-5', 'restaurant-8'],
      ['restaurant-6', 'restaurant-8'],
    ]),
  }
}

test('ranking publication passes exactly at every boundary', () => {
  const result = canPublishCampusRanking(publishableInput())

  assert.equal(result.eligible, true)
  assert.deepEqual(result.reasons, [])
})

test('ranking publication reports each numeric boundary failure', () => {
  const base = publishableInput()
  const result = canPublishCampusRanking({
    ...base,
    candidateIds: base.candidateIds.slice(0, 7),
    publicCandidateIds: base.publicCandidateIds.slice(0, 4),
    uniqueVerifiedUserCount: 29,
    validComparisonCount: 49,
  })

  assert.deepEqual(result.reasons, [
    'not_enough_verified_candidates',
    'not_enough_verified_users',
    'not_enough_valid_comparisons',
    'not_enough_public_candidates',
  ])
})

test('ranking publication rejects a disconnected comparison graph', () => {
  const base = publishableInput()
  const result = canPublishCampusRanking({
    ...base,
    comparisonPairs: base.comparisonPairs.filter(([a, b]) => a !== 'restaurant-8' && b !== 'restaurant-8'),
  })

  assert.equal(result.eligible, false)
  assert.ok(result.reasons.includes('comparison_graph_disconnected'))
})

test('eight candidates require at least four distinct opponents, not eight', () => {
  const base = publishableInput()
  const exactlyFourOpponents = canPublishCampusRanking(base)
  const onlyThreeOpponents = canPublishCampusRanking({
    ...base,
    comparisonPairs: [
      ['restaurant-1', 'restaurant-2'],
      ['restaurant-1', 'restaurant-3'],
      ['restaurant-1', 'restaurant-4'],
      ['restaurant-2', 'restaurant-3'],
      ['restaurant-2', 'restaurant-4'],
      ['restaurant-3', 'restaurant-4'],
      ['restaurant-5', 'restaurant-6'],
      ['restaurant-5', 'restaurant-7'],
      ['restaurant-5', 'restaurant-8'],
      ['restaurant-6', 'restaurant-7'],
      ['restaurant-6', 'restaurant-8'],
      ['restaurant-7', 'restaurant-8'],
      ['restaurant-4', 'restaurant-5'],
      ['restaurant-4', 'restaurant-6'],
      ['restaurant-4', 'restaurant-7'],
      ['restaurant-4', 'restaurant-8'],
    ],
  })

  assert.equal(exactlyFourOpponents.eligible, true)
  assert.ok(onlyThreeOpponents.reasons.includes('not_enough_distinct_opponents'))
})
