import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
const id = '10000000-0000-4000-8000-000000000001'
const url = `https://quantum.example/api/meetups/${id}/application`
async function load(path, deps = {}) {
  const code = ts.transpileModule(await readFile(new URL('../../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('exports', 'require', code)(exports, name => { assert.ok(Object.hasOwn(deps, name), name); return deps[name] })
  return exports
}
const contract = await load('lib/meetups/admission-contract.ts')
class ServerError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status } }
const detail = { id, category: 'study', activity_key: null, title: '공학수학', description: '함께해요', scheduled_at: null, place_name: null, member_count: 1, capacity: 4, status: 'open', joined: false, is_host: false, members: [{ secret: 'not for applicants' }] }
const input = { intro: '함께 공부해요', paymentMethod: 'new', consent: true, quoteId: id, policyVersion: 'v1', idempotencyKey: id }
async function harness(options = {}) {
  const calls = [], state = { configured: true, user: { id }, authError: null, detail, ...options }
  const route = await load('app/api/meetups/[id]/application/route.ts', {
    '@/lib/auth/trusted-origin': { assertTrustedMutationOrigin: req => { if (req.method === 'POST' && req.headers.get('origin') !== 'https://quantum.example') throw new ServerError('request_not_allowed', 403) } },
    '@/lib/supabase-request': { createSupabaseRequestClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) }, rpc: async name => { calls.push(name); return { data: state.detail, error: null } } }) },
    '@/lib/utils': { isSupabaseConfigured: () => state.configured },
    '@/lib/meetups/http': { meetupJson: (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }), meetupRpcErrorResponse: () => Response.json({}, { status: 503 }), meetupInputErrorResponse: error => Response.json({ error: error.message }, { status: error.status ?? 400 }) },
    '@/lib/meetups/admission-contract': contract,
    '@/lib/meetups/admission-server': { AdmissionServerError: ServerError, getMeetupAdmissionContext: async () => ({ room: { kind: 'custom_meetup', id }, quote: null, policy: null, checkoutEnabled: false, preparationOnly: true }), prepareMeetupAdmission: async (_, roomId, parsed) => { calls.push(['prepare', roomId, parsed]); return { applicationId: null, intentId: id, admission: 'draft', payment: 'unpaid', preparation: 'prepared', checkoutEnabled: false, reused: false } } },
  })
  return { route, calls }
}
const context = { params: Promise.resolve({ id }) }
const post = (extra = {}, origin = 'https://quantum.example') => new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ ...input, ...extra }) })
test('context returns deposit unavailable, not free, and omits member details', async () => {
  const { route } = await harness(), response = await route.GET(new Request(url), context), data = await response.json()
  assert.equal(response.status, 200); assert.equal(data.quote, null); assert.equal(data.policy, null)
  assert.equal(data.checkoutEnabled, false); assert.equal(data.meetup.members, undefined)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
})
test('prepared application is not a paid, submitted, or accepted application', async () => {
  const { route, calls } = await harness(), response = await route.POST(post(), context), data = await response.json()
  assert.equal(response.status, 200); assert.equal(data.applicationId, null); assert.equal(data.payment, 'unpaid'); assert.equal(data.admission, 'draft')
  assert.equal(calls.filter(call => Array.isArray(call)).length, 1)
})
test('tampered amount, consent, unknown identity, and cross-origin writes never prepare', async () => {
  for (const [extra, origin, status] of [[{ amountKrw: 1 }, undefined, 400], [{ consent: false }, undefined, 400], [{ user_id: id }, undefined, 400], [{}, 'https://evil.example', 403]]) {
    const { route, calls } = await harness(); assert.equal((await route.POST(post(extra, origin), context)).status, status); assert.equal(calls.some(call => Array.isArray(call)), false)
  }
})
test('auth failure, nonmember scope failure and configuration never become empty success', async () => {
  for (const [options, status] of [[{ user: null }, 401], [{ authError: {} }, 503], [{ configured: false }, 503], [{ detail: { ...detail, joined: true } }, 409], [{ detail: { ...detail, is_host: true } }, 409], [{ detail: { ...detail, status: 'full' } }, 409]]) {
    const { route, calls } = await harness(options); assert.equal((await route.POST(post(), context)).status, status); assert.equal(calls.some(call => Array.isArray(call)), false)
  }
})
