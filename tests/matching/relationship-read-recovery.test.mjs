import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const couple = { status: 'in_relationship', changed_at: '2026-09-01T00:00:00Z', next_change_at: '2026-10-01T00:00:00Z', can_change: false, server_now: '2026-09-20T00:00:00Z' }
const single = { status: 'single', changed_at: null, next_change_at: null, can_change: true, server_now: '2026-09-20T00:00:00Z' }

async function load(path, deps = {}, transport = () => assert.fail('No external network')) {
  const source = await readFile(new URL('../../' + path, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  new Function('exports', 'require', 'fetch', 'window', js)(exports, name => {
    assert.ok(Object.hasOwn(deps, name), `Unexpected dependency ${name}`)
    return deps[name]
  }, transport, { setTimeout, clearTimeout })
  return exports
}

async function fixture() {
  let owner = 'account-a', cursor = 0, transport = async () => Response.json({ data: couple })
  const slots = []
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial } },
    useCallback: callback => callback,
    useEffect: () => {}, // Explicit refreshes; does not claim React lifecycle/browser proof.
  }
  const { useRelationshipState } = await load('components/relationship/useRelationshipState.ts', {
    react,
    '@/components/content-history/useHistoryAccount': { useHistoryAccount: () => owner },
    '@/lib/relationship/contract': await load('lib/relationship/contract.ts'),
  }, (...args) => transport(...args))
  return {
    render: () => { cursor = 0; return useRelationshipState() },
    setTransport: next => { transport = next },
    setOwner: next => { owner = next },
  }
}

test('401/403 clear the previous relationship even if the denial body is not JSON', async () => {
  for (const status of [401, 403]) {
    const f = await fixture()
    await f.render().refresh()
    assert.equal(f.render().state.status, 'in_relationship')
    f.setTransport(async () => new Response('not JSON', { status }))
    await f.render().refresh()
    assert.equal(f.render().state, null)
    assert.equal(f.render().unavailable, true)
  }
})

test('transient relationship failures preserve only the same account setting and offer retry', async () => {
  for (const transport of [async () => Response.json({}, { status: 503 }), async () => { throw new Error('offline') }]) {
    const f = await fixture()
    await f.render().refresh()
    f.setTransport(transport)
    await f.render().refresh()
    assert.equal(f.render().state.status, 'in_relationship')
    assert.equal(f.render().unavailable, true)
  }
})

test('an old account response cannot repopulate or erase the next account snapshot', async () => {
  for (const lateStatus of [200, 403]) {
    const f = await fixture()
    await f.render().refresh()
    let release
    f.setTransport(() => new Promise(resolve => { release = resolve }))
    const oldRead = f.render().refresh()
    f.setOwner('account-b')
    assert.equal(f.render().state, null)
    f.setTransport(async () => Response.json({ data: single }))
    await f.render().refresh()
    release(Response.json({ data: couple }, { status: lateStatus }))
    await oldRead
    assert.equal(f.render().state.status, 'single')
    assert.equal(f.render().unavailable, false)
  }
})
