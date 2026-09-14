import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { refundFixture } from './admission-refund-fixture.mjs'
const worker = {}
new Function('exports', ts.transpileModule(await readFile(new URL('../../lib/meetups/admission-refund.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(worker)

test('actual checkout/admission/request/approval SQL connects to PG-proof worker and both completion views', async () => {
  const f = await refundFixture()
  try {
    const paid = await f.paid(), calls = []
    assert.deepEqual(await f.claim(), [])
    const requested = await f.request(paid.depositId)
    assert.deepEqual(await f.claim(), [])
    await f.review(paid.depositId, requested.requestId)
    const [claim] = await f.claim()
    assert.ok(worker.parseAdmissionRefundClaim(claim))
    const payment = { paymentKey: claim.paymentKey, orderId: claim.orderId, currency: 'KRW', totalAmount: 10000, balanceAmount: 10000, status: 'DONE', approvedAt: '2026-09-14T00:00:00Z', cancels: [] }
    const transport = { mode: 'test', lookup: async id => { calls.push(['lookup', id]); return payment }, cancel: async input => {
      calls.push(['cancel', input]); return { ...payment, status: 'CANCELED', balanceAmount: 0, lastTransactionKey: 'integration-transaction', cancels: [{ transactionKey: 'integration-transaction', cancelStatus: 'DONE', canceledAt: '2026-09-14T01:00:00Z', cancelAmount: 10000 }] }
    } }
    const service = { rpc: async (name, args) => {
      try { return { data: await f.service(name, Object.values(args)), error: null } }
      catch (error) { return { data: null, error: { message: error.message } } }
    } }
    assert.equal(await worker.processAdmissionRefundClaim(service, claim, claim.leaseId, transport), 'completed')
    assert.deepEqual(calls.map(c => c[0]), ['lookup', 'cancel'])
    const owner = (await f.owner('list_my_meetup_admission_refunds'))[0]
    const admin = (await f.service('list_meetup_admission_refunds_for_service', [f.users.computerCaptain]))[0]
    assert.equal(owner.refundState, 'completed'); assert.equal(owner.payment, 'refunded')
    assert.deepEqual(worker.parseAdmissionRefundSummary(owner), worker.parseAdmissionRefundSummary(admin))
    assert.ok(!JSON.stringify(owner).includes(claim.paymentKey))
    assert.deepEqual(await f.claim(), [])
    assert.equal((await f.db.query("select count(*)::int as n from quantum_private.meetup_admission_refund_audit where event='completed'")).rows[0].n, 1)
  } finally { await f.db.close() }
})
