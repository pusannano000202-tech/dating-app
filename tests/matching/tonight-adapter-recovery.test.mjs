import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function load(path, deps = {}, fetch = () => assert.fail('No external network')) {
  const exports = {}
  const text = await readFile(new URL('../../' + path, import.meta.url), 'utf8')
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  new Function('exports', 'require', 'fetch', js)(exports, name => {
    assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`)
    return deps[name]
  }, fetch)
  return exports
}

async function fixture(help) {
  const calls = []
  const errors = await load('components/tonight/tonight-journey-errors.ts')
  const { createLiveUserTonightAdapter } = await load('components/tonight/live-adapters.ts', {
    '@/lib/matching/event-calendar-stats': await load('lib/matching/event-calendar-stats.ts'),
    '@/lib/payments/toss-browser': {},
    './tonight-journey-errors': errors,
    '@/lib/matching/tonight-ranked/read-with-deadline': await load('lib/matching/tonight-ranked/read-with-deadline.ts'),
    '@/lib/places/contracts': { PLACE_ADDRESS_EVIDENCE: [], PLACE_COORDINATE_EVIDENCE: [] },
    '@/lib/places/venue-snapshot': {},
    '@/lib/participation/summary': { parseParticipationSummary: () => null },
  }, async (path, init) => {
    calls.push({ path, signal: init?.signal, method: init?.method ?? 'GET' })
    if (path === '/api/tonight') return Response.json({ round: {
      round: { id: 'owned-round', status: 'accepted' },
      activities: [1, 2, 3].map(id => ({ id: String(id) })),
      application: { id: 'owned-application', status: 'allocated', deposit: { status: 'paid', amount: 10000 } },
    }, applications_open: false, participation_summary: null })
    if (path.includes('/journey?')) return Response.json({ journey: {
      application_id: 'owned-application', team_id: 'owned-team', can_reveal_exact_venue: true,
    } })
    if (path.includes('/arrival-help?')) return help(init)
    assert.fail(path)
  })
  return { adapter: createLiveUserTonightAdapter(), calls, errors }
}

test('arrival-help service failure retains owned paid participation with explicit help unavailability', async () => {
  for (const help of [() => Response.json({ error: 'service_unavailable' }, { status: 503 }), () => { throw new Error('network') }]) {
    const f = await fixture(help)
    const data = await f.adapter.load()
    assert.equal(data.application.id, 'owned-application')
    assert.equal(data.application.deposit.status, 'paid')
    assert.equal(data.journey.teamId, 'owned-team')
    assert.equal(data.arrivalHelpAvailable, false)
    assert.equal(data.arrivalHelpRequest, null)
    assert.ok(f.calls.every(call => call.signal instanceof AbortSignal && call.method === 'GET'))
  }
})

test('only a successful explicit null help result is known absence; malformed success stays unavailable', async () => {
  for (const [body, available] of [[{ arrival_help: null }, true], [{}, false], [{ arrival_help: {} }, false]]) {
    const f = await fixture(() => Response.json(body))
    assert.equal((await f.adapter.load()).arrivalHelpAvailable, available)
  }
})

test('access denial in help still clears the full private snapshot', async () => {
  for (const status of [401, 403]) {
    const f = await fixture(() => Response.json({ error: 'forbidden' }, { status }))
    await assert.rejects(f.adapter.load(), error => error instanceof f.errors.TonightAccessError)
  }
})

test('owner cancellation reaches the active transport and cannot return a partial snapshot', async () => {
  let entered
  const inHelp = new Promise(resolve => { entered = resolve })
  const f = await fixture(init => new Promise((_, reject) => {
    entered()
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
  }))
  const owner = new AbortController()
  const pending = f.adapter.load({ signal: owner.signal })
  await inHelp
  owner.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.ok(f.calls.every(call => call.signal.aborted))
})
