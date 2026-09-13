import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Execute the real handler and origin guard. All DB/provider imports are local
// fixtures: these tests cannot contact a payment provider or a database.
function load(path, dependencies = {}) {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText
  const exports = {}
  new Function('exports', 'require', code)(exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
    return dependencies[name]
  })
  return exports
}
const origin = 'https://quantum.example'
const auth = load('lib/auth/api-request-auth.ts')
const strict = load('lib/auth/strict-app-origin.ts')
const trusted = load('lib/auth/trusted-origin.ts', {
  './api-request-auth': auth, './strict-app-origin': strict,
})
const mutationGuard = load('lib/payments/request-guard.ts', { '../auth/trusted-origin': {
  ...trusted, assertTrustedMutationOrigin: request => trusted.assertTrustedMutationOrigin(request, origin),
} })

function fixture() {
  const calls = []
  const handler = load('app/api/matches/[id]/refund/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/constants': { DEPOSIT_AMOUNT: 10000 },
    '@/lib/payments/request-guard': mutationGuard,
    '@/lib/supabase-request': { createSupabaseRequestClient: () => ({
      auth: { getUser: async () => { calls.push('auth'); return { data: { user: { id: 'fixture-owner' } } } } },
      rpc: () => { calls.push('prepare'); return { maybeSingle: async () => ({ error: { message: 'match_not_completed' } }) } },
    }) },
    '@/lib/payments/deposit-server': { createPaymentServiceClient: () => { calls.push('service'); return {} } },
    '@/lib/payments/refund-settlement': { settleRefundWithProvider: () => assert.fail('No provider operation permitted') },
  })
  return { calls, post: (body, headers = {}) => handler.POST(new Request(`${origin}/api/matches/fixture/refund`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: 'fixture-match' }) }) }
}

test('cookie refund rejects foreign or absent Origin before authentication or money work', async () => {
  for (const Origin of ['https://other.example', 'https://sub.quantum.example', 'null', '']) {
    const f = fixture()
    assert.equal((await f.post({ refund_amount: 10000 }, { Origin })).status, 403)
    assert.deepEqual(f.calls, [])
  }
})

test('refund requires JSON content and an exact integer full-deposit amount', async () => {
  const f = fixture()
  assert.equal((await f.post({ refund_amount: 10000 }, { 'Content-Type': 'text/plain' })).status, 415)
  assert.deepEqual(f.calls, [])
  for (const body of [null, [], { refund_amount: 10000.9 }, { refund_amount: '10000' }, { refund_amount: 20000 }]) {
    const other = fixture()
    assert.equal((await other.post(body)).status, 400)
    assert.ok(!other.calls.includes('prepare'))
    assert.ok(!other.calls.includes('service'))
  }
})

test('same-origin full refund still reaches the authenticated eligibility RPC', async () => {
  const f = fixture()
  const response = await f.post({ refund_amount: 10000 })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, 'match_not_completed')
  assert.deepEqual(f.calls, ['auth', 'service', 'prepare'])
})

test('all retained deposit POST entry points reject foreign Origin before any client or money work', async () => {
  for (const path of ['app/api/deposits/route.ts', 'app/api/payments/deposit/route.ts', 'app/api/matches/[id]/deposit-carryover/route.ts']) {
    let touched = false
    const stop = () => { touched = true; throw new Error('session reached') }
    const route = load(path, {
      'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
      '@/lib/payments/request-guard': mutationGuard,
      '@/lib/supabase-request': { createSupabaseRequestClient: stop },
      '@/lib/supabase-server': { createSupabaseServerClient: stop },
      '@/lib/constants': { DEPOSIT_AMOUNT: 10000 },
      '@/lib/payments/deposit': {}, '@/lib/payments/deposit-server': {}, '@/lib/payments/toss': {}, '@/lib/utils': {},
    })
    const req = new Request(`${origin}/fixture`, { method: 'POST', headers: { Origin: 'https://other.example' } })
    let response
    try { response = await route.POST(req, { params: Promise.resolve({ id: 'fixture-match' }) }) } catch { /* assertion below */ }
    assert.equal(touched, false, `${path} must reject before authentication`)
    assert.equal(response?.status, 403, path)
  }
})

test('guard preserves body-free carryover and exact native bearer origin rules', () => {
  const create = headers => new Request(`${origin}/fixture`, { method: 'POST', headers })
  assert.equal(mutationGuard.guardDepositMutation(create({ Origin: origin }), false), null)
  assert.equal(mutationGuard.guardDepositMutation(create({ Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' })), null)
  assert.equal(mutationGuard.guardDepositMutation(create({ Authorization: 'Bearer fixture-token', Origin: 'https://other.example' }))?.status, 403)
  assert.equal(mutationGuard.guardDepositMutation(create({ Authorization: 'Bearer malformed token', Origin: origin }))?.status, 401)
})
