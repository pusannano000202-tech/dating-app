import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { applyBattleAction, createBracketSession, getNextPair, resumeBracketSession } from '../../lib/campus-eats/bracket'
import * as preservationHelpers from '../../lib/campus-eats/preserved-storage'

function helpers() {
  assert.ok(existsSync('lib/campus-eats/preserved-storage.ts'), 'recovery-safe storage contract must exist')
  return preservationHelpers as {
    readPreservedRecord<T>(storage: { getItem(key: string): string | null; setItem(key: string, value: string): void }, key: string, restore: (value: unknown) => T | null): {
      value: T | null; status: string; write(value: T): string; protect(): void
    }
    isSupportedPersonalRatingRecord(value: unknown, ids: readonly string[]): boolean
    isSupportedPilotRecord(value: unknown, ids: readonly string[]): boolean
  }
}
const restore = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && 'version' in v && v.version === 1 ? v : null
function fixture(raw: string | null) {
  let value = raw
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next } }
}
test('invalid JSON and unknown versions remain byte-for-byte intact after attempted autosave', () => {
  for (const raw of ['broken{', '{"version":99,"old":"keep me"}']) {
    const storage = fixture(raw)
    const record = helpers().readPreservedRecord(storage, 'key', restore)
    assert.equal(record.status, 'protected')
    assert.equal(record.write({ version: 1 }), 'protected')
    assert.equal(storage.getItem(), raw)
  }
})
test('valid and missing records can save, but a competing tab cannot be overwritten', () => {
  const storage = fixture(null)
  const record = helpers().readPreservedRecord(storage, 'key', restore)
  assert.equal(record.write({ version: 1 }), 'saved')
  storage.setItem('key', '{"version":1,"otherTab":true}')
  assert.equal(record.write({ version: 1, stale: true }), 'protected')
  assert.equal(storage.getItem(), '{"version":1,"otherTab":true}')
})
test('denied storage and failed normalization do not crash or erase existing records', () => {
  const unavailable = helpers().readPreservedRecord({ getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }, 'key', restore)
  assert.equal(unavailable.write({ version: 1 }), 'unavailable')
  const storage = fixture('{"version":1}')
  const record = helpers().readPreservedRecord(storage, 'key', restore)
  record.protect()
  assert.equal(record.write({ version: 1, lost: true }), 'protected')
  assert.equal(storage.getItem(), '{"version":1}')
})
test('rating format changes or removed candidate identifiers cannot silently reset ratings', () => {
  const check = helpers().isSupportedPersonalRatingRecord
  assert.equal(check({ version: 2, ratings: { a: 1200 }, validComparisonCount: 1, appliedEventIds: [], visitedCandidateIds: ['a'] }, ['a']), true)
  assert.equal(check({ version: 99, ratings: { a: 1200 } }, ['a']), false)
  assert.equal(check({ version: 2, ratings: { removed: 1200 } }, ['a']), false)
  assert.equal(check({ version: 2, ratings: { a: 'broken' } }, ['a']), false)
  assert.equal(check({ version: 2, ratings: {} }, ['a']), false)
  assert.equal(check({ version: 2, ratings: { a: 1200 }, validComparisonCount: 1 }, ['a']), false)
  assert.equal(check({ version: 2, ratings: { a: 1200 }, validComparisonCount: 1, appliedEventIds: [], visitedCandidateIds: [] }, ['a', 'b']), false)
})
test('G4 shared-session fields and incomplete bracket records are protected, not silently discarded', () => {
  const check = helpers().isSupportedPilotRecord
  assert.equal(typeof check, 'function')
  const session = createBracketSession({ candidateIds: ['a', 'b'] })
  const pilot = { version: 4, session, view: 'map', selectedCandidateId: 'a', selectedVisitedCandidateIds: [], tournamentStarted: false, tournamentId: 'not-started', eventSequence: 0 }
  assert.equal(check(pilot, ['a', 'b']), true)
  for (const value of [
    { ...pilot, sharedComparisonSessionId: 'old-session', sharedComparisonHasUnsaved: true },
    { ...pilot, session: { candidateIds: ['a', 'b'], status: 'active' } },
    { ...pilot, session: { ...session, roundWinners: null } },
    { ...pilot, session: { ...session, roundWinners: { '0': 'a' } } },
  ]) {
    const raw = JSON.stringify(value)
    const storage = fixture(raw)
    const record = helpers().readPreservedRecord(storage, 'key', v => check(v, ['a', 'b']) ? v : null)
    assert.equal(record.write(pilot), 'protected')
    assert.equal(storage.getItem(), raw)
  }
})
test('all supported bracket sizes remain readable through wins, skips and resumption', () => {
  for (let size = 2; size <= 32; size++) for (const skip of [false, true]) {
    const ids = Array.from({ length: size }, (_, index) => `candidate-${index}`)
    let session = createBracketSession({ candidateIds: ids })
    for (let step = 0; step < 150; step++) {
      const pilot = { version: 4, session, view: 'battle', selectedCandidateId: ids[0], selectedVisitedCandidateIds: ids, tournamentStarted: true, tournamentId: 'test', eventSequence: step }
      assert.equal(helpers().isSupportedPilotRecord(pilot, ids), true, `size=${size},skip=${skip},step=${step}`)
      if (session.status === 'paused_needs_visits') { session = resumeBracketSession(session); continue }
      const pair = getNextPair(session)
      if (!pair) break
      const transition = applyBattleAction(session, skip && step % 2 === 0
        ? { type: 'neutral_skip', eventId: `event-${step}`, pair }
        : { type: 'candidate_choice', choice: 'both_visited_prefer_a', eventId: `event-${step}`, pair })
      assert.equal(transition.accepted, true)
      session = transition.state
    }
  }
})
test('pilot no longer removes unreadable session or rating data and warns about temporary-only progress', () => {
  const source = readFileSync('components/campus-eats/CampusEatsPilot.tsx', 'utf8')
  assert.doesNotMatch(source, /localStorage\.removeItem/)
  assert.match(source, /readPreservedRecord/)
  assert.match(source, /복원하지 못한 기존 기록은 덮어쓰지 않아요/)
})
