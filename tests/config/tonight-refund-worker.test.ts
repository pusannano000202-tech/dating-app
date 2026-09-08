import assert from 'node:assert/strict'
import test from 'node:test'

import { settleTonightRefundWithProvider } from '../../lib/payments/tonight-refund'
import { buildTonightDepositOrderId, hashTonightPaymentKey } from '../../lib/payments/tonight-deposit-server'

const applicationId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const requestId = '33333333-3333-4333-8333-333333333333'
const paymentKey = 'provider_payment_key_secret'
const orderId = buildTonightDepositOrderId({
  applicationId,
  userId,
  idempotencyKey: 'checkout_abcdefgh',
})

function claim() {
  return {
    refundRequestId: requestId,
    depositId: '44444444-4444-4444-8444-444444444444',
    applicationId,
    userId,
    requestRevision: 2,
    amount: 10_000,
    providerOrderId: orderId,
    providerPaymentKeyHash: hashTonightPaymentKey(paymentKey),
  }
}

test('Tonight refund resolves the raw Toss key by owned order, cancels idempotently, and returns hash-only evidence', async () => {
  let cancelInput: Record<string, unknown> | null = null
  const result = await settleTonightRefundWithProvider(claim(), {
    async getPaymentByOrderId() {
      return { paymentKey, orderId, status: 'DONE', totalAmount: 10_000, balanceAmount: 10_000, cancels: [] }
    },
    async cancelPayment(input) {
      cancelInput = input
      return {
        paymentKey,
        orderId,
        status: 'CANCELED',
        totalAmount: 10_000,
        balanceAmount: 0,
        lastTransactionKey: 'tx_refund_1',
        cancels: [{
          cancelAmount: 10_000,
          cancelStatus: 'DONE',
          transactionKey: 'tx_refund_1',
          refundableAmount: 0,
        }],
      }
    },
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.evidence.providerPaymentKeyHash, hashTonightPaymentKey(paymentKey))
  assert.equal('paymentKey' in result.evidence, false)
  assert.deepEqual(cancelInput, {
    paymentKey,
    cancelReason: '오늘밤 보증금 환불',
    cancelAmount: 10_000,
    idempotencyKey: `tonight-refund-${requestId}-v2`,
  })
})

test('Tonight refund refuses amount, order ownership, and payment-key hash mismatches before cancellation', async () => {
  let cancels = 0
  const transport = {
    async getPaymentByOrderId() {
      return { paymentKey, orderId, status: 'DONE', totalAmount: 10_000, balanceAmount: 10_000, cancels: [] }
    },
    async cancelPayment() {
      cancels += 1
      throw new Error('must not call')
    },
  }

  assert.deepEqual(await settleTonightRefundWithProvider({ ...claim(), amount: 9_999 }, transport), {
    ok: false,
    error: 'invalid_refund_claim',
    retryable: false,
  })
  assert.deepEqual(await settleTonightRefundWithProvider({ ...claim(), providerOrderId: 'tn_wrong' }, transport), {
    ok: false,
    error: 'invalid_refund_claim',
    retryable: false,
  })
  assert.deepEqual(await settleTonightRefundWithProvider({ ...claim(), providerPaymentKeyHash: '0'.repeat(64) }, transport), {
    ok: false,
    error: 'provider_evidence_mismatch',
    retryable: false,
  })
  assert.equal(cancels, 0)
})

test('Tonight refund recovers an already completed cancellation without issuing a second cancel', async () => {
  let cancels = 0
  const result = await settleTonightRefundWithProvider(claim(), {
    async getPaymentByOrderId() {
      return {
        paymentKey,
        orderId,
        status: 'CANCELED',
        totalAmount: 10_000,
        balanceAmount: 0,
        lastTransactionKey: 'tx_existing',
        cancels: [{
          cancelAmount: 10_000,
          cancelStatus: 'DONE',
          transactionKey: 'tx_existing',
          refundableAmount: 0,
        }],
      }
    },
    async cancelPayment() {
      cancels += 1
      throw new Error('must not call')
    },
  })
  assert.equal(result.ok, true)
  assert.equal(cancels, 0)
})

test('Tonight refund marks transient provider failures retryable without leaking provider text', async () => {
  const result = await settleTonightRefundWithProvider(claim(), {
    async getPaymentByOrderId() {
      const error = Object.assign(new Error('secret provider details'), { status: 503 })
      throw error
    },
    async cancelPayment() {
      throw new Error('must not call')
    },
  })
  assert.deepEqual(result, { ok: false, error: 'provider_unavailable', retryable: true })
})

test('Tonight refund treats a not-yet-queryable owned order as retryable during reconciliation', async () => {
  const result = await settleTonightRefundWithProvider(claim(), {
    async getPaymentByOrderId() {
      const error = Object.assign(new Error('provider order not visible yet'), { status: 404 })
      throw error
    },
    async cancelPayment() {
      throw new Error('must not call')
    },
  })
  assert.deepEqual(result, { ok: false, error: 'provider_unavailable', retryable: true })
})

test('Tonight refund classifies a permanent provider rejection for immediate dead-lettering', async () => {
  const result = await settleTonightRefundWithProvider(claim(), {
    async getPaymentByOrderId() {
      const error = Object.assign(new Error('foreign order or permanent rejection'), { status: 400 })
      throw error
    },
    async cancelPayment() {
      throw new Error('must not call')
    },
  })
  assert.deepEqual(result, {
    ok: false,
    error: 'provider_request_rejected',
    retryable: false,
  })
})
