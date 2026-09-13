import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PLACE_CATEGORIES,
  PlaceInputError,
  createPlaceWorldcupState,
  expectedPlaceAccountMatches,
  parsePlaceCatalog,
  parsePlaceOperatorReview,
  parsePlaceQueue,
  parsePlaceSuggestion,
  placeWorldcupReducer,
  resultSnapshot,
  suggestionRpcPayload,
} from '../../lib/place-worldcup'

const candidates = [
  { id: '11111111-1111-4111-8111-111111111111', name: '한 곳', address: '부산 금정구 1', mapQuery: '부산대 한 곳' },
  { id: '22222222-2222-4222-8222-222222222222', name: '두 곳', address: '부산 금정구 2', mapQuery: '부산대 두 곳' },
  { id: '33333333-3333-4333-8333-333333333333', name: '세 곳', address: '부산 금정구 3', mapQuery: '부산대 세 곳' },
]

test('place categories are the approved PC, gym and board-game lanes', () => {
  assert.deepEqual(PLACE_CATEGORIES.map(item => item.id), ['pc', 'gym', 'boardgame'])
})

test('a mutation account lease fails closed when the server cookie belongs to another account', () => {
  const accountA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const accountB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  assert.equal(expectedPlaceAccountMatches(accountA, accountA), true)
  assert.equal(expectedPlaceAccountMatches(accountA, accountB), false)
  assert.equal(expectedPlaceAccountMatches(null, accountB), false)
})

test('catalog parser keeps unavailable states distinct and only exposes candidates when ready', () => {
  const ready = parsePlaceCatalog({
    category: 'boardgame', state: 'ready', required_minimum: 2, candidate_count: 3,
    catalog_revision: 'abc123', candidates: candidates.map(item => ({
      id: item.id, name: item.name, address: item.address, map_query: item.mapQuery,
      verified_at: '2026-09-09T00:00:00Z', review_due_at: '2026-12-08T00:00:00Z',
    })),
  })
  assert.equal(ready.state, 'ready')
  assert.equal(ready.candidates.length, 3)
  for (const state of ['under_review', 'stale', 'insufficient'] as const) {
    const parsed = parsePlaceCatalog({
      category: 'pc', state, required_minimum: 2, candidate_count: 0,
      catalog_revision: 'none', candidates: [],
    })
    assert.equal(parsed.state, state)
    assert.deepEqual(parsed.candidates, [])
  }
  assert.throws(() => parsePlaceCatalog({
    category: 'pc', state: 'insufficient', required_minimum: 2, candidate_count: 65,
    catalog_revision: 'none', candidates: [],
  }), PlaceInputError, 'candidate_count always means candidates included in this response')
})

test('a real bracket requires two visited candidates and records each head-to-head choice', () => {
  let state = createPlaceWorldcupState(candidates)
  state = placeWorldcupReducer(state, { type: 'toggle-visited', candidateId: candidates[0].id })
  state = placeWorldcupReducer(state, { type: 'start' })
  assert.equal(state.status, 'setup', 'one visited place cannot start')
  state = placeWorldcupReducer(state, { type: 'toggle-visited', candidateId: candidates[1].id })
  state = placeWorldcupReducer(state, { type: 'toggle-visited', candidateId: candidates[2].id })
  state = placeWorldcupReducer(state, { type: 'start' })
  assert.equal(state.status, 'battle')
  if (state.status !== 'battle') return
  const firstWinner = state.pair[0]
  state = placeWorldcupReducer(state, { type: 'pick', candidateId: firstWinner })
  assert.equal(state.status, 'battle')
  if (state.status !== 'battle') return
  state = placeWorldcupReducer(state, { type: 'pick', candidateId: state.pair[0] })
  assert.equal(state.status, 'result')
  if (state.status !== 'result') return
  assert.equal(state.selections.length, 2)
  assert.equal(state.winnerId, firstWinner)
})

