import test from 'node:test'
import assert from 'node:assert/strict'
import {
  constrainVoiceDockPosition,
  moveVoiceDockByKeyboard,
  parseVoiceGlobalRuntime,
  parseVoiceRuntimeCommand,
} from '../../lib/voice/global-runtime'

const sessionId = '123e4567-e89b-42d3-a456-426614174000'

const counts = (basis: 'waiting_for_voice' | 'connected_to_voice') => ({
  scopeId: 'advice:pnu:romance',
  asOf: '2026-09-09T01:00:00.000Z',
  basis,
  disclosureBasis: 'all_valid_participants',
  policyVersion: '2026-09-07-mandatory-aggregate-v1',
  totalPeople: 3,
  genderBreakdown: {
    malePeople: 1,
    femalePeople: 1,
    otherOrUnspecifiedPeople: 1,
  },
})

test('global runtime parses a persisted advice wait with exact public counts', () => {
  const result = parseVoiceGlobalRuntime({
    status: 'waiting',
    revision: 7,
    queue: {
      kind: 'advice',
      role: 'listener',
      adviceTopic: 'romance',
      waitUntil: '2026-09-09T01:05:00.000Z',
      waiting: { ...counts('waiting_for_voice'), talkers: 2, listeners: 1 },
    },
    session: null,
    room: null,
    sessionConnected: false,
  })

  assert.equal(result.status, 'waiting')
  assert.equal(result.queue?.kind, 'advice')
  assert.equal(result.queue?.role, 'listener')
  assert.equal(result.queue?.waiting.genderBreakdown.femalePeople, 1)
  assert.equal(result.session, null)
})

test('connected can only be shown for an active provider-connected membership', () => {
  const offered = {
    status: 'offered',
    revision: 2,
    queue: null,
    sessionConnected: false,
    session: {
      id: sessionId,
      roomId: sessionId,
      kind: 'random',
      state: 'active',
      revision: 2,
      generation: 1,
      mode: 'speak',
      adviceRole: 'talker',
      adviceTopic: 'romance',
      accepted: true,
      peerAccepted: true,
      participants: [],
    },
    room: {
      id: sessionId,
      title: '둘이 나누는 연애 고민',
      description: '서로 수락한 뒤 연결돼요.',
      topic: 'worries',
      kind: 'random',
      scope: 'school',
      departmentKey: null,
      capacity: 2,
      startsAt: '2026-09-09T01:00:00.000Z',
      endsAt: '2026-09-09T02:00:00.000Z',
      status: 'open',
      revision: 0,
      sourceUrl: null,
      sourceRevision: null,
      sourceEventKey: null,
      connected: counts('connected_to_voice'),
      waiting: counts('waiting_for_voice'),
    },
  }

  assert.equal(parseVoiceGlobalRuntime(offered).status, 'offered')
  const cleanup = { ...offered, status: 'cleanup_required', session: null, room: null, cleanup: { sessionId, revision: 2 } }
  assert.equal(parseVoiceGlobalRuntime(cleanup).status, 'cleanup_required')
  assert.throws(() => parseVoiceGlobalRuntime({ ...cleanup, sessionConnected: true }), /연결 상태/)
  assert.throws(() => parseVoiceGlobalRuntime({ ...cleanup, session: offered.session }), /연결 상태/)
  assert.throws(() => parseVoiceGlobalRuntime({ ...cleanup, cleanup: { sessionId: '../other', revision: 2 } }))
  assert.throws(
    () => parseVoiceGlobalRuntime({ ...offered, status: 'connected' }),
    /연결 상태/,
  )
  assert.equal(
    parseVoiceGlobalRuntime({ ...offered, status: 'connected', sessionConnected: true }).status,
    'connected',
  )
  assert.throws(
    () => parseVoiceGlobalRuntime({
      ...offered,
      session: { ...offered.session, state: 'ended' },
    }),
    /연결 상태/,
  )
})

test('runtime rejects malformed ownership ids and fabricated queue totals', () => {
  assert.throws(() => parseVoiceGlobalRuntime({ status: 'offered', revision: 0, sessionConnected: false, queue: null, session: { id: '../room' }, room: null }))
  assert.throws(() => parseVoiceGlobalRuntime({
    status: 'waiting', revision: 0, sessionConnected: false, session: null, room: null,
    queue: {
      kind: 'advice', role: 'listener', adviceTopic: 'romance', waitUntil: '2026-09-09T01:05:00.000Z',
      waiting: { ...counts('waiting_for_voice'), talkers: 1, listeners: 1 },
    },
  }))
})

test('casual matching remains a separate persisted random queue', () => {
  const result = parseVoiceGlobalRuntime({
    status: 'waiting', revision: 0, sessionConnected: false, session: null, room: null,
    queue: {
      kind: 'random', role: null, adviceTopic: null, topic: 'social',
      waitUntil: '2026-09-09T01:05:00.000Z',
      waiting: { ...counts('waiting_for_voice'), scopeId: 'random:pnu' },
    },
  })
  assert.equal(result.queue?.kind, 'random')
  assert.equal(result.queue?.topic, 'social')
  assert.equal(result.queue?.role, null)
})

test('dock stays inside the viewport and supports a keyboard positioning alternative', () => {
  assert.deepEqual(
    constrainVoiceDockPosition({ x: -40, y: 900 }, { width: 390, height: 844 }, 64, 88),
    { x: 12, y: 680 },
  )
  assert.deepEqual(
    moveVoiceDockByKeyboard({ x: 100, y: 100 }, 'ArrowRight', { width: 390, height: 844 }, 64, 88),
    { x: 116, y: 100 },
  )
  assert.deepEqual(
    moveVoiceDockByKeyboard({ x: 100, y: 100 }, 'End', { width: 390, height: 844 }, 64, 88),
    { x: 314, y: 680 },
  )
})

test('waiting cancellation accepts only a revision and an opaque idempotency key', () => {
  assert.deepEqual(parseVoiceRuntimeCommand({
    action: 'cancel_waiting', expectedRevision: 7, idempotencyKey: sessionId,
  }), {
    action: 'cancel_waiting', expectedRevision: 7, idempotencyKey: sessionId,
  })
  assert.throws(() => parseVoiceRuntimeCommand({ action: 'cancel_waiting', expectedRevision: -1, idempotencyKey: sessionId }))
  assert.throws(() => parseVoiceRuntimeCommand({ action: 'cancel_waiting', expectedRevision: 7, idempotencyKey: '../bad' }))
  assert.throws(() => parseVoiceRuntimeCommand({ action: 'cancel_waiting', expectedRevision: 7, idempotencyKey: sessionId, userId: sessionId }))
})
