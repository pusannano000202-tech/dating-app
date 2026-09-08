import { createServer, request as requestUpstream } from 'node:http'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const FIXTURE_HOST = '127.0.0.1'
const FIXTURE_PORT = 4176
const FIXTURE_ORIGIN = `http://${FIXTURE_HOST}:${FIXTURE_PORT}`
const UPSTREAM_HOST = '127.0.0.1'
const UPSTREAM_PORT = 3013
const LOBBY_PATH = '/api/meetups/activities/team-gaming/rooms'
const REFILL_HISTORY_MODE = 'refill-history'
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const FORWARDED_REQUEST_HEADER_BLOCKLIST = new Set([
  'authorization', 'cookie', 'apikey', 'x-api-key', 'x-supabase-api-key',
  'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding',
])
const MAX_JSON_BODY_BYTES = 4 * 1024

export const ACTIVITY_ROOM_FIXTURE_IDS = Object.freeze({
  roomOne: '10000000-0000-4000-8000-000000000001',
  roomTwo: '20000000-0000-4000-8000-000000000002',
  welcomeMessage: '30000000-0000-4000-8000-000000000003',
})

export function parseActivityRoomFixtureMode(argumentsList) {
  if (!Array.isArray(argumentsList)) throw new Error('activity_room_fixture_invalid_arguments')
  if (argumentsList.length === 0) return 'default'
  if (argumentsList.length === 1 && argumentsList[0] === '--refill-history') return REFILL_HISTORY_MODE
  throw new Error('activity_room_fixture_invalid_arguments')
}

function historyMessageId(sequence) {
  return `60000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
}

function refillHistoryMessages() {
  return Array.from({ length: 105 }, (_, index) => ({
    id: historyMessageId(index + 1),
    sender_alias: index % 2 === 0 ? '푸른별' : '달빛콩',
    message: index === 0 ? '오늘 저녁 8시, 부산대 정문 앞에서 만나요.' : `이전 대화 ${index + 1}`,
    created_at: new Date(Date.UTC(2026, 8, 7, 0, index, 0)).toISOString(),
    is_me: false,
  }))
}

export function createActivityRoomFixtureState(now = () => new Date().toISOString(), mode = 'default') {
  if (mode !== 'default' && mode !== REFILL_HISTORY_MODE) throw new Error('activity_room_fixture_invalid_mode')
  const refillHistory = mode === REFILL_HISTORY_MODE
  return {
    joinedRoomOne: false,
    refillHistory,
    roomTwoCreated: refillHistory,
    nextMessageSequence: 4,
    now,
    messages: refillHistory ? refillHistoryMessages() : [{
      id: ACTIVITY_ROOM_FIXTURE_IDS.welcomeMessage,
      sender_alias: '푸른별',
      message: '안녕하세요! 같이 한 판 해요.',
      created_at: now(),
      is_me: false,
    }],
  }
}

function roomOne(state) {
  const full = state.joinedRoomOne
  return {
    id: ACTIVITY_ROOM_FIXTURE_IDS.roomOne,
    room_number: 1,
    member_count: full ? 5 : 4,
    capacity: 5,
    joined: full,
    status: full ? 'full' : 'recruiting',
    joinable: !full,
  }
}

function roomTwo(state) {
  return {
    id: ACTIVITY_ROOM_FIXTURE_IDS.roomTwo,
    room_number: 2,
    member_count: state.refillHistory ? 2 : 0,
    capacity: 5,
    joined: false,
    status: 'recruiting',
    joinable: !state.joinedRoomOne,
  }
}

function lobbyPayload(state) {
  const rooms = [roomOne(state)]
  if (state.roomTwoCreated) rooms.push(roomTwo(state))
  return {
    data: {
      activity_key: 'team-gaming',
      gender_mode: 'all',
      capacity: 5,
      room_count: rooms.length,
      rooms,
    },
  }
}

function detailPayload(state) {
  return {
    data: {
      ...roomOne(state),
      activity_key: 'team-gaming',
      gender_mode: 'all',
      members: [
        { alias: '푸른별', is_me: false },
        { alias: '달빛콩', is_me: false },
        { alias: '별밤', is_me: false },
        { alias: '초록빛', is_me: false },
        { alias: '나', is_me: true },
      ],
      messages: messagePage(state).messages,
    },
  }
}

function error(status, code) {
  return { status, body: { error: code } }
}

function exactLobbyRequest(parsed) {
  return parsed.pathname === LOBBY_PATH && parsed.search === '?gender_mode=all'
}

function activityRoomMessageId(sequence) {
  return `40000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
}

function chronologicalMessages(state) {
  return state.messages
    .map((message) => ({ ...message }))
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
}

