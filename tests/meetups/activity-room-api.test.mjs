import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const root = new URL('../../', import.meta.url)
const roomId = '12345678-1234-4234-8234-123456789abc'

// Executes the actual route modules with isolated auth/RPC dependencies.
// These are API adapter tests, not real authentication or database evidence.
function setup({ user = { id: roomId }, authError = null, rpcError = null, originAllowed = true, enabled = true, configured = true } = {}) {
  const calls = []
  const cache = new Map()
  class TrustedOriginError extends Error { status = 403 }
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const exports = {}
    cache.set(path, exports)
    const source = readFileSync(new URL(path, root), 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    const localRequire = id => {
      if (id === '@/lib/supabase-request') return { createSupabaseRequestClient: () => ({ auth: { getUser: async () => ({ data: { user }, error: authError }) }, rpc: async (name, args) => { calls.push({ name, args }); return { data: { room_id: roomId }, error: rpcError } } }) }
      if (id === '@/lib/auth/trusted-origin') return { TrustedOriginError, assertTrustedMutationOrigin: () => { if (!originAllowed) throw new TrustedOriginError() } }
      if (id === '@/lib/utils') return { isSupabaseConfigured: () => configured }
      if (id === '@/lib/community-feature') return { isCommunityFeatureEnabled: () => enabled }
      if (id.endsWith('/http') || id === './http') return { meetupJson: (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }) }
      if (id === '@/lib/community/meetup-gender') return { isMeetupGenderMode: value => ['all', 'male_only', 'female_only'].includes(value) }
      if (id === '@/lib/meetups/activity-room-contract') return { getActivityRoomDefinition: key => key === 'team-gaming' ? { capacity: 5 } : null, isActivityRoomId: value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value), isActivityRoomCursor: value => !!value && /^[0-9a-f-]{36}$/.test(value.id) && /^\d{4}-\d{2}-\d{2}T/.test(value.created_at) && Number.isFinite(Date.parse(value.created_at)) }
      if (id === '@/lib/meetups/activity-room-api') return load('lib/meetups/activity-room-api.ts')
      return require(id)
    }
    new Function('require', 'module', 'exports', code)(localRequire, { exports }, exports)
    return exports
  }
  return { load, calls }
}

test('lobby GET calls only read RPC; explicit POST ensures the pool with server activity identity', async () => {
  const { load, calls } = setup()
  const route = load('app/api/meetups/activities/[activityKey]/rooms/route.ts')
  const context = { params: Promise.resolve({ activityKey: 'team-gaming' }) }
  const url = 'http://localhost:3013/api/meetups/activities/team-gaming/rooms?gender_mode=female_only'
  const get = await route.GET(new NextRequest(url), context)
  assert.equal(get.status, 200)
  assert.equal(get.headers.get('cache-control'), 'private, no-store')
  await route.POST(new NextRequest(url, { method: 'POST', body: JSON.stringify({ capacity: 99, school: 'forged' }) }), context)
  assert.deepEqual(calls, [
    { name: 'list_activity_rooms', args: { p_activity_key: 'team-gaming', p_gender_mode: 'female_only' } },
    { name: 'ensure_activity_room_pool', args: { p_activity_key: 'team-gaming', p_gender_mode: 'female_only' } },
  ])
})

test('home memberships use an actor-bound read RPC and ignore forged user query', async () => {
  const { load, calls } = setup()
  const route = load('app/api/meetups/mine/route.ts')
  const result = await route.GET(new NextRequest('http://localhost:3013/api/meetups/mine?user_id=forged'))
  assert.equal(result.status, 200)
  assert.equal(result.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(calls, [{ name: 'get_my_home_meetups', args: {} }])
  const unauth = setup({ user: null })
  assert.equal((await unauth.load('app/api/meetups/mine/route.ts').GET(new NextRequest('http://localhost:3013/api/meetups/mine'))).status, 401)
  assert.equal(unauth.calls.length, 0)
})

test('origin, missing auth, disabled feature and unavailable auth reject without RPC', async () => {
  for (const [options, expected] of [[{ originAllowed: false }, 403], [{ user: null }, 401], [{ enabled: false }, 503], [{ configured: false }, 503], [{ user: null, authError: { status: 503 } }, 503]]) {
    const { load, calls } = setup(options)
    const route = load('app/api/meetups/rooms/[roomId]/join/route.ts')
    const result = await route.POST(new NextRequest('http://localhost:3013/api/meetups/rooms/' + roomId + '/join', { method: 'POST' }), { params: Promise.resolve({ roomId }) })
    assert.equal(result.status, expected)
    assert.equal(calls.length, 0)
  }
})

test('unapplied RPC becomes explicit unavailable, never an empty list or leaked database error', async () => {
  const { load } = setup({ rpcError: { message: 'Could not find the function public.list_activity_rooms in the schema cache' } })
  const route = load('app/api/meetups/activities/[activityKey]/rooms/route.ts')
  const result = await route.GET(new NextRequest('http://localhost:3013/api/meetups/activities/team-gaming/rooms'), { params: Promise.resolve({ activityKey: 'team-gaming' }) })
  assert.equal(result.status, 503)
  assert.deepEqual(await result.json(), { error: 'community_schema_unavailable' })
})

test('invalid activity, gender and chat message are rejected without mutation', async () => {
  const { load, calls } = setup()
  const lobby = load('app/api/meetups/activities/[activityKey]/rooms/route.ts')
  assert.equal((await lobby.POST(new NextRequest('http://localhost:3013/api/a'), { params: Promise.resolve({ activityKey: 'gaming' }) })).status, 400)
  assert.equal((await lobby.GET(new NextRequest('http://localhost:3013/api/a?gender_mode=forged'), { params: Promise.resolve({ activityKey: 'team-gaming' }) })).status, 400)
  const chat = load('app/api/meetups/rooms/[roomId]/chat/route.ts')
  for (const body of [{ message: ' ', idempotency_key: roomId }, { message: 'x'.repeat(1001), idempotency_key: roomId }, { message: '안녕', idempotency_key: 'bad' }]) {
    assert.equal((await chat.POST(new NextRequest('http://localhost:3013/api/a', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ roomId }) })).status, 400)
  }
  assert.equal(calls.length, 0)
})