test('completed results become private places history snapshots without public statistics', () => {
  let state = createPlaceWorldcupState(candidates.slice(0, 2))
  for (const candidate of candidates.slice(0, 2)) state = placeWorldcupReducer(state, { type: 'toggle-visited', candidateId: candidate.id })
  state = placeWorldcupReducer(state, { type: 'start' })
  if (state.status !== 'battle') return assert.fail('battle expected')
  state = placeWorldcupReducer(state, { type: 'pick', candidateId: state.pair[1] })
  if (state.status !== 'result') return assert.fail('result expected')
  const snapshot = resultSnapshot({
    state, category: 'boardgame', label: '보드게임방', catalogRevision: 'abc123',
    runId: '44444444-4444-4444-8444-444444444444', completedAt: '2026-09-09T12:00:00.000Z',
  })
  assert.equal(snapshot.kind, 'places')
  assert.equal(snapshot.sourceKey, 'places:boardgame:abc123:44444444-4444-4444-8444-444444444444')
  assert.equal(snapshot.winnerId, candidates[1].id)
  assert.equal(snapshot.selections.length, 1)
  assert.equal('publicVotes' in snapshot, false)
})

test('suggestions reject extra fields, non-https and local URLs, and incomplete corrections', () => {
  const valid = {
    kind: 'new', category: 'pc', targetCandidateId: null, placeName: '새 장소',
    address: '부산 금정구 대학로 1', sourceUrl: 'https://example.com/store', note: '',
    idempotencyKey: '55555555-5555-4555-8555-555555555555',
  }
  assert.deepEqual(parsePlaceSuggestion(valid), valid)
  for (const bad of [
    { ...valid, sourceUrl: 'http://example.com/store' },
    { ...valid, sourceUrl: 'https://127.0.0.1/store' },
    { ...valid, sourceUrl: 'https://localhost/store' },
    { ...valid, unexpected: true },
    { ...valid, kind: 'correction', targetCandidateId: null },
  ]) assert.throws(() => parsePlaceSuggestion(bad), PlaceInputError)
  assert.deepEqual(suggestionRpcPayload(parsePlaceSuggestion(valid)), {
    kind: 'new', category: 'pc', target_candidate_id: null, place_name: '새 장소',
    address: '부산 금정구 대학로 1', source_url: 'https://example.com/store', note: '',
    idempotency_key: valid.idempotencyKey,
  })
})

test('operator queue and review contracts are strict and revision-bound', () => {
  const id = '66666666-6666-4666-8666-666666666666'
  const key = '77777777-7777-4777-8777-777777777777'
  const queue = parsePlaceQueue({ items: [{
    entity_kind: 'candidate', id, kind: 'new', category: 'boardgame', target_candidate_id: null,
    target_candidate_revision: null,
    name: '검수 장소', address: '부산 금정구', source_url: 'https://example.com/store',
    note: '직접 확인 필요', revision: 1, created_at: '2026-09-09T00:00:00Z',
  }] })
  assert.equal(queue[0].entityKind, 'candidate')
  assert.deepEqual(parsePlaceOperatorReview({
    entity_kind: 'candidate', entity_id: id, decision: 'approve', expected_revision: 1, idempotency_key: key,
  }), {
    entity_kind: 'candidate', entity_id: id, decision: 'approve', expected_revision: 1, idempotency_key: key,
  })
  assert.throws(() => parsePlaceOperatorReview({
    entity_kind: 'candidate', entity_id: id, decision: 'approve', expected_revision: 0, idempotency_key: key,
  }), PlaceInputError)
  assert.throws(() => parsePlaceQueue({ items: [{
    entity_kind: 'suggestion', id, kind: 'correction', category: 'boardgame', target_candidate_id: id,
    target_candidate_revision: null, name: '검수 장소', address: '부산 금정구',
    source_url: 'https://example.com/store', note: '', revision: 1, created_at: '2026-09-09T00:00:00Z',
  }] }), PlaceInputError)
})
