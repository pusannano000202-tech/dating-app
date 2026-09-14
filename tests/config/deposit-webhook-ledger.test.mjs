import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'
import { schemaSql, migrationsSql } from './deposit-webhook-fixture.mjs'

const root = new URL('../../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
function load(path, dependencies = {}) {
  const code = ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText
  const exports = {}
  new Function('exports', 'require', code)(exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `Blocked dependency: ${name}`)
    return dependencies[name]
  })
  return exports
}
const toss = load('lib/payments/toss.ts')
const full = () => ({ paymentKey: 'fixture-payment', orderId: 'fixture-order', totalAmount: 10000,
  balanceAmount: 0, status: 'CANCELED', lastTransactionKey: 'cancel-full',
  cancels: [{ cancelStatus: 'DONE', cancelAmount: 10000, transactionKey: 'cancel-full',
    refundableAmount: 0, canceledAt: '2026-09-14T00:00:00Z' }] })
const partial = () => ({ ...full(), balanceAmount: 6000, status: 'PARTIAL_CANCELED',
  lastTransactionKey: 'cancel-partial', cancels: [{ cancelStatus: 'DONE', cancelAmount: 4000,
    transactionKey: 'cancel-partial', refundableAmount: 6000, canceledAt: '2026-09-13T00:00:00Z' }] })

async function fixture({ request = true, processed = false } = {}) {
  const db = new PGlite()
  const ids = { deposit: randomUUID(), request: randomUUID(), match: randomUUID(), group: randomUUID(), user: randomUUID() }
  await db.exec(schemaSql + migrationsSql())
  await db.query(`insert into deposits values($1,$2,$3,$4,10000,$5,'fixture-order','fixture-payment',$6,$7,null,null)`,
    [ids.deposit, ids.match, ids.group, ids.user, processed ? 'refunded' : 'held', processed ? 4000 : 0, processed ? 6000 : 0])
  if (request) await db.query(`insert into deposit_refund_requests(id,deposit_id,match_id,user_id,
    requested_refund_amount,status,provider,provider_status,settlement_key,provider_payment_key,provider_order_id,
    settled_refund_amount) values($1,$2,$3,$4,4000,$5,$6,$7,$8,$9,$10,$11)`,
    [ids.request, ids.deposit, ids.match, ids.user, processed ? 'processed' : 'pending',
      processed ? 'toss' : null, processed ? 'PARTIAL_CANCELED' : null, processed ? 'cancel-partial' : null,
      processed ? 'fixture-payment' : null, processed ? 'fixture-order' : null, processed ? 4000 : null])
  const calls = []
  const service = {
    from(table) {
      assert.ok(['deposits', 'deposit_refund_requests'].includes(table))
      const filters = []; let values = null
      const chain = { select: () => chain, eq: (key, value) => { filters.push([key, [value]]); return chain },
        in: (key, value) => { filters.push([key, value]); return chain }, update: value => { values = value; return chain },
        maybeSingle: async () => {
          const args = []; const field = key => { assert.match(key, /^[a-z_]+$/); return key }
          const set = values ? Object.entries(values).map(([key, value]) => `${field(key)}=$${args.push(value)}`).join(',') : ''
          const where = filters.map(([key, entries]) => `${field(key)} in (${entries.map(value => '$'+args.push(value)).join(',')})`).join(' and ')
          const sql = values ? `update ${table} set ${set} where ${where} returning *` : `select * from ${table} where ${where}`
          const result = await db.query(sql, args)
          return { data: result.rows[0] ?? null, error: result.rows.length > 1 ? 'multiple rows' : null }
        } }
      return chain
    },
    rpc(name, args) {
      calls.push(name)
      const run = async () => {
        try {
          const entries = Object.entries(args)
          const result = await db.query(`select * from public.${name}(${entries.map(([key], i) => `${key}=>$${i+1}`).join(',')})`, entries.map(([,v]) => v))
          return { data: result.rows[0] ?? null, error: null }
        } catch (error) { return { data: null, error: { message: error.message } } }
      }
      return { maybeSingle: run, then: (resolve, reject) => run().then(resolve, reject) }
    },
  }
  let payment = full()
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@supabase/supabase-js': { createClient: () => service },
    '@/lib/constants': { DEPOSIT_AMOUNT: 10000 },
    '@/lib/payments/deposit': { resolveDepositPaymentProvider: () => 'toss', getDepositPaymentReadiness: () => ({ ok: true }) },
    '@/lib/payments/toss': { ...toss, getTossPayment: async () => payment, getTossPaymentByOrderId: async () => payment },
    '@/lib/supabase-admin': { getSupabaseAdminKey: () => 'synthetic-service' },
    '@/lib/utils': { getSupabaseUrl: () => 'https://fixture.invalid' },
  }
  const route = load('app/api/payments/deposit/webhook/route.ts', dependencies)
  return { db, ids, calls, service,
    async post(receipt = full(), event = {}) {
      payment = receipt
      return route.POST(new Request('https://fixture.invalid/webhook', { method: 'POST',
        body: JSON.stringify({ eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'fixture-payment' }, ...event }) }))
    },
    async ledger() { return { deposit: (await db.query('select * from deposits')).rows[0], request: (await db.query('select * from deposit_refund_requests')).rows[0] } },
    async reconcile(receipt = full(), overrides = {}) {
      return service.rpc('reconcile_toss_deposit_cancellation', { p_deposit_id: ids.deposit, p_match_id: ids.match,
        p_group_id: ids.group, p_user_id: ids.user, p_payment: receipt, ...overrides }).maybeSingle()
    },
    async claim() { return (await db.query('select * from claim_pending_refund_requests($1,5,120)', [randomUUID()])).rows },
  }
}

