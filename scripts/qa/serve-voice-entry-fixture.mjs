import { createServer, request as requestUpstream } from 'node:http'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const FIXTURE_HOST = '127.0.0.1'
const FIXTURE_PORT = 4177
const FIXTURE_ORIGIN = `http://${FIXTURE_HOST}:${FIXTURE_PORT}`
const UPSTREAM_HOST = '127.0.0.1'
const UPSTREAM_PORT = 3013
const MAX_JSON_BODY_BYTES = 4 * 1024
const ADVICE_TOPICS = new Set(['general', 'romance', 'career'])
const ROLES = new Set(['talker', 'listener'])
const SCENARIOS = new Set(['normal', 'zero', 'one', 'error', 'malformed'])
const FORWARDED_REQUEST_HEADER_BLOCKLIST = new Set([
  'authorization', 'cookie', 'apikey', 'x-api-key', 'x-supabase-api-key', 'x-client-info',
  'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'content-length',
])

const WAITING_BASE = Object.freeze({
  basis: 'waiting_for_voice',
  policyVersion: '2026-09-07-mandatory-aggregate-v1',
  disclosureBasis: 'all_valid_participants',
  adviceOnly: true,
})

const NORMAL_COUNTS = Object.freeze({
  romance: { totalPeople: 12, malePeople: 5, femalePeople: 7, otherOrUnspecifiedPeople: 0, talkers: 8, listeners: 4 },
  career: { totalPeople: 3, malePeople: 1, femalePeople: 2, otherOrUnspecifiedPeople: 0, talkers: 2, listeners: 1 },
  general: { totalPeople: 1, malePeople: 1, femalePeople: 0, otherOrUnspecifiedPeople: 0, talkers: 1, listeners: 0 },
  social: { totalPeople: 4, malePeople: 2, femalePeople: 2, otherOrUnspecifiedPeople: 0, talkers: 2, listeners: 2 },
})

export function createVoiceEntryFixtureState(now = () => new Date().toISOString()) {
  return {
    now,
    rulesAccepted: false,
    queued: false,
    socialQueued: false,
    role: null,
    adviceTopic: null,
    scenario: 'normal',
  }
}

function exactPath(parsed, pathname) {
  return parsed.pathname === pathname && parsed.search === ''
}

function adviceTopicFromRequest(parsed) {
  if (parsed.pathname !== '/api/voice/advice/queue') return null
  if ([...parsed.searchParams.keys()].length !== 1) return null
  const topic = parsed.searchParams.get('adviceTopic')
  return ADVICE_TOPICS.has(topic) ? topic : null
}

function scenarioCounts(topic, scenario) {
  if (scenario === 'zero') return { totalPeople: 0, malePeople: 0, femalePeople: 0, otherOrUnspecifiedPeople: 0, talkers: 0, listeners: 0 }
  if (scenario === 'one') return { totalPeople: 1, malePeople: 1, femalePeople: 0, otherOrUnspecifiedPeople: 0, talkers: 1, listeners: 0 }
  return NORMAL_COUNTS[topic]
}

function waitingPayload(topic, state) {
  const counts = scenarioCounts(topic, state.scenario)
  return {
    scopeId: topic === 'social' ? 'random:fixture-school' : `advice:fixture-school:${topic}`,
    asOf: state.now(),
    ...WAITING_BASE,
    ...(topic === 'social' ? { poolLabel: '학교 풀 예시' } : {}),
    totalPeople: counts.totalPeople,
    genderBreakdown: {
      malePeople: counts.malePeople,
      femalePeople: counts.femalePeople,
      otherOrUnspecifiedPeople: counts.otherOrUnspecifiedPeople,
    },
    talkers: counts.talkers,
    listeners: counts.listeners,
  }
}

function queuePayload(topic, state, includeAdviceState) {
  const activeAdvice = includeAdviceState && state.queued && state.adviceTopic === topic
  return {
    queued: topic === 'social' ? state.socialQueued : activeAdvice,
    sessionId: null,
    role: activeAdvice ? state.role : null,
    adviceTopic: topic === 'social' ? null : topic,
    waiting: waitingPayload(topic, state),
  }
}

function fixtureError(status, code) {
  return { status, body: { error: code } }
}

/**
 * Pure request router for the fixture-only voice DTOs. It has no network,
 * database, authentication, provider, microphone, or real-session effects.
 */
