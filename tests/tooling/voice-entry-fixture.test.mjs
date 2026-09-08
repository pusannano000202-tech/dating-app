import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  createVoiceEntryFixtureState,
  isAllowedVoiceFixtureWrite,
  routeVoiceEntryFixture,
  sanitizeVoiceFixtureUpstreamHeaders,
} from '../../scripts/qa/serve-voice-entry-fixture.mjs'

test('voice advice queue exposes the mandatory aggregate counts for each approved topic', () => {
  const state = createVoiceEntryFixtureState(() => '2026-09-07T12:00:00.000Z')

  const romance = routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/advice/queue?adviceTopic=romance', state })
  assert.deepEqual(romance, {
    status: 200,
    body: {
      queued: false,
      sessionId: null,
      role: null,
      adviceTopic: 'romance',
      waiting: {
        scopeId: 'advice:fixture-school:romance',
        asOf: '2026-09-07T12:00:00.000Z',
        basis: 'waiting_for_voice',
        policyVersion: '2026-09-07-mandatory-aggregate-v1',
        disclosureBasis: 'all_valid_participants',
        totalPeople: 12,
        genderBreakdown: { malePeople: 5, femalePeople: 7, otherOrUnspecifiedPeople: 0 },
        talkers: 8,
        listeners: 4,
        adviceOnly: true,
      },
    },
  })

  const career = routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/advice/queue?adviceTopic=career', state }).body.waiting
  assert.deepEqual(career.genderBreakdown, { malePeople: 1, femalePeople: 2, otherOrUnspecifiedPeople: 0 })
  assert.equal(career.totalPeople, 3)
  assert.equal(career.talkers, 2)
  assert.equal(career.listeners, 1)

  const general = routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/advice/queue?adviceTopic=general', state }).body.waiting
  assert.equal(general.totalPeople, 1)
  assert.equal(general.talkers, 1)
  assert.equal(general.listeners, 0)
})

test('voice fixture maintains only local advice-queue state after rules, join, resume, and leave', () => {
  const state = createVoiceEntryFixtureState(() => '2026-09-07T12:00:00.000Z')

  assert.deepEqual(routeVoiceEntryFixture({
    method: 'POST', url: '/api/voice/advice/queue', body: { action: 'join', role: 'talker', adviceTopic: 'romance' }, state,
  }), { status: 400, body: { error: 'fixture_rules_required' } })

  assert.deepEqual(routeVoiceEntryFixture({ method: 'POST', url: '/api/voice/rules', state }), { status: 200, body: { ok: true } })
  assert.equal(routeVoiceEntryFixture({
    method: 'POST', url: '/api/voice/advice/queue', body: { action: 'join', role: 'talker', adviceTopic: 'romance' }, state,
  }).status, 200)

  let queued = routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/advice/queue?adviceTopic=romance', state }).body
  assert.deepEqual({ queued: queued.queued, sessionId: queued.sessionId, role: queued.role, adviceTopic: queued.adviceTopic }, {
    queued: true, sessionId: null, role: 'talker', adviceTopic: 'romance',
  })
  assert.equal(routeVoiceEntryFixture({ method: 'POST', url: '/api/voice/advice/queue', body: { action: 'resume' }, state }).status, 200)
  queued = routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/advice/queue?adviceTopic=romance', state }).body
  assert.equal(queued.queued, true)
  assert.equal(queued.role, 'talker')
  assert.equal(routeVoiceEntryFixture({ method: 'POST', url: '/api/voice/advice/queue', body: { action: 'leave' }, state }).status, 200)
  queued = routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/advice/queue?adviceTopic=romance', state }).body
  assert.deepEqual({ queued: queued.queued, role: queued.role, adviceTopic: queued.adviceTopic, sessionId: queued.sessionId }, {
    queued: false, role: null, adviceTopic: 'romance', sessionId: null,
  })
})