test('full PG cancellation settles pending partial request and prevents another worker claim', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.post()).status, 200)
    const { deposit, request } = await f.ledger()
    assert.equal(deposit.refunded_amount, 10000)
    assert.equal(request.status, 'processed')
    assert.equal(request.requested_refund_amount, 4000)
    assert.equal(request.settled_refund_amount, 10000)
    assert.equal(request.provider_status, 'CANCELED')
    assert.deepEqual(await f.claim(), [])
  } finally { await f.db.close() }
})

test('full PG cancellation advances a processed partial request without leaving split totals', async () => {
  const f = await fixture({ processed: true })
  try {
    const receipt = { ...full(), cancels: [...partial().cancels,
      { ...full().cancels[0], cancelAmount: 6000 }] }
    assert.equal((await f.post(receipt)).status, 200)
    const { request, deposit } = await f.ledger()
    assert.equal(request.settled_refund_amount, deposit.refunded_amount)
    assert.equal(request.settled_refund_amount, 10000)
    assert.equal(request.provider_reconciliation_history[0].previous.settled_refund_amount, 4000)
    assert.equal(request.provider_reconciliation_history[0].previous.settlement_key, 'cancel-partial')
  } finally { await f.db.close() }
})

test('duplicate and reverse partial/full delivery preserve one full settlement and notification', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.post()).status, 200)
    const first = await f.ledger()
    for (const receipt of [full(), partial(), full(), { ...full(), status: 'DONE' }]) {
      assert.equal((await f.post(receipt)).status, 200)
      assert.deepEqual(await f.ledger(), first)
    }
    assert.equal((await f.db.query('select count(*)::int n from notifications')).rows[0].n, 1)
    assert.equal(first.request.provider_request_key, null, 'webhook must not invent a provider request')
  } finally { await f.db.close() }
})

test('partial then cumulative full receipt advances actual amounts and keeps original user choice', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.post(partial())).status, 200)
    assert.equal((await f.ledger()).request.settled_refund_amount, 4000)
    assert.equal((await f.post({ ...full(), cancels: [...partial().cancels,
      { ...full().cancels[0], cancelAmount: 6000 }] })).status, 200)
    const { request, deposit } = await f.ledger()
    assert.equal(request.settled_refund_amount, 10000)
    assert.equal(request.requested_refund_amount, 4000)
    assert.equal(deposit.retained_amount, 0)
    assert.equal(request.provider_reconciliation_history.length, 2)
  } finally { await f.db.close() }
})

test('pending leased worker retry returns cumulative actual revenue without regressing full cancellation', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.claim()).length, 1)
    const claim = (await f.ledger()).request
    assert.ok(claim.settlement_lease_id)
    await f.db.query("update deposit_refund_requests set settlement_last_error='prior_provider_timeout'")
    assert.equal((await f.post()).status, 200)
    const settled = await f.ledger()
    const late = await f.service.rpc('finalize_refund_request', {
      p_refund_request_id: f.ids.request, p_settlement_version: 1, p_provider: 'toss',
      p_settlement_key: 'cancel-partial', p_provider_request_key: 'original-request',
      p_provider_status: 'PARTIAL_CANCELED', p_provider_payment_key: 'fixture-payment',
      p_provider_order_id: 'fixture-order', p_settled_refund_amount: 4000,
    }).maybeSingle()
    assert.equal(late.error, null)
    assert.equal(late.data.app_revenue, 0)
    assert.equal(late.data.settled_refund_amount, 10000)
    assert.deepEqual(await f.ledger(), settled)
    assert.equal(settled.request.settlement_lease_id, null)
    assert.equal(settled.request.settlement_next_retry_at, null)
    assert.equal(settled.request.provider_reconciliation_history[0].previous.last_error, 'prior_provider_timeout')
    assert.deepEqual(await f.claim(), [])
    const release = await f.db.query('select release_refund_request_lease($1,$2,$3,300) result',
      [f.ids.request, claim.settlement_lease_id, 'late_worker_failure'])
    assert.equal(release.rows[0].result, false)
    assert.deepEqual(await f.ledger(), settled)
  } finally { await f.db.close() }
})

