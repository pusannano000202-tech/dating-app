import test from 'node:test'
import assert from 'node:assert/strict'
import { makeParticipationSummary } from '../../lib/participation/summary'
import { createVoiceEntryLoader, parseVoiceEntryStatus, parseVoiceQueueIdentity } from '../../lib/voice/entry-status'

const payload = (genders: string[] = ['male', 'female'], advice = true) => ({
  queued: false, sessionId: null, role: null, adviceTopic: null,
  waiting: { ...makeParticipationSummary(advice ? 'advice:school:romance' : 'random:school', genders, 'waiting_for_voice'),
    ...(advice ? { talkers: genders.length, listeners: 0 } : {}) },
})

test('voice entry preserves exact whole/gender/role counts including zero and one', () => {
  for (const genders of [[], ['female'], ['male', 'female', 'prefer_not_to_say']]) {
    const data = parseVoiceEntryStatus(payload(genders), true)
    assert.equal(data.waiting.totalPeople, genders.length)
    assert.equal(data.waiting.genderBreakdown.femalePeople, genders.filter(g => g === 'female').length)
    assert.equal(data.talkers, genders.length)
  }
})

test('missing, inconsistent, negative, and connected counts never become zero waiting counts', () => {
  assert.throws(() => parseVoiceEntryStatus({}, true))
  assert.throws(() => parseVoiceEntryStatus({ ...payload(), waiting: null }, true))
  const mismatched = payload()
  mismatched.waiting.totalPeople = 3
  assert.throws(() => parseVoiceEntryStatus(mismatched, true))
  const roles = payload(); roles.waiting.listeners = 2
  assert.throws(() => parseVoiceEntryStatus(roles, true))
  const negative = payload(); negative.waiting.talkers = -1
  assert.throws(() => parseVoiceEntryStatus(negative, true))
  assert.throws(() => parseVoiceEntryStatus({ ...payload(), waiting: makeParticipationSummary('school', [], 'connected_to_voice') }, false))
})

test('casual conversation keeps the school queue without inventing talker/listener roles', () => {
  const data = parseVoiceEntryStatus(payload(['male'], false), false)
  assert.equal(data.talkers, null)
  assert.equal(data.listeners, null)
  assert.equal(data.waiting.totalPeople, 1)
})

test('display scope must match the requested advice topic or random school queue', () => {
  assert.doesNotThrow(() => parseVoiceEntryStatus(payload(), true, 'romance'))
  assert.throws(() => parseVoiceEntryStatus(payload(), true, 'career'))
  assert.throws(() => parseVoiceEntryStatus(payload(), false, 'social'))
  assert.doesNotThrow(() => parseVoiceEntryStatus(payload([], false), false, 'social'))
})

test('queued advice status requires a valid role/topic and safe session id', () => {
  assert.throws(() => parseVoiceEntryStatus({ ...payload(), queued: true }, true))
  assert.throws(() => parseVoiceEntryStatus({ ...payload(), sessionId: '../bad' }, true))
  const data = parseVoiceEntryStatus({ ...payload(), queued: true, role: 'listener', adviceTopic: 'career' }, true)
  assert.equal(data.role, 'listener')
})

test('confirmed mutation session survives a failed follow-up count fetch', async () => {
  const sessionId = '123e4567-e89b-42d3-a456-426614174000'
  const identity = parseVoiceQueueIdentity({ queued: false, sessionId })
  let state: any
  const loader = createVoiceEntryLoader(async () => { throw new Error('offline') }, true, next => { state = next })
  await loader.refresh()
  assert.equal(state.phase, 'error')
  assert.deepEqual(identity, { queued: false, sessionId })
  assert.throws(() => parseVoiceQueueIdentity({ queued: true, sessionId: '/unsafe' }))
  assert.throws(() => parseVoiceQueueIdentity({ queued: 'true', sessionId: null }))
  assert.deepEqual(parseVoiceQueueIdentity({ queued: false }, true), { queued: false, sessionId: null })
  assert.throws(() => parseVoiceQueueIdentity({ queued: true }, true))
  loader.dispose()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('a later refresh wins even when an older fetch ignores abort', async () => {
  const a = deferred<unknown>(), b = deferred<unknown>()
  const states: any[] = []; let calls = 0
  const loader = createVoiceEntryLoader(() => (++calls === 1 ? a.promise : b.promise), true, state => states.push(state))
  const first = loader.refresh(); const second = loader.refresh()
  b.resolve(payload(['female'])); await second
  a.resolve(payload(['male', 'male'])); await first
  assert.equal(states.at(-1).data.waiting.totalPeople, 1)
  assert.equal(states.at(-1).data.waiting.genderBreakdown.femalePeople, 1)
  loader.dispose()
})

test('failure clears stale counts and successful retry clears the error', async () => {
  let fail = false
  const states: any[] = []
  const loader = createVoiceEntryLoader(async () => {
    if (fail) throw new Error('offline')
    return payload(['female'])
  }, true, state => states.push(state))
  await loader.refresh(); fail = true; await loader.refresh()
  assert.equal(states.at(-1).phase, 'error')
  assert.equal(states.at(-1).data, null)
  fail = false; await loader.refresh()
  assert.equal(states.at(-1).phase, 'ready')
  assert.equal(states.at(-1).error, '')
  loader.dispose()
})

test('disposing a topic loader prevents its late response from updating the next topic', async () => {
  const pending = deferred<unknown>(); const states: any[] = []
  let signal!: AbortSignal
  const loader = createVoiceEntryLoader(s => { signal = s; return pending.promise }, true, state => states.push(state))
  const request = loader.refresh(); loader.dispose()
  assert.equal(signal.aborted, true)
  const count = states.length
  pending.resolve(payload()); await request
  assert.equal(states.length, count)
})