test('chat mutation uses server identity and idempotency key, not supplied sender', async () => {
  const { load, calls } = setup()
  const chat = load('app/api/meetups/rooms/[roomId]/chat/route.ts')
  await chat.POST(new NextRequest('http://localhost:3013/api/a', { method: 'POST', body: JSON.stringify({ message: ' 안녕하세요 ', idempotency_key: roomId, sender_id: 'forged' }) }), { params: Promise.resolve({ roomId }) })
  assert.deepEqual(calls, [{ name: 'send_activity_room_message', args: { p_room_id: roomId, p_message: '안녕하세요', p_idempotency_key: roomId } }])
})

test('capacity and safety rejections are not mislabeled as server outages', async () => {
  for (const [message, status] of [['blocked_pair', 403], ['activity_room_not_joinable', 403], ['activity_room_full', 409], ['activity_room_gender_required', 409], ['activity_room_gender_restricted', 403], ['contact_sharing_not_allowed', 400], ['idempotency_key_reused', 409]]) {
    const { load } = setup({ rpcError: { message } })
    const route = load('app/api/meetups/rooms/[roomId]/join/route.ts')
    const response = await route.POST(new NextRequest('http://localhost:3013/api/a', { method: 'POST' }), { params: Promise.resolve({ roomId }) })
    assert.equal(response.status, status, message)
    assert.deepEqual(await response.json(), { error: message })
  }
})

test('room login keeps the destination and denied chat still permits self-leave', () => {
  const chat = readFileSync(new URL('components/meetups/ActivityRoomChat.tsx', root), 'utf8')
  const lobby = readFileSync(new URL('components/meetups/ActivityRoomLobby.tsx', root), 'utf8')
  assert.match(chat, /login\?redirect=/)
  assert.match(lobby, /login\?redirect=/)
  assert.doesNotMatch(chat + lobby, /login\?returnTo=/)
  assert.match(chat, /채팅을 열지 않고 이 방에서 나가기/)
  const leave = chat.slice(chat.indexOf('async function leave()'), chat.indexOf('return <main'))
  assert.doesNotMatch(leave, /!room/)
  assert.match(leave, /method: 'DELETE'/)
})

test('history uses readonly RPC with a paired microsecond cursor and never client user identity', async () => {
  const { load, calls } = setup()
  const route = load('app/api/meetups/rooms/[roomId]/messages/route.ts')
  const context = { params: Promise.resolve({ roomId }) }
  const url = `http://localhost:3013/api/meetups/rooms/${roomId}/messages`
  assert.equal((await route.GET(new NextRequest(url), context)).status, 200)
  const query = new URLSearchParams({ before_created_at: '2026-09-07T12:00:00.123456+00:00', before_message_id: roomId, user_id: 'forged' })
  assert.equal((await route.GET(new NextRequest(`${url}?${query}`), context)).status, 200)
  assert.deepEqual(calls, [
    { name: 'get_activity_room_messages', args: { p_room_id: roomId, p_before_created_at: null, p_before_message_id: null } },
    { name: 'get_activity_room_messages', args: { p_room_id: roomId, p_before_created_at: '2026-09-07T12:00:00.123456+00:00', p_before_message_id: roomId } },
  ])
  for (const query of ['before_message_id=' + roomId, 'before_created_at=yesterday', 'before_created_at=bad&before_message_id=' + roomId]) {
    assert.equal((await route.GET(new NextRequest(`${url}?${query}`), context)).status, 400)
  }
  assert.equal(calls.length, 2)
})