test('unverified or mismatched receipts leave pending evidence and retryable worker state untouched', async () => {
  const f = await fixture()
  try {
    await f.claim()
    await f.db.query("update deposit_refund_requests set settlement_last_error='retryable_timeout'")
    const initial = await f.ledger()
    const receipts = [
      { ...full(), paymentKey: 'other-payment' }, { ...full(), orderId: 'other-order' },
      { ...full(), totalAmount: 20000 }, { ...full(), totalAmount: '10000' },
      { ...full(), balanceAmount: 1 }, { ...full(), balanceAmount: undefined },
      { ...full(), lastTransactionKey: 'unrelated' }, { ...full(), cancels: [] },
      { ...full(), cancels: [{ ...full().cancels[0], cancelAmount: 4000 }] },
      { ...full(), cancels: [{ ...full().cancels[0], cancelAmount: -10000 }] },
      { ...full(), cancels: [{ ...full().cancels[0], cancelAmount: '10000' }] },
      { ...full(), cancels: [{ ...full().cancels[0], refundableAmount: 100 }] },
      { ...full(), cancels: [full().cancels[0], full().cancels[0]] },
    ]
    for (const receipt of receipts) {
      assert.ok((await f.reconcile(receipt)).error, JSON.stringify(receipt))
      assert.deepEqual(await f.ledger(), initial)
    }
    for (const field of ['p_deposit_id','p_match_id','p_group_id','p_user_id']) {
      assert.ok((await f.reconcile(full(), { [field]: randomUUID() })).error)
      assert.deepEqual(await f.ledger(), initial)
    }
    assert.equal((await f.post({ ...full(), balanceAmount: 1 })).status, 502)
    assert.deepEqual(await f.ledger(), initial)
  } finally { await f.db.close() }
})

test('request owner, match, and stored provider context mismatch roll back both ledgers', async () => {
  const f = await fixture()
  try {
    for (const [field, value] of [['user_id',randomUUID()],['match_id',randomUUID()],
      ['provider_payment_key','wrong-key'],['provider_order_id','wrong-order']]) {
      await f.db.exec('begin')
      await f.db.query(`update deposit_refund_requests set ${field}=$1`, [value])
      const before = await f.ledger()
      const result = await f.reconcile()
      assert.equal(result.error.message, 'refund_request_context_mismatch')
      // A rejected SQL statement aborts the explicit transaction. Roll it back
      // before reading; the original deposit is preserved by the transaction.
      await f.db.exec('rollback')
      assert.equal((await f.ledger()).deposit.refunded_amount, 0)
      assert.equal(before.request.status, 'pending')
    }
  } finally { await f.db.close() }
})

test('a moved carryover fails closed even if webhook lookup already sees its target match', async () => {
  const f = await fixture({ request: false })
  try {
    const target = randomUUID()
    await f.db.query("insert into deposit_carryovers(id,deposit_id,user_id,source_match_id,target_match_id,status,applied_at) values($1,$2,$3,$4,$5,'applied',now())",
      [randomUUID(),f.ids.deposit,f.ids.user,f.ids.match,target])
    await f.db.query('update deposits set match_id=$1', [target])
    const before = await f.ledger()
    assert.equal((await f.post()).status, 502)
    assert.deepEqual(await f.ledger(), before)
    assert.equal((await f.reconcile()).error.message, 'deposit_context_mismatch')
  } finally { await f.db.close() }
})

test('full cancellation without a request is idempotent; unmatched partial remains retryable', async () => {
  const f = await fixture({ request: false })
  try {
    assert.equal((await f.post(partial())).status, 502)
    assert.equal((await f.ledger()).deposit.status, 'held')
    assert.equal((await f.post()).status, 200)
    const result = await f.ledger()
    assert.equal(result.deposit.refunded_amount, 10000)
    assert.equal(result.request, undefined)
    assert.equal((await f.post()).status, 200)
    assert.deepEqual(await f.ledger(), result)
  } finally { await f.db.close() }
})

