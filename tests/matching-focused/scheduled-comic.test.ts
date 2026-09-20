import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveScheduledComicScene } from '../../lib/matching/scheduled-comic'

const input = {
  programDay: 2, status: 'in_progress', startsAt: '2026-09-20T10:00:00Z',
  endsAt: '2026-09-20T12:00:00Z', serverNow: '2026-09-20T10:45:00Z',
  elapsedMs: 0, verified: true,
  runtime: { kind: 'day2', ready: true, scene: 'day2_rotation_round_2' },
}

const day1Input = {
  ...input, programDay: 1, endsAt: '2026-09-20T12:30:00Z',
  contentState: {} as Record<string, unknown>,
  runtime: {
    kind: 'day1', vote_open: false, can_vote: false, result_available: false,
    my_vote: null, selected_game: null, can_finish: false,
  },
}
test('server-selected scene drives the comic; preview offsets are never used as authority', () => {
  assert.equal(resolveScheduledComicScene(input)?.id, 'day2_rotation_round_2')
  assert.equal(resolveScheduledComicScene({ ...input, serverNow: '2026-09-20T10:10:00Z' })?.id, 'day2_rotation_round_2')
})
test('no current guidance on stale, failed, cancelled, future, ended or mismatched data', () => {
  assert.equal(resolveScheduledComicScene({ ...input, verified: false }), null)
  for (const elapsedMs of [-1, 75_000, NaN, Infinity]) assert.equal(resolveScheduledComicScene({ ...input, elapsedMs }), null)
  for (const status of ['cancelled', 'completed', 'draft']) assert.equal(resolveScheduledComicScene({ ...input, status }), null)
  for (const serverNow of ['bad', '2026-09-20T09:59:59Z', '2026-09-20T12:00:00Z']) assert.equal(resolveScheduledComicScene({ ...input, serverNow }), null)
  assert.equal(resolveScheduledComicScene({ ...input, serverNow: '2026-09-20T11:59:45Z', elapsedMs: 15_000 }), null)
  for (const runtime of [null, {}, { kind: 'day2', ready: false, scene: 'day2_rotation_round_2' }, { kind: 'day4', ready: true, scene: 'day2_rotation_round_2' }, { kind: 'day2', ready: true, scene: 'day4_same_answer_game' }]) assert.equal(resolveScheduledComicScene({ ...input, runtime }), null)
})
test('day 1 example minute 135 does not become an invented live first-impression slot', () => {
  assert.equal(resolveScheduledComicScene({ ...input, programDay: 1, runtime: { kind: 'day1', scene: 'day1_one_line_impression', ready: true } }), null)
})
test('existing day 4 phase can show its own comic with no state mutation', () => {
  const next = { ...input, programDay: 4, runtime: { kind: 'day4', ready: true, scene: 'day4_free_conversation' } }
  const before = JSON.stringify(next)
  assert.equal(resolveScheduledComicScene(next)?.id, 'day4_free_conversation')
  assert.equal(JSON.stringify(next), before)
})

test('day 1 follows verified game state before the server opens voting', () => {
  assert.equal(resolveScheduledComicScene(day1Input)?.id, 'day1_introduction')
  assert.equal(resolveScheduledComicScene({
    ...day1Input, contentState: { game_started: true },
  })?.id, 'day1_dalmuti_play')
  const waiting = resolveScheduledComicScene({
    ...day1Input, contentState: { game_started: true, game_finished: true },
  })
  assert.ok(waiting)
  assert.equal(waiting.id, 'day1_game_vote')
  assert.match(waiting.nextAction, /기다리/)
  assert.doesNotMatch([waiting.title, waiting.body, waiting.nextAction, ...waiting.speech].join(' '), /플레이|진행하기|차례로 넘기기|골라요/)
})

test('day 1 voting is selected only by the open server window, even before a game is marked finished', () => {
  const voting = {
    ...day1Input, serverNow: '2026-09-20T11:20:00Z',
    runtime: { ...day1Input.runtime, vote_open: true, can_vote: true },
  }
  assert.equal(resolveScheduledComicScene(voting)?.id, 'day1_game_vote')
  assert.equal(resolveScheduledComicScene({
    ...voting, runtime: { ...voting.runtime, can_vote: false },
  })?.id, 'day1_game_vote')
  assert.equal(resolveScheduledComicScene({
    ...voting, serverNow: '2026-09-20T11:24:45Z', elapsedMs: 15_000,
  }), null)
  assert.equal(resolveScheduledComicScene({
    ...day1Input, serverNow: '2026-09-20T11:19:45Z', elapsedMs: 15_000,
  }), null)
})