export function routeVoiceEntryFixture({ method, url, body, state }) {
  const parsed = new URL(url, FIXTURE_ORIGIN)
  const normalizedMethod = String(method || 'GET').toUpperCase()
  const adviceTopic = adviceTopicFromRequest(parsed)
  const voiceQueue = exactPath(parsed, '/api/voice/queue')
  const isFixtureRead = (normalizedMethod === 'GET' && (adviceTopic || voiceQueue))

  if (isFixtureRead && state.scenario === 'error') return fixtureError(503, 'fixture_scenario_error')
  if (isFixtureRead && state.scenario === 'malformed') return { status: 200, body: { queued: 'malformed_fixture' } }
  if (normalizedMethod === 'GET' && adviceTopic) return { status: 200, body: queuePayload(adviceTopic, state, true) }
  if (normalizedMethod === 'GET' && voiceQueue) return { status: 200, body: queuePayload('social', state, false) }

  if (normalizedMethod === 'POST' && exactPath(parsed, '/api/voice/rules')) {
    state.rulesAccepted = true
    return { status: 200, body: { ok: true } }
  }
  if (normalizedMethod === 'POST' && exactPath(parsed, '/api/voice/advice/queue')) {
    if (body?.action === 'join') {
      if (!state.rulesAccepted) return fixtureError(400, 'fixture_rules_required')
      if (!ROLES.has(body?.role) || !ADVICE_TOPICS.has(body?.adviceTopic)) return fixtureError(400, 'invalid_fixture_queue_request')
      state.queued = true
      state.role = body.role
      state.adviceTopic = body.adviceTopic
    } else if (body?.action === 'leave') {
      state.queued = false
      state.role = null
      state.adviceTopic = null
    } else if (body?.action !== 'resume') {
      return fixtureError(400, 'invalid_fixture_queue_request')
    }
    return { status: 200, body: { ok: true, queued: state.queued, sessionId: null, role: state.role, adviceTopic: state.adviceTopic } }
  }
  if (normalizedMethod === 'POST' && exactPath(parsed, '/api/voice/queue')) {
    if (body?.action === 'join' && body?.topic === 'social') state.socialQueued = true
    else if (body?.action === 'leave') state.socialQueued = false
    else return fixtureError(400, 'invalid_fixture_queue_request')
    return { status: 200, body: { ok: true, queued: state.socialQueued, sessionId: null }
    }
  }

  return null
}

function isLoopbackHost(host) {
  const normalized = String(host || '').toLowerCase()
  return normalized === '127.0.0.1:4177' || normalized === 'localhost:4177' || normalized === '[::1]:4177'
}

function isLoopbackAddress(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** Only local fixture pages may mutate ephemeral in-process review state. */
export function isAllowedVoiceFixtureWrite({ host, remoteAddress, origin }) {
  if (!isLoopbackHost(host) || !isLoopbackAddress(remoteAddress)) return false
  if (origin === undefined || origin === null || origin === '') return true
  return origin === FIXTURE_ORIGIN || origin === 'http://localhost:4177'
}

export function sanitizeVoiceFixtureUpstreamHeaders(headers) {
  const safe = {}
  for (const [name, value] of Object.entries(headers || {})) {
    const lower = name.toLowerCase()
    if (FORWARDED_REQUEST_HEADER_BLOCKLIST.has(lower) || lower.startsWith('x-supabase-')) continue
    if (value !== undefined) safe[name] = value
  }
  safe.host = `${UPSTREAM_HOST}:${UPSTREAM_PORT}`
  safe['accept-encoding'] = 'identity'
  return safe
}

function responseHeaders(headers, html) {
  const safe = { ...headers }
  delete safe['set-cookie']
  delete safe['Set-Cookie']
  if (html) {
    delete safe['content-length']
    delete safe['content-encoding']
    delete safe['transfer-encoding']
    delete safe.etag
  }
  return safe
}

function reviewBanner() {
  return '<aside id="voice-entry-fixture-banner" role="status" style="position:relative;display:block;box-sizing:border-box;width:100%;margin:0;padding:6px 12px;border-bottom:1px solid #275a7b;background:#effaff;color:#17394e;text-align:center;font:700 12px/1.4 system-ui,sans-serif">보이스 UI 검수 · 예시 인원 · 실제 통화 아님</aside>'
}

function injectReviewBanner(html) {
  const bodyTag = /<body\b[^>]*>/i
  return bodyTag.test(html) ? html.replace(bodyTag, (match) => `${match}${reviewBanner()}`) : `${reviewBanner()}${html}`
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-QA-Fixture': 'voice-entry-ui-only',
  })
  response.end(JSON.stringify(body))
}

function discardRequestBody(request) {
  request.resume()
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_JSON_BODY_BYTES) {
        rejectBody(new Error('body_too_large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolveBody(text ? JSON.parse(text) : null)
      } catch {
        rejectBody(new Error('invalid_json'))
      }
    })
    request.on('error', () => rejectBody(new Error('invalid_body')))
  })
}

function knownFixtureWrite(parsed) {
  return exactPath(parsed, '/api/voice/rules')
    || exactPath(parsed, '/api/voice/advice/queue')
    || exactPath(parsed, '/api/voice/queue')
}