test('database ACL rejects public clients even with a forged service role claim', async () => {
  const f = await fixture()
  try {
    for (const role of ['anon','authenticated']) {
      await f.db.exec(`set role ${role}`)
      assert.match((await f.reconcile()).error.message, /permission denied/)
      await f.db.exec('reset role')
    }
    await f.db.exec('set role service_role')
    assert.equal((await f.reconcile()).error, null)
    await f.db.exec('reset role')
    assert.equal((await f.ledger()).request.status, 'processed')
  } finally { await f.db.close() }
})

test('forged event body cannot override a provider re-query showing no cancellation', async () => {
  const f = await fixture()
  try {
    const initial = await f.ledger()
    assert.equal((await f.post({ ...full(), status: 'WAITING_FOR_DEPOSIT' }, {
      eventType: 'CANCELED', data: full(), status: 'CANCELED', transmissionId: 'claim-success',
    })).status, 200)
    assert.deepEqual(await f.ledger(), initial)
    assert.deepEqual(f.calls, [])
  } finally { await f.db.close() }
})

test('late deposit write failure rolls back the request and retains the original claim for retry', async () => {
  const f = await fixture()
  try {
    await f.claim()
    const before = await f.ledger()
    await f.db.exec(`create function reject_fixture_update() returns trigger language plpgsql as $$
      begin raise exception 'synthetic_write_failure'; end$$;
      create trigger fixture_write_failure before update on deposits for each row execute function reject_fixture_update();`)
    assert.equal((await f.post()).status, 502)
    assert.deepEqual(await f.ledger(), before)
    assert.equal((await f.db.query('select count(*)::int n from notifications')).rows[0].n, 0)
    await f.db.exec('drop trigger fixture_write_failure on deposits')
    assert.equal((await f.post()).status, 200)
    assert.equal((await f.ledger()).request.status, 'processed')
  } finally { await f.db.close() }
})

test('verified full cancellation resolves cancelled requests and unused carryover atomically', async () => {
  const f = await fixture()
  try {
    await f.db.query("update deposit_refund_requests set status='cancelled'")
    await f.db.query("insert into deposit_carryovers(id,deposit_id,user_id,source_match_id,status) values($1,$2,$3,$4,'available')",
      [randomUUID(),f.ids.deposit,f.ids.user,f.ids.match])
    assert.equal((await f.post()).status, 200)
    const { request, deposit } = await f.ledger()
    assert.equal(request.status, 'processed')
    assert.equal(request.provider_reconciliation_history[0].previous.status, 'cancelled')
    assert.equal(deposit.refunded_amount, 10000)
    assert.equal((await f.db.query('select status from deposit_carryovers')).rows[0].status, 'cancelled')
    assert.deepEqual(await f.claim(), [])
  } finally { await f.db.close() }
})

test('full cancellation recovers an exact pending order whose payment acknowledgement was lost', async () => {
  const f = await fixture({ request: false })
  try {
    await f.db.query("update deposits set status='pending',toss_payment_key=null")
    const before = await f.ledger()
    assert.equal((await f.post(partial())).status, 502)
    assert.deepEqual(await f.ledger(), before)
    assert.equal((await f.post()).status, 200)
    const { deposit } = await f.ledger()
    assert.equal(deposit.toss_payment_key, 'fixture-payment')
    assert.equal(deposit.status, 'refunded')
    assert.equal(deposit.refunded_amount, 10000)
    assert.equal(deposit.retained_amount, 0)
    assert.equal((await f.post()).status, 200)
  } finally { await f.db.close() }
})

test('missing keys on settled deposits and wrong order/owner cannot use pending acknowledgement recovery', async () => {
  const f = await fixture({ request: false })
  try {
    for (const status of ['paid', 'held']) {
      await f.db.query('update deposits set status=$1,toss_payment_key=null', [status])
      assert.equal((await f.reconcile()).error.message, 'provider_identity_mismatch')
      assert.equal((await f.ledger()).deposit.toss_payment_key, null)
    }
    await f.db.query("update deposits set status='pending',toss_payment_key=null")
    const before = await f.ledger()
    assert.equal((await f.reconcile({ ...full(), orderId: 'other-order' })).error.message, 'provider_identity_mismatch')
    assert.equal((await f.reconcile(full(), { p_user_id: randomUUID() })).error.message, 'deposit_context_mismatch')
    assert.ok((await f.reconcile({ ...full(), balanceAmount: 1 })).error)
    assert.deepEqual(await f.ledger(), before)
  } finally { await f.db.close() }
})
