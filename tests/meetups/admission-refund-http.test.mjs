import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
async function load(path, deps = {}) {
  const exports = {}, code = ts.transpileModule(await readFile(new URL('../../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('exports', 'require', code)(exports, name => { assert.ok(Object.hasOwn(deps, name), name); return deps[name] })
  return exports
}
const refund = await load('lib/meetups/admission-refund.ts')
const account = await load('lib/account/deletion-contract.ts')
class AdmissionServerError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status } }
const bodyReader = await load('lib/meetups/native-admission-http.ts', { './admission-http': {}, './admission-server': { AdmissionServerError }, './native-admission-contract': {} })
const id = n => `${n}`.repeat(8) + '-' + `${n}`.repeat(4) + '-4' + `${n}`.repeat(3) + '-8' + `${n}`.repeat(3) + '-' + `${n}`.repeat(12)
const owner = id(1), depositId = id(2), requestId = id(3), roomId = id(4)
const summary = { depositId, requestId, room: { kind: 'study', id: roomId }, roomTitle: '공학수학', amountKrw: 10000, payment: 'refund_due', refundState: 'requested', requestedAt: '2026-09-14T00:00:00Z', approvedAt: null, completedAt: null, lastError: null }
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } })
async function harness(options = {}) {
  const calls = [], state = { loggedIn: true, role: 'super_admin', recent: true, ...options }
  const rpc = async (name, args) => { calls.push([name, args]); return { data: name.startsWith('list_') ? [ { ...summary, paymentKey: 'SECRET', ownerId: 'PRIVATE' } ] : summary, error: state.rpcError ?? null } }
  const requireRequestAccess = async (request, guard = {}) => {
    calls.push(['auth', guard])
    if (!state.loggedIn) throw { status: 401 }
    if (guard.allowedRoles && state.role !== 'super_admin' || !['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== 'https://quantum.example') throw { status: 403 }
    // This existing guard is intentionally super-admin-only, NOT a generic
    // recently-signed-in-member check. Ordinary members must not invoke it.
    if (guard.requireRecentAuth && (!state.recent || state.role !== 'super_admin')) throw { status: 403 }
    return { userId: owner }
  }
  const common = {
    '@/lib/auth/server-guards': { requireRequestAccess, requestGuardErrorResponse: e => json({ error: 'guarded' }, e.status ?? 503) },
    '@/lib/supabase-request': { createSupabaseRequestClient: () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: owner, last_sign_in_at: state.recent ? new Date().toISOString() : '2000-01-01T00:00:00Z' } }, error: null }) } }) },
    '@/lib/account/deletion-contract': account,
    '@/lib/payments/deposit-server': { createPaymentServiceClient: () => ({ rpc }) },
    './admission-server': { AdmissionServerError }, './native-admission-http': bodyReader, './http': { meetupJson: json }, './admission-refund': refund,
  }
  const http = await load('lib/meetups/admission-refund-http.ts', common)
  return { calls, state, http }
}
const request = (body, headers = {}) => new Request('https://quantum.example/api/refunds', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://quantum.example', 'X-Quantum-Owner': owner, ...headers }, body: JSON.stringify(body) })
test('user refund request derives identity from authentication and returns only safe ledger fields', async () => {
  const f = await harness(), read = await f.http.admissionRefundList(new Request('https://quantum.example/api/refunds'))
  const listed = await read.json(); assert.deepEqual(listed, { accountKey: owner, refunds: [summary] })
  assert.match(read.headers.get('cache-control'), /no-store/)
  const response = await f.http.admissionRefundMutation(request({ depositId }))
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { accountKey: owner, refund: summary })
  assert.deepEqual(f.calls.at(-1), ['request_my_meetup_admission_refund', { p_deposit_id: depositId }])
  assert.ok(f.calls.every(c => c[0] !== 'auth' || !c[1].requireRecentAuth))
})
test('ordinary recently authenticated member can request without super-admin session RPC', async () => {
  const f = await harness({ role: 'user' })
  assert.equal((await f.http.admissionRefundMutation(request({ depositId }))).status, 200)
})
test('anonymous, changed account, stale auth and cross-origin mutations never reach money RPC', async () => {
  for (const [options, headers, status] of [[{ loggedIn: false }, {}, 401], [{ recent: false }, {}, 403], [{}, { 'X-Quantum-Owner': roomId }, 409], [{}, { Origin: 'https://evil.example' }, 403]]) {
    const f = await harness(options)
    assert.equal((await f.http.admissionRefundMutation(request({ depositId }, headers))).status, status)
    assert.equal(f.calls.filter(c => c[0] !== 'auth').length, 0)
  }
})
test('browser cannot choose payee, amount, owner, worker state or provider evidence', async () => {
  for (const field of ['amountKrw', 'ownerId', 'accountNumber', 'paymentKey', 'approved', 'paid', 'providerTransactionKey']) {
    const f = await harness()
    assert.equal((await f.http.admissionRefundMutation(request({ depositId, [field]: 'injected' }))).status, 400)
    assert.equal(f.calls.filter(c => c[0] !== 'auth').length, 0)
  }
  const f = await harness()
  assert.equal((await f.http.admissionRefundMutation(request({ depositId: 'a'.repeat(2200) }))).status, 413)
})
test('admin list/review enforce current super-admin and recent auth, send verified actor only', async () => {
  const denied = await harness({ role: 'partner' })
  assert.equal((await denied.http.admissionRefundMutation(request({ depositId, requestId, action: 'approve' }), true)).status, 403)
  assert.equal(denied.calls.length, 1)
  const f = await harness(), response = await f.http.admissionRefundMutation(request({ depositId, requestId, action: 'approve' }), true)
  assert.equal(response.status, 200)
  assert.deepEqual(f.calls[0], ['auth', { allowedRoles: ['super_admin'], requireRecentAuth: true }])
  assert.deepEqual(f.calls[1], ['review_meetup_admission_refund_for_service', { p_actor: owner, p_deposit_id: depositId, p_request_id: requestId, p_action: 'approve' }])
  assert.equal((await f.http.admissionRefundMutation(request({ depositId, requestId, action: 'complete' }), true)).status, 400)
})
test('database outages are not reported as empty ledgers and raw errors do not escape', async () => {
  const f = await harness({ rpcError: { message: 'private-payment-key-leaked-in-provider-error' } })
  const response = await f.http.admissionRefundList(new Request('https://quantum.example/api/refunds'))
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'refund_service_unavailable' })
})
test('internal worker remains disabled by default; caller cannot inject claim data', async () => {
  const original = { CRON_SECRET: process.env.CRON_SECRET, TOSS_SECRET_KEY: process.env.TOSS_SECRET_KEY, QUANTUM_MEETUP_REFUNDS_ENABLED: process.env.QUANTUM_MEETUP_REFUNDS_ENABLED }
  try {
    delete process.env.QUANTUM_MEETUP_REFUNDS_ENABLED
    let dbCalls = 0
    const worker = await load('app/api/internal/meetups/refunds/process/route.ts', {
      'node:crypto': { randomUUID: () => id(5) }, '@/lib/auth/internal-request': { isAuthorizedInternalRequest: value => value === 'Bearer fixture' },
      '@/lib/payments/deposit-server': { createPaymentServiceClient: () => { dbCalls++; return {} } },
      '@/lib/payments/toss': {}, '@/lib/meetups/admission-refund': refund, '@/lib/meetups/http': { meetupJson: json },
    })
    assert.equal((await worker.POST(request({ depositId, approved: true }))).status, 401)
    assert.equal((await worker.POST(request({ depositId, approved: true }, { Authorization: 'Bearer fixture' }))).status, 503)
    assert.equal(dbCalls, 0)
  } finally { for (const [k, v] of Object.entries(original)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } }
})