function proxyReadRequest(request, response, parsed) {
  const upstream = requestUpstream({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: request.method,
    path: `${parsed.pathname}${parsed.search}`,
    headers: sanitizeVoiceFixtureUpstreamHeaders(request.headers),
  }, (upstreamResponse) => {
    const contentType = String(upstreamResponse.headers['content-type'] || '')
    const html = request.method === 'GET' && contentType.includes('text/html')
    if (!html) {
      response.writeHead(upstreamResponse.statusCode || 502, responseHeaders(upstreamResponse.headers, false))
      upstreamResponse.pipe(response)
      return
    }
    const chunks = []
    upstreamResponse.on('data', (chunk) => chunks.push(chunk))
    upstreamResponse.on('end', () => {
      response.writeHead(upstreamResponse.statusCode || 502, responseHeaders(upstreamResponse.headers, true))
      response.end(injectReviewBanner(Buffer.concat(chunks).toString('utf8')))
    })
  })
  upstream.setTimeout(5_000, () => upstream.destroy())
  upstream.on('error', () => writeJson(response, 502, { error: 'fixture_upstream_unavailable' }))
  request.pipe(upstream)
}

async function handleRequest(request, response, state) {
  const parsed = new URL(request.url || '/', FIXTURE_ORIGIN)
  const method = String(request.method || 'GET').toUpperCase()
  const writeContext = {
    host: request.headers.host,
    remoteAddress: request.socket.remoteAddress,
    origin: request.headers.origin,
  }

  if (method === 'POST' && exactPath(parsed, '/__qa/voice-scenario')) {
    if (!isAllowedVoiceFixtureWrite(writeContext)) {
      discardRequestBody(request)
      writeJson(response, 403, { error: 'fixture_cross_origin_write_blocked' })
      return
    }
    try {
      const body = await readJsonBody(request)
      if (!SCENARIOS.has(body?.scenario)) {
        writeJson(response, 400, { error: 'invalid_fixture_scenario' })
        return
      }
      state.scenario = body.scenario
      writeJson(response, 200, { ok: true, scenario: state.scenario })
    } catch {
      writeJson(response, 400, { error: 'invalid_fixture_request' })
    }
    return
  }

  if (method === 'POST' && knownFixtureWrite(parsed)) {
    if (!isAllowedVoiceFixtureWrite(writeContext)) {
      discardRequestBody(request)
      writeJson(response, 403, { error: 'fixture_cross_origin_write_blocked' })
      return
    }
    let body
    if (exactPath(parsed, '/api/voice/advice/queue') || exactPath(parsed, '/api/voice/queue')) {
      try {
        body = await readJsonBody(request)
      } catch {
        writeJson(response, 400, { error: 'invalid_fixture_request' })
        return
      }
    } else {
      discardRequestBody(request)
    }
    const fixture = routeVoiceEntryFixture({ method, url: `${parsed.pathname}${parsed.search}`, body, state })
    writeJson(response, fixture.status, fixture.body)
    return
  }

  const fixture = routeVoiceEntryFixture({ method, url: `${parsed.pathname}${parsed.search}`, state })
  if (fixture) {
    discardRequestBody(request)
    writeJson(response, fixture.status, fixture.body)
    return
  }

  if (method !== 'GET' && method !== 'HEAD') {
    discardRequestBody(request)
    writeJson(response, 403, { error: 'fixture_write_blocked' })
    return
  }
  if (parsed.pathname.startsWith('/api/')) {
    writeJson(response, 404, { error: 'fixture_api_not_found' })
    return
  }
  proxyReadRequest(request, response, parsed)
}

function assertFixedFixtureBinding(host, port) {
  if (host !== FIXTURE_HOST || port !== FIXTURE_PORT) throw new Error('voice_entry_fixture_bind_must_be_127_0_0_1_4177')
}

function probeUpstream() {
  return new Promise((resolveProbe, rejectProbe) => {
    const probe = requestUpstream({ host: UPSTREAM_HOST, port: UPSTREAM_PORT, method: 'GET', path: '/', headers: { 'accept-encoding': 'identity' } }, (response) => {
      response.resume()
      resolveProbe()
    })
    probe.setTimeout(3_000, () => probe.destroy())
    probe.on('error', () => rejectProbe(new Error('voice_entry_fixture_upstream_3013_unavailable')))
    probe.end()
  })
}

export async function startVoiceEntryFixtureServer() {
  assertFixedFixtureBinding(FIXTURE_HOST, FIXTURE_PORT)
  await probeUpstream()
  const state = createVoiceEntryFixtureState()
  const server = createServer((request, response) => { void handleRequest(request, response, state) })
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', () => rejectListen(new Error('voice_entry_fixture_port_4177_unavailable')))
    server.listen({ host: FIXTURE_HOST, port: FIXTURE_PORT, exclusive: true }, resolveListen)
  })
  return { server, origin: FIXTURE_ORIGIN, state }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  if (process.argv.length !== 2) {
    console.error('voice_entry_fixture_no_arguments_allowed')
    process.exitCode = 1
  } else {
    startVoiceEntryFixtureServer()
      .then(({ origin }) => console.log(`voice_entry_fixture_ready ${origin} upstream=http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`))
      .catch((failure) => {
        console.error(failure instanceof Error ? failure.message : 'voice_entry_fixture_start_failed')
        process.exitCode = 1
      })
  }
}