function messagePage(state, before) {
  const messages = chronologicalMessages(state)
  const end = before ? messages.findIndex((message) => message.id === before.id && message.created_at === before.created_at) : messages.length
  if (end < 0) return null
  const older = messages.slice(0, end)
  const page = older.slice(Math.max(0, older.length - 100))
  const hasMore = older.length > page.length
  const first = page[0]
  return {
    messages: page,
    hasMore,
    nextCursor: hasMore && first ? { created_at: first.created_at, id: first.id } : null,
  }
}

function requestedMessageCursor(parsed) {
  const createdAt = parsed.searchParams.get('before_created_at')
  const id = parsed.searchParams.get('before_message_id')
  const onlyCursorKeys = [...parsed.searchParams.keys()].every((key) => key === 'before_created_at' || key === 'before_message_id')
  if (!onlyCursorKeys || (createdAt === null) !== (id === null)) return undefined
  return createdAt === null ? null : { created_at: createdAt, id }
}

function isFixtureUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/**
 * The only mutable surface in this script. It intentionally models the exact
 * DTOs consumed by ActivityRoomLobby and ActivityRoomChat without touching an
 * app route, a database, authentication, or the upstream API server.
 */
export function routeActivityRoomFixture({ method, url, body, state }) {
  const parsed = new URL(url, FIXTURE_ORIGIN)
  const normalizedMethod = String(method || 'GET').toUpperCase()

  if (exactLobbyRequest(parsed) && (normalizedMethod === 'GET' || normalizedMethod === 'POST')) {
    return { status: 200, body: lobbyPayload(state) }
  }

  const roomOnePath = `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}`
  if (parsed.search === '' && parsed.pathname === `${roomOnePath}/join` && normalizedMethod === 'POST') {
    state.joinedRoomOne = true
    state.roomTwoCreated = true
    return { status: 200, body: { data: { room_id: ACTIVITY_ROOM_FIXTURE_IDS.roomOne } } }
  }
  if (parsed.search === '' && parsed.pathname === `${roomOnePath}/join` && normalizedMethod === 'DELETE') {
    state.joinedRoomOne = false
    return { status: 200, body: { data: { room_id: ACTIVITY_ROOM_FIXTURE_IDS.roomOne } } }
  }
  if (parsed.search === '' && parsed.pathname === roomOnePath && normalizedMethod === 'GET') {
    return state.joinedRoomOne
      ? { status: 200, body: detailPayload(state) }
      : error(403, 'membership_required')
  }
  if (parsed.pathname === `${roomOnePath}/messages` && normalizedMethod === 'GET') {
    if (!state.joinedRoomOne) return error(403, 'membership_required')
    const cursor = requestedMessageCursor(parsed)
    if (cursor === undefined || (cursor && !isFixtureUuid(cursor.id))) return error(400, 'invalid_message_cursor')
    const page = messagePage(state, cursor)
    if (!page) return error(400, 'invalid_message_cursor')
    return {
      status: 200,
      body: {
        data: {
          room_id: ACTIVITY_ROOM_FIXTURE_IDS.roomOne,
          messages: page.messages,
          has_more: page.hasMore,
          next_cursor: page.nextCursor,
        },
      },
    }
  }
  if (parsed.search === '' && parsed.pathname === `${roomOnePath}/chat` && normalizedMethod === 'POST') {
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    if (!state.joinedRoomOne) return error(403, 'membership_required')
    if (!message || message.length > 1000 || !isFixtureUuid(body?.idempotency_key)) return error(400, 'invalid_message')
    const id = activityRoomMessageId(state.nextMessageSequence++)
    state.messages.push({ id, sender_alias: '나', message, created_at: state.now(), is_me: true })
    return { status: 200, body: { data: { message_id: id } } }
  }

  return null
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-QA-Fixture': 'activity-room-ui-only',
  })
  response.end(JSON.stringify(body))
}

