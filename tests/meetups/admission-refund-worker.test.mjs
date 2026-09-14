import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const exports = {}
new Function('exports', ts.transpileModule(await readFile(new URL('../../lib/meetups/admission-refund.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports)
const id = n => `${n}`.repeat(8) + '-' + `${n}`.repeat(4) + '-4' + `${n}`.repeat(3) + '-8' + `${n}`.repeat(3) + '-' + `${n}`.repeat(12)
const claim = { depositId: id(1), requestId: id(2), intentId: id(3), ownerId: id(4), leaseId: id(5), orderId: 'meetup_' + id(3).replace(/-/g, ''), room: { kind: 'study', id: id(6) }, paymentKey: 'private-fixture-payment', providerMode: 'test', amountKrw: 10000 }
const paid = { paymentKey: claim.paymentKey, orderId: claim.orderId, currency: 'KRW', totalAmount: 10000, balanceAmount: 10000, status: 'DONE', approvedAt: '2026-09-14T00:00:00Z', cancels: [] }
const canceled = { ...paid, balanceAmount: 0, status: 'CANCELED', lastTransactionKey: 'fixture-tx', cancels: [{ transactionKey: 'fixture-tx', cancelStatus: 'DONE', cancelAmount: 10000, canceledAt: '2026-09-14T01:00:00Z' }] }
function provider(payment = paid, result = canceled) {
  const calls = []
  return { calls, mode: 'test', lookup: async order => { calls.push(['lookup', order]); return payment }, cancel: async input => { calls.push(['cancel', input]); return result } }
}
test('owner-approved claim rechecks original payment before stable-key cancellation', async () => {
  const transport = provider(), result = await exports.settleAdmissionRefundWithProvider(claim, transport)
  assert.equal(result.transactionKey, 'fixture-tx'); assert.equal(result.amountKrw, 10000)
  assert.deepEqual(transport.calls.map(c => c[0]), ['lookup', 'cancel'])
  assert.deepEqual(transport.calls[1][1], { paymentKey: claim.paymentKey, cancelAmount: 10000, cancelReason: 'Quantum 모임 보증금 본인 반환 신청', idempotencyKey: `meetup-refund-${claim.requestId}` })
})
test('lost finalizer response recovers full provider proof without a second cancellation', async () => {
  const transport = provider(canceled)
  await exports.settleAdmissionRefundWithProvider(claim, transport)
  assert.deepEqual(transport.calls.map(c => c[0]), ['lookup'])
})
test('wrong identity/amount/mode, partial refunds and malformed proof fail closed', async () => {
  for (const patch of [{ paymentKey: 'other' }, { orderId: 'other' }, { totalAmount: 1 }, { currency: 'USD' }, { status: 'PARTIAL_CANCELED', balanceAmount: 5000 }]) {
    const transport = provider({ ...paid, ...patch })
    await assert.rejects(() => exports.settleAdmissionRefundWithProvider(claim, transport))
    assert.equal(transport.calls.length, 1)
  }
  for (const patch of [{ amountKrw: 1 }, { providerMode: 'live' }, { intentId: id(7) }, { paymentKey: 'unsafe\nkey' }, { leaseId: 'bad' }]) {
    const transport = provider()
    await assert.rejects(() => exports.settleAdmissionRefundWithProvider({ ...claim, ...patch }, transport))
    assert.equal(transport.calls.length, 0)
  }
  for (const patch of [{ balanceAmount: 1 }, { cancels: [] }, { lastTransactionKey: 'missing' }, { cancels: [{ ...canceled.cancels[0], cancelAmount: 9999 }] }, { cancels: [{ ...canceled.cancels[0], cancelStatus: 'PENDING' }] }]) {
    await assert.rejects(() => exports.settleAdmissionRefundWithProvider(claim, provider({ ...canceled, ...patch })))
  }
})
test('cumulative real full cancellation accepts unique successful transactions only', async () => {
  const payment = { ...canceled, cancels: [{ ...canceled.cancels[0], transactionKey: 'first', cancelAmount: 4000 }, { ...canceled.cancels[0], cancelAmount: 6000 }] }
  assert.equal((await exports.settleAdmissionRefundWithProvider(claim, provider(payment))).amountKrw, 10000)
  await assert.rejects(() => exports.settleAdmissionRefundWithProvider(claim, provider({ ...payment, cancels: [payment.cancels[1], payment.cancels[1]] })))
})
const completed = { depositId: claim.depositId, requestId: claim.requestId, room: claim.room, roomTitle: '스터디', amountKrw: 10000, payment: 'refunded', refundState: 'completed', requestedAt: '2026-09-14T00:00:00Z', approvedAt: '2026-09-14T00:00:00Z', completedAt: '2026-09-14T01:00:00Z', lastError: null }
test('lost database acknowledgement then retry never charges/cancels twice', async () => {
  let providerState = paid, cancellations = 0, finalizations = 0
  const transport = { mode: 'test', lookup: async () => providerState, cancel: async () => { cancellations++; providerState = canceled; return canceled } }
  const service = { rpc: async name => {
    if (name.startsWith('finalize_')) { finalizations++; return finalizations === 1 ? { error: { message: 'connection_lost' }, data: null } : { error: null, data: completed } }
    return { error: null, data: { ...completed, payment: 'refund_due', refundState: 'failed', completedAt: null, lastError: 'provider_unavailable' } }
  } }
  assert.equal(await exports.processAdmissionRefundClaim(service, claim, claim.leaseId, transport), 'deferred')
  assert.equal(await exports.processAdmissionRefundClaim(service, claim, claim.leaseId, transport), 'completed')
  assert.equal(cancellations, 1); assert.equal(finalizations, 2)
})
test('stale lease never reaches PG; bad proof is released for review without completion', async () => {
  const transport = provider(paid, { ...canceled, totalAmount: 1 }), calls = []
  const service = { rpc: async (name, args) => { calls.push([name, args]); return { data: null, error: null } } }
  assert.equal(await exports.processAdmissionRefundClaim(service, claim, id(8), transport), 'invalid')
  assert.equal(transport.calls.length, 0)
  assert.equal(await exports.processAdmissionRefundClaim(service, claim, claim.leaseId, transport), 'deferred')
  assert.equal(calls.length, 1); assert.match(calls[0][0], /^release_/)
  assert.equal(calls[0][1].p_retryable, false); assert.equal(calls[0][1].p_error_code, 'refund_proof_mismatch')
})
