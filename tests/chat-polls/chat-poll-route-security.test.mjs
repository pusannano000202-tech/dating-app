import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

const userId = '11111111-1111-4111-8111-111111111111'
const roomId = '22222222-2222-4222-8222-222222222222'
const idempotencyKey = '33333333-3333-4333-8333-333333333333'

function harness() {
  const calls = []
  const state = { userId }
  const cache = new Map()
  class RequestGuardError extends Error {
    constructor(status) {
      super(status === 401 ? 'unauthenticated' : 'forbidden')
      this.status = status
      this.code = status === 401 ? 'unauthenticated' : 'forbidden'
    }
  }
  const authGuard = {
    RequestGuardError,
    requireRequestAccess: async (request, options) => {
      if (options?.checkMutationOrigin !== false && request.headers.get('origin') !== 'https://quantum.test') throw new RequestGuardError(403)
      if (!state.userId) throw new RequestGuardError(401)
      return { userId: state.userId }
    },
    requestGuardErrorResponse: (error) => Response.json(
      { error: error.code },
      { status: error.status, headers: { 'Cache-Control': 'private, no-store' } },
    ),
  }
  function load(path) {
    const absolute = resolve(path)
    if (cache.has(absolute)) return cache.get(absolute).exports
    const module = { exports: {} }
    cache.set(absolute, module)
    const source = readFileSync(absolute, 'utf8')
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const require = (name) => {
      if (name === '@/lib/auth/server-guards') return authGuard
      if (name === '@/lib/supabase-request') return {
        createSupabaseRequestClient: () => ({
          rpc: async (rpcName, args) => {
            calls.push({ name: rpcName, args })
            return { data: { id: roomId }, error: null }
          },
        }),
      }
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`)
      if (name.startsWith('.')) return load(`${resolve(dirname(absolute), name)}.ts`)
      throw new Error(`Unexpected dependency: ${name}`)
    }
    new Function('require', 'module', 'exports', js)(require, module, module.exports)
    return module.exports
  }
  return {
    calls,
    state,
    direct: load('app/api/chat-polls/activity-rooms/[roomId]/route.ts'),
    generic: load('app/api/chat-polls/[roomKind]/[roomId]/[[...action]]/route.ts'),
  }
}

function request(body, origin = 'https://quantum.test') {
  return new Request('https://quantum.test/api/chat-polls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body,
  })
}

function getRequest(expectedAccount) {
  return new Request('https://quantum.test/api/chat-polls', {
    headers: expectedAccount ? { 'X-Expected-Account': expectedAccount } : {},
  })
}

const validCreate = () => JSON.stringify({
  expected_viewer_binding: userId,
  purpose: 'general',
  title: '직접 만든 질문',
  selection_mode: 'single',
  options: ['첫 번째', '두 번째'],
  idempotency_key: idempotencyKey,
})

test('our-team route keeps the exact private team scope and rejects inherited object keys',async()=>{
 const h=harness(),context={params:Promise.resolve({roomKind:'league-teams',roomId,action:[]})}
 assert.equal((await h.generic.GET(getRequest(userId),context)).status,200)
 assert.equal((await h.generic.POST(request(validCreate()),context)).status,201)
 assert.deepEqual(h.calls.map(c=>[c.name,c.args.p_room_kind,c.args.p_room_ref_id]),[['get_chat_room_polls','league_team',roomId],['create_chat_room_poll','league_team',roomId]])
 assert.equal((await h.generic.GET(getRequest(userId),{params:Promise.resolve({roomKind:'constructor',roomId})})).status,400)
})

test('native study and hosted mentoring routes pass exact canonical kind and room id', async () => {
  for (const [roomKind, canonical] of [['study-rooms', 'study_room'], ['mentoring-rooms', 'mentoring']]) {
    const h = harness()
    const context = { params: Promise.resolve({ roomKind, roomId, action: [] }) }
    assert.equal((await h.generic.GET(getRequest(userId), context)).status, 200)
    assert.equal((await h.generic.POST(request(validCreate()), context)).status, 201)
    assert.deepEqual(h.calls.map(call => [call.name, call.args.p_room_kind, call.args.p_room_ref_id]), [
      ['get_chat_room_polls', canonical, roomId], ['create_chat_room_poll', canonical, roomId],
    ])
    assert.equal((await h.generic.POST(request(validCreate(), 'https://evil.test'), context)).status, 403)
    h.state.userId = null
    assert.equal((await h.generic.GET(getRequest(userId), context)).status, 401)
    assert.equal(h.calls.length, 2)
  }
})

test('actual poll routes authenticate and check origin before reading JSON or reaching RPC', async () => {
  const h = harness()
  const directContext = { params: Promise.resolve({ roomId }) }
  h.state.userId = null
  assert.equal((await h.direct.POST(request('{ malformed'), directContext)).status, 401)
  h.state.userId = userId
  assert.equal((await h.direct.POST(request('{ malformed', 'https://evil.test'), directContext)).status, 403)
  assert.equal(h.calls.length, 0)
})

test('actual direct and generic poll routes reject more than 16 KiB before parsing or RPC', async () => {
  const h = harness()
  const oversized = JSON.stringify({ ...JSON.parse(validCreate()), ignored: 'x'.repeat(17 * 1024) })
  const direct = await h.direct.POST(request(oversized), { params: Promise.resolve({ roomId }) })
  const generic = await h.generic.POST(request(oversized), {
    params: Promise.resolve({ roomKind: 'meetups', roomId, action: [] }),
  })
  assert.equal(direct.status, 413)
  assert.equal(generic.status, 413)
  assert.equal(h.calls.length, 0)
})

test('a bounded authenticated poll create still reaches its exact RPC', async () => {
  const h = harness()
  const response = await h.direct.POST(request(validCreate()), { params: Promise.resolve({ roomId }) })
  assert.equal(response.status, 201)
  assert.deepEqual(h.calls.map(call => call.name), ['create_activity_room_poll'])
})

test('an authenticated account different from the board lease cannot reach a mutation RPC', async () => {
  const h = harness()
  h.state.userId = '44444444-4444-4444-8444-444444444444'
  const response = await h.direct.POST(request(validCreate()), { params: Promise.resolve({ roomId }) })
  assert.equal(response.status, 401)
  assert.equal(h.calls.length, 0)
})

test('actual GET routes require the expected account before reaching room RPCs', async () => {
  const h = harness()
  const directContext = { params: Promise.resolve({ roomId }) }
  assert.equal((await h.direct.GET(getRequest(), directContext)).status, 401)
  assert.equal((await h.direct.GET(getRequest('44444444-4444-4444-8444-444444444444'), directContext)).status, 401)
  assert.equal(h.calls.length, 0)
  assert.equal((await h.direct.GET(getRequest(userId), directContext)).status, 200)
  assert.deepEqual(h.calls.map(call => call.name), ['get_activity_room_polls'])
})
