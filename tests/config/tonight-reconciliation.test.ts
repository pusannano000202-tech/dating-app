import assert from 'node:assert/strict'
import test from 'node:test'

import { hashTonightPaymentKey } from '../../lib/payments/tonight-deposit-server'
import { reconcileTonightPreparedOrder } from '../../lib/payments/tonight-reconciliation'
import { TossPaymentError } from '../../lib/payments/toss'

const claim = {
  providerOrderId: 'tn_owned_order_1234',
  amount: 10_000,
}

test('prepared-order reconciliation returns only a hash for an exact DONE payment', async () => {
  const result = await reconcileTonightPreparedOrder(claim, {
    async getPaymentByOrderId() {
      return {
        paymentKey: 'pay_secret_12345678',
        orderId: claim.providerOrderId,
        totalAmount: claim.amount,
        balanceAmount: claim.amount,
        status: 'DONE',
      }
    },
  })
  assert.deepEqual(result, {
    kind: 'verified_paid',
    paymentKeyHash: hashTonightPaymentKey('pay_secret_12345678'),
  })
  assert.equal(JSON.stringify(result).includes('pay_secret_12345678'), false)
})

test('prepared-order reconciliation separates no-charge, mismatch, and retryable provider states', async () => {
  assert.deepEqual(await reconcileTonightPreparedOrder(claim, {
    async getPaymentByOrderId() {
      return {
        paymentKey: 'pay_cancelled_12345678',
        orderId: claim.providerOrderId,
        totalAmount: claim.amount,
        balanceAmount: 0,
        status: 'CANCELED',
      }
    },
  }), { kind: 'no_charge' })

  assert.deepEqual(await reconcileTonightPreparedOrder(claim, {
    async getPaymentByOrderId() {
      return {
        paymentKey: 'pay_foreign_12345678',
        orderId: 'foreign_order',
        totalAmount: claim.amount,
        status: 'DONE',
      }
    },
  }), { kind: 'manual_review', errorCode: 'provider_evidence_mismatch' })

  assert.deepEqual(await reconcileTonightPreparedOrder(claim, {
    async getPaymentByOrderId() {
      throw new TossPaymentError('exact order absent', 404, 'NOT_FOUND_PAYMENT')
    },
  }), { kind: 'not_found' })

  assert.deepEqual(await reconcileTonightPreparedOrder(claim, {
    async getPaymentByOrderId() {
      throw new TossPaymentError('provider down', 502, 'provider_down')
    },
  }), { kind: 'retry', errorCode: 'provider_unavailable' })

  for (const status of [408, 429, 500, 503]) {
    assert.deepEqual(await reconcileTonightPreparedOrder(claim, {
      async getPaymentByOrderId() {
        throw new TossPaymentError('temporary provider pressure', status, 'temporary')
      },
    }), { kind: 'retry', errorCode: 'provider_unavailable' })
  }
})
