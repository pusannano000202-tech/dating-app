import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(path, deps = {}) {
  const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
  const exports = {}
  new Function('exports', 'require', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports, name => {
    assert.ok(Object.hasOwn(deps, name), name)
    return deps[name]
  })
  return exports
}
const catalog = load('lib/community/catalog.ts')
const contracts = load('lib/meetups/contracts.ts', {
  '../community/catalog': catalog, '../community/contracts': {}, '../community/department-rooms': {},
})
const id = '10000000-0000-4000-8000-000000000001'
const cursor = JSON.stringify([null, '2026-09-22T00:00:00Z', id])
function harness({ user = { id }, error = null } = {}) {
  const calls = []
  const route = load('app/api/meetups/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/community/contracts': { isMeetupCategory: value => ['other', 'dining'].includes(value), parseCommunityListLimit: value => Math.max(1, Math.min(Number(value) || 30, 30)) },
    '@/lib/community/department-rooms': { parseMeetupScope: value => ['school', 'department'].includes(value) ? value : null },
    '@/lib/community/meetup-gender': { isMeetupGenderMode: value => ['all', 'male_only', 'female_only'].includes(value) },
    '@/lib/meetups/contracts': contracts,
    '@/lib/meetups/list-page': load('lib/meetups/list-page.ts'),
    '@/lib/meetups/http': { meetupRpcErrorResponse: () => Response.json({ error: 'community_schema_unavailable' }, { status: 503 }) },
    '@/lib/supabase-request': { createSupabaseRequestClient: () => ({ auth: { getUser: async () => ({ data: { user } }) }, rpc: async (name, args) => { calls.push({ name, args }); return { data: [], error } } }) },
    '@/lib/auth/trusted-origin': {}, '@/lib/utils': { isSupabaseConfigured: () => true },
  })
  return { calls, get: query => route.GET({ nextUrl: new URL('https://example.test/api/meetups?' + query) }) }
}

test('exact activity listing uses v5 with the unchanged scope, gender and keyset contract', async () => {
  const f = harness()
  const result = await f.get('activity_key=campus-small-shop&category=other&scope_type=school&gender_mode=all&limit=3&cursor=' + encodeURIComponent(cursor))
  assert.equal(result.status, 200)
  assert.deepEqual(f.calls, [{ name: 'list_activity_meetups_v5', args: { p_category: 'other', p_limit: 4, p_gender_mode: 'all', p_scope_type: 'school', p_cursor: cursor, p_activity_key: 'campus-small-shop' } }])
  assert.deepEqual(await result.json(), { meetups: [], availability: 'ready', has_more: false, next_cursor: null })
})
test('activity category is optional; absent activity retains v4 rather than filtering a limited page', async () => {
  const selected = harness()
  assert.equal((await selected.get('activity_key=campus-small-shop')).status, 200)
  assert.equal(selected.calls[0].name, 'list_activity_meetups_v5')
  assert.equal(selected.calls[0].args.p_category, null)
  const legacy = harness()
  assert.equal((await legacy.get('category=dining')).status, 200)
  assert.equal(legacy.calls[0].name, 'list_activity_meetups_v4')
  assert.equal(Object.hasOwn(legacy.calls[0].args, 'p_activity_key'), false)
})
test('unknown, blank and category-mismatched activities are rejected before RPC', async () => {
  for (const query of ['activity_key=', 'activity_key=unknown', 'activity_key=campus-small-shop&category=dining', 'activity_key=%20campus-small-shop', 'activity_key=null']) {
    const f = harness(), response = await f.get(query)
    assert.equal(response.status, 400, query)
    assert.deepEqual(await response.json(), { error: 'invalid_activity_key' })
    assert.deepEqual(f.calls, [])
  }
})
test('catalog validation accepts every exact activity and rejects a mismatched category', () => {
  for (const idea of catalog.featuredMeetupIdeas) {
    assert.equal(contracts.isMeetupListActivity(idea.id, null), true)
    assert.equal(contracts.isMeetupListActivity(idea.id, idea.category), true)
    assert.equal(contracts.isMeetupListActivity(idea.id, idea.category === 'other' ? 'dining' : 'other'), false)
  }
})
test('unauthenticated requests cannot enumerate activities; missing v5 fails closed without broader fallback', async () => {
  const anonymous = harness({ user: null })
  assert.equal((await (await anonymous.get('activity_key=campus-small-shop')).json()).availability, 'auth_required')
  assert.deepEqual(anonymous.calls, [])
  const unavailable = harness({ error: { message: 'function does not exist' } })
  assert.equal((await unavailable.get('activity_key=campus-small-shop')).status, 503)
  assert.deepEqual(unavailable.calls.map(call => call.name), ['list_activity_meetups_v5'])
})
