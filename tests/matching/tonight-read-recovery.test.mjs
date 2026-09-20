import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Run the actual route with a controlled RPC transport; no DB, secrets or network.
async function moduleFrom(path, deps = {}) {
  const exports = {}
  const source = await readFile(new URL('../../' + path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('exports', 'require', 'fetch', compiled)(exports, name => {
    assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`)
    return deps[name]
  }, () => assert.fail('No external requests in this fixture'))
  return exports
}

const round = {
  round: { id: 'owned-round', status: 'open', signup_open_at: '2020-01-01T00:00:00Z', signup_close_at: '2090-01-01T00:00:00Z' },
  application: { id: 'owned-application', status: 'allocated', deposit: { status: 'paid' } },
}
const result = data => ({ data, error: null })
async function routeFixture(overrides = {}, authorized = true) {
  const calls = []
  const defaults = {
    get_my_current_tonight_round: () => result(round),
    get_my_tonight_participation_summary: () => result(null),
    get_my_current_tonight_team_count: () => result(null),
    get_tonight_application_gate: () => result(true),
  }
  class RequestGuardError extends Error {}
  const route = await moduleFrom('app/api/tonight/route.ts', {
    '@/lib/auth/server-guards': {
      RequestGuardError,
      requireRequestAccess: async (_request, options) => {
        assert.deepEqual(options.allowedRoles, ['user'])
        if (!authorized) throw new RequestGuardError()
      },
      requestGuardErrorResponse: () => Response.json({ error: 'unauthenticated' }, { status: 401 }),
    },
    '@/lib/supabase-request': { createSupabaseRequestClient: () => ({ rpc: (name, args) => {
      const call = { name, args, signal: null }
      calls.push(call)
      const pending = Promise.resolve().then(() => (overrides[name] ?? defaults[name])())
      pending.abortSignal = signal => { call.signal = signal; return pending }
      return pending
    } }) },
    '@/lib/matching/tonight-ranked/runtime': { getTonightFeatureState: () => ({ visible: true, applicationsOpen: true }) },
    '@/lib/matching/tonight-ranked/read-with-deadline': await moduleFrom('lib/matching/tonight-ranked/read-with-deadline.ts'),
    '@/lib/server/tonight/api-contract': await moduleFrom('lib/server/tonight/api-contract.ts'),
    '@/lib/matching/event-calendar-stats': await moduleFrom('lib/matching/event-calendar-stats.ts'),
  })
  return { calls, get: () => route.GET(new Request('https://quantum.test/api/tonight')) }
}

test('optional count transport failure preserves the owned application and never invents zero', async () => {
  const f = await routeFixture({ get_my_tonight_participation_summary: () => { throw new Error('network') } })
  const response = await f.get()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.round, round)
  assert.equal(body.participation_summary, null)
  assert.equal(body.round_stats, null)
})

test('gate transport failure preserves the receipt but fails closed on new applications', async () => {
  const f = await routeFixture({ get_tonight_application_gate: () => { throw new Error('network') } })
  const response = await f.get()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.round, round)
  assert.equal(body.applications_available, false)
  assert.equal(body.applications_open, false)
})

test('explicit access denial still rejects private snapshots, including optional reads', async () => {
  for (const name of ['get_my_tonight_participation_summary', 'get_my_current_tonight_team_count', 'get_tonight_application_gate']) {
    for (const reject of [false, true]) {
      const f = await routeFixture({ [name]: () => {
        if (reject) throw new Error('membership_required')
        return { data: null, error: { message: 'membership_required' } }
      } })
      const response = await f.get()
      assert.equal(response.status, 403)
      assert.equal((await response.json()).round, undefined)
    }
  }
  const anonymous = await routeFixture({}, false)
  assert.equal((await anonymous.get()).status, 401)
  assert.deepEqual(anonymous.calls, [])
})

test('a failed mandatory round stays a service error, not no recruitment', async () => {
  const f = await routeFixture({ get_my_current_tonight_round: () => { throw new Error('network') } })
  assert.equal((await f.get()).status, 503)
  assert.equal(f.calls.length, 1)
})

test('independent aggregate and gate reads start together after the owned round is known', async () => {
  const started = []
  let release
  const held = new Promise(resolve => { release = resolve })
  const names = ['get_my_tonight_participation_summary', 'get_my_current_tonight_team_count', 'get_tonight_application_gate']
  const f = await routeFixture(Object.fromEntries(names.map(name => [name, async () => {
    started.push(name)
    await held
    return result(name === 'get_tonight_application_gate' ? true : null)
  }])))
  const pending = f.get()
  await new Promise(resolve => setImmediate(resolve))
  release()
  assert.deepEqual([...started].sort(), [...names].sort())
  assert.equal((await pending).status, 200)
})

test('a hanging optional read is bounded and cancelled without hiding the owned receipt', async () => {
  await Promise.all(['get_my_tonight_participation_summary', 'get_my_current_tonight_team_count', 'get_tonight_application_gate'].map(async name => {
    const f = await routeFixture({ [name]: () => new Promise(() => {}) })
    let watchdog
    try {
      const response = await Promise.race([f.get(), new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error(`unbounded optional read: ${name}`)), 3000)
      })])
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.deepEqual(body.round, round)
      assert.equal(f.calls.find(call => call.name === name).signal?.aborted, true)
      if (name === 'get_tonight_application_gate') {
        assert.equal(body.applications_open, false)
        assert.equal(body.applications_available, false)
      }
    } finally { clearTimeout(watchdog) }
  }))
})