function discardRequestBody(request) {
  request.resume()
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let total = 0
    const chunks = []
    request.on('data', (chunk) => {
      total += chunk.length
      if (total > MAX_JSON_BODY_BYTES) {
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

function fixtureNeedsJsonBody(method, pathname) {
  return method === 'POST' && pathname === `/api/meetups/rooms/${ACTIVITY_ROOM_FIXTURE_IDS.roomOne}/chat`
}

function withoutSensitiveHeaders(headers) {
  const safe = {}
  for (const [name, value] of Object.entries(headers)) {
    if (FORWARDED_REQUEST_HEADER_BLOCKLIST.has(name.toLowerCase())) continue
    if (value !== undefined) safe[name] = value
  }
  safe.host = `${UPSTREAM_HOST}:${UPSTREAM_PORT}`
  safe['accept-encoding'] = 'identity'
  return safe
}

function responseHeaders(headers, html) {
  const result = { ...headers }
  if (html) {
    delete result['content-length']
    delete result['content-encoding']
    delete result['transfer-encoding']
    delete result.etag
  }
  return result
}

function reviewBanner() {
  return '<aside id="activity-room-fixture-banner" role="status" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;margin:0;padding:6px 12px;border-bottom:1px solid #9f4a3e;background:#fff4ef;color:#6c3129;text-align:center;font:700 12px/1.4 system-ui,sans-serif">UI 검수용 예시 데이터 · 실제 모집 아님</aside>'
}

function injectReviewBanner(html) {
  const bodyTag = /<body\b[^>]*>/i
  return bodyTag.test(html)
    ? html.replace(bodyTag, (match) => `${match}${reviewBanner()}`)
    : `${reviewBanner()}${html}`
}

function proxyReadRequest(request, response, parsed) {
  const upstream = requestUpstream({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: request.method,
    path: `${parsed.pathname}${parsed.search}`,
    headers: withoutSensitiveHeaders(request.headers),
  }, (upstreamResponse) => {
    const type = String(upstreamResponse.headers['content-type'] || '')
    const isHtml = request.method === 'GET' && type.includes('text/html')
    if (!isHtml) {
      response.writeHead(upstreamResponse.statusCode || 502, responseHeaders(upstreamResponse.headers, false))
      upstreamResponse.pipe(response)
      return
    }

    const chunks = []
    upstreamResponse.on('data', (chunk) => chunks.push(chunk))
    upstreamResponse.on('end', () => {
      const html = Buffer.concat(chunks).toString('utf8')
      response.writeHead(upstreamResponse.statusCode || 502, responseHeaders(upstreamResponse.headers, true))
      response.end(injectReviewBanner(html))
    })
  })
  upstream.setTimeout(5_000, () => upstream.destroy())
  upstream.on('error', () => writeJson(response, 502, { error: 'fixture_upstream_unavailable' }))
  request.pipe(upstream)
}

async function handleRequest(request, response, state) {
  const parsed = new URL(request.url || '/', FIXTURE_ORIGIN)
  const method = String(request.method || 'GET').toUpperCase()
  const requiresBody = fixtureNeedsJsonBody(method, parsed.pathname)
  let body
  if (requiresBody) {
    try {
      body = await readJsonBody(request)
    } catch {
      writeJson(response, 400, { error: 'invalid_fixture_request' })
      return
    }
  }

  const fixture = routeActivityRoomFixture({ method, url: `${parsed.pathname}${parsed.search}`, body, state })
  if (fixture) {
    if (!requiresBody) discardRequestBody(request)
    writeJson(response, fixture.status, fixture.body)
    return
  }

  if (UNSAFE_METHODS.has(method)) {
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
  if (host !== FIXTURE_HOST || port !== FIXTURE_PORT) throw new Error('activity_room_fixture_bind_must_be_127_0_0_1_4176')
}

function probeUpstream() {
  return new Promise((resolveProbe, rejectProbe) => {
    const probe = requestUpstream({ host: UPSTREAM_HOST, port: UPSTREAM_PORT, path: '/', method: 'GET', headers: { 'accept-encoding': 'identity' } }, (response) => {
      response.resume()
      resolveProbe()
    })
    probe.setTimeout(3_000, () => probe.destroy())
    probe.on('error', () => rejectProbe(new Error('activity_room_fixture_upstream_3013_unavailable')))
    probe.end()
  })
}

export async function startActivityRoomFixtureServer(mode = 'default') {
  assertFixedFixtureBinding(FIXTURE_HOST, FIXTURE_PORT)
  await probeUpstream()
  const state = createActivityRoomFixtureState(undefined, mode)
  const server = createServer((request, response) => {
    void handleRequest(request, response, state)
  })
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', () => rejectListen(new Error('activity_room_fixture_port_4176_unavailable')))
    server.listen({ host: FIXTURE_HOST, port: FIXTURE_PORT, exclusive: true }, resolveListen)
  })
  return { server, origin: FIXTURE_ORIGIN, state }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  try {
    const mode = parseActivityRoomFixtureMode(process.argv.slice(2))
    startActivityRoomFixtureServer(mode)
      .then(({ origin }) => console.log(`activity_room_fixture_ready ${origin} upstream=http://${UPSTREAM_HOST}:${UPSTREAM_PORT} mode=${mode}`))
      .catch((failure) => {
        console.error(failure instanceof Error ? failure.message : 'activity_room_fixture_start_failed')
        process.exitCode = 1
      })
  } catch (failure) {
    console.error(failure instanceof Error ? failure.message : 'activity_room_fixture_start_failed')
    process.exitCode = 1
  }
}