test('voice social queue is a labelled school-pool aggregate and unknown API paths are not fixtures', () => {
  const state = createVoiceEntryFixtureState(() => '2026-09-07T12:00:00.000Z')
  const social = routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/queue', state })
  assert.equal(social.status, 200)
  assert.equal(social.body.waiting.scopeId, 'random:fixture-school')
  assert.equal(social.body.waiting.poolLabel, '학교 풀 예시')
  assert.equal(social.body.waiting.totalPeople, 4)
  assert.deepEqual(social.body.waiting.genderBreakdown, { malePeople: 2, femalePeople: 2, otherOrUnspecifiedPeople: 0 })
  assert.deepEqual({ talkers: social.body.waiting.talkers, listeners: social.body.waiting.listeners }, { talkers: 2, listeners: 2 })
  assert.equal(routeVoiceEntryFixture({ method: 'POST', url: '/api/voice/queue', body: { action: 'join', topic: 'social' }, state }).status, 200)
  assert.equal(routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/queue', state }).body.queued, true)
  assert.equal(routeVoiceEntryFixture({ method: 'POST', url: '/api/voice/queue', body: { action: 'leave' }, state }).status, 200)
  assert.equal(routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/queue', state }).body.queued, false)
  assert.equal(routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/queue?topic=social', state }), null)
  assert.equal(routeVoiceEntryFixture({ method: 'GET', url: '/api/profile/basic', state }), null)
})

test('voice fixture scenarios support error, malformed, and recovery checks without a real service', () => {
  const state = createVoiceEntryFixtureState(() => '2026-09-07T12:00:00.000Z')
  state.scenario = 'zero'
  assert.equal(routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/queue', state }).body.waiting.totalPeople, 0)
  state.scenario = 'one'
  assert.equal(routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/queue', state }).body.waiting.totalPeople, 1)
  state.scenario = 'error'
  assert.deepEqual(routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/queue', state }), { status: 503, body: { error: 'fixture_scenario_error' } })
  state.scenario = 'malformed'
  assert.deepEqual(routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/queue', state }), { status: 200, body: { queued: 'malformed_fixture' } })
  state.scenario = 'normal'
  assert.equal(routeVoiceEntryFixture({ method: 'GET', url: '/api/voice/queue', state }).body.waiting.totalPeople, 4)
})

test('voice fixture only permits same-origin or loopback no-origin writes and strips credentials before proxying reads', () => {
  assert.equal(isAllowedVoiceFixtureWrite({ host: '127.0.0.1:4177', remoteAddress: '127.0.0.1', origin: 'http://127.0.0.1:4177' }), true)
  assert.equal(isAllowedVoiceFixtureWrite({ host: 'localhost:4177', remoteAddress: '::1', origin: 'http://localhost:4177' }), true)
  assert.equal(isAllowedVoiceFixtureWrite({ host: '127.0.0.1:4177', remoteAddress: '127.0.0.1', origin: undefined }), true)
  assert.equal(isAllowedVoiceFixtureWrite({ host: '127.0.0.1:4177', remoteAddress: '127.0.0.1', origin: 'https://evil.example' }), false)
  assert.equal(isAllowedVoiceFixtureWrite({ host: 'example.test:4177', remoteAddress: '10.0.0.3', origin: undefined }), false)

  const forwarded = sanitizeVoiceFixtureUpstreamHeaders({
    authorization: 'Bearer secret', cookie: 'session=secret', apikey: 'secret', 'x-api-key': 'secret',
    'x-supabase-api-key': 'secret', 'x-client-info': 'secret', accept: 'text/html',
  })
  assert.deepEqual(forwarded, { accept: 'text/html', host: '127.0.0.1:3013', 'accept-encoding': 'identity' })
  const source = readFileSync('scripts/qa/serve-voice-entry-fixture.mjs', 'utf8')

  assert.match(source, /보이스 UI 검수 · 예시 인원 · 실제 통화 아님/)
  assert.match(source, /position:relative/)
  assert.doesNotMatch(source, /position:fixed;top:0/)
  assert.doesNotMatch(source, /z-index:2147483647/)
})