test('day 1 requires a server-selected game and never invents a zero-vote fallback or minute-135 phase', () => {
  const result = {
    ...day1Input, serverNow: '2026-09-20T11:25:00Z',
    contentState: { game_started: true, game_finished: true },
    runtime: { ...day1Input.runtime, result_available: true, selected_game: 'halligalli' },
  }
  assert.equal(resolveScheduledComicScene(result)?.id, 'day1_selected_game')
  assert.equal(resolveScheduledComicScene({ ...result, serverNow: '2026-09-20T12:15:00Z' })?.id, 'day1_selected_game')
  assert.equal(resolveScheduledComicScene({
    ...result, runtime: { ...result.runtime, selected_game: 'dalmuti' },
  })?.id, 'day1_selected_game')
  assert.equal(resolveScheduledComicScene({
    ...result, runtime: { ...result.runtime, selected_game: null },
  }), null)
})

test('day 1 wraps only with the verified finish capability and completed game state', () => {
  const wrapping = {
    ...day1Input, serverNow: '2026-09-20T12:25:00Z',
    contentState: { game_started: true, game_finished: true },
    runtime: { ...day1Input.runtime, result_available: true, selected_game: 'one-card', can_finish: true },
  }
  assert.equal(resolveScheduledComicScene(wrapping)?.id, 'day1_photo_and_end')
  assert.equal(resolveScheduledComicScene({
    ...wrapping, runtime: { ...wrapping.runtime, can_finish: false },
  })?.id, 'day1_selected_game')
  assert.equal(resolveScheduledComicScene({ ...wrapping, contentState: { game_started: true } }), null)
  assert.equal(resolveScheduledComicScene({ ...wrapping, serverNow: '2026-09-20T12:24:59Z' }), null)
})

test('day 1 rejects malformed, contradictory, cancelled and expired snapshots', () => {
  for (const contentState of [undefined, null, [], 'started', { game_started: 'true' }, { game_finished: 1 }, { game_finished: true }]) {
    assert.equal(resolveScheduledComicScene({ ...day1Input, contentState }), null)
  }
  for (const runtime of [
    null, {}, { ...day1Input.runtime, ready: true },
    { ...day1Input.runtime, can_vote: true },
    { ...day1Input.runtime, vote_open: true },
    { ...day1Input.runtime, result_available: true, selected_game: 'dalmuti' },
    { ...day1Input.runtime, selected_game: 'halligalli' },
    { ...day1Input.runtime, can_finish: true },
  ]) assert.equal(resolveScheduledComicScene({ ...day1Input, runtime }), null)
  assert.equal(resolveScheduledComicScene({
    ...day1Input, serverNow: '2026-09-20T11:20:00Z',
    runtime: { ...day1Input.runtime, vote_open: true, result_available: true },
  }), null)
  for (const status of ['cancelled', 'completed', 'draft']) assert.equal(resolveScheduledComicScene({ ...day1Input, status }), null)
  assert.equal(resolveScheduledComicScene({ ...day1Input, verified: false }), null)
  assert.equal(resolveScheduledComicScene({ ...day1Input, elapsedMs: 75_000 }), null)
  assert.equal(resolveScheduledComicScene({ ...day1Input, serverNow: '2026-09-20T09:59:59Z' }), null)
  assert.equal(resolveScheduledComicScene({ ...day1Input, serverNow: '2026-09-20T12:30:00Z' }), null)
})

test('day 2 hides a server-selected round outside its known bounds without advancing locally', () => {
  const round = {
    ...input, runtime: {
      ...input.runtime, round_opened_at: '2026-09-20T10:45:00Z', round_closes_at: '2026-09-20T11:15:00Z',
    },
  }
  assert.equal(resolveScheduledComicScene(round)?.id, 'day2_rotation_round_2')
  assert.equal(resolveScheduledComicScene({ ...round, serverNow: '2026-09-20T10:44:59Z', elapsedMs: 1_000 }), null)
  assert.equal(resolveScheduledComicScene({ ...round, serverNow: '2026-09-20T11:14:45Z', elapsedMs: 15_000 }), null)
  assert.equal(resolveScheduledComicScene({ ...round, serverNow: '2026-09-20T11:15:00Z' }), null)
  for (const bounds of [
    { round_opened_at: 'bad' }, { round_closes_at: 123 },
    { round_closes_at: '2026-09-20T10:45:00Z' },
  ]) assert.equal(resolveScheduledComicScene({ ...round, runtime: { ...round.runtime, ...bounds } }), null)
  assert.equal(resolveScheduledComicScene({
    ...input, runtime: { kind: 'day2', ready: true, scene: 'day2_arrival', round_opened_at: null, round_closes_at: null },
  })?.id, 'day2_arrival')
})

test('day 1 scene resolution leaves the verified snapshot and shared catalog untouched', () => {
  const frozen = Object.freeze({
    ...day1Input,
    contentState: Object.freeze({ game_started: true, game_finished: true }),
    runtime: Object.freeze({ ...day1Input.runtime }),
  })
  const before = JSON.stringify(frozen)
  const waiting = resolveScheduledComicScene(frozen)
  assert.ok(waiting)
  assert.equal(JSON.stringify(frozen), before)
  const voting = resolveScheduledComicScene({
    ...day1Input, serverNow: '2026-09-20T11:20:00Z',
    runtime: { ...day1Input.runtime, vote_open: true },
  })
  assert.ok(voting)
  assert.notEqual(waiting.nextAction, voting.nextAction)
})
