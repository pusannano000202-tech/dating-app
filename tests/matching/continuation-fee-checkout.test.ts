import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildContinuationFeeCheckoutDraft,
  chooseContinuationFeeProvider,
  isVerifiedContinuationTossPayment,
} from '../../lib/payments/continuation-fee'
import {
  signContinuationFeeReturnState,
  verifyContinuationFeeReturnState,
} from '../../lib/payments/continuation-fee-return-state'
import * as continuationFeeApi from '../../lib/payments/continuation-fee-api'

const context = {
  orderId: '10000000-0000-4000-8000-000000000001',
  providerOrderId: 'ct_10000000000040008000000000000001',
  ownerUserId: '20000000-0000-4000-8000-000000000001',
  transitionId: '30000000-0000-4000-8000-000000000001',
  purpose: 'next_occurrence' as const,
  returnPath: '/match/series/40000000-0000-4000-8000-000000000001',
}

test('provider selection exposes one safe path and always prefers configured Toss sandbox', () => {
  assert.deepEqual(chooseContinuationFeeProvider({ tossSandbox: true, localSimulator: true }), {
    available: true,
    provider: 'toss_sandbox',
    localOnly: false,
  })
  assert.deepEqual(chooseContinuationFeeProvider({ tossSandbox: false, localSimulator: true }), {
    available: true,
    provider: 'local_verified_simulator',
    localOnly: true,
  })
  assert.deepEqual(chooseContinuationFeeProvider({ tossSandbox: false, localSimulator: false }), {
    available: false,
    provider: null,
    localOnly: false,
  })
})

test('continuation checkout binds the database order and a signed safe return path', () => {
  const state = signContinuationFeeReturnState(context, 's'.repeat(32))
  const draft = buildContinuationFeeCheckoutDraft({
    ...context,
    origin: 'https://quantum.example/',
    state,
  })
  assert.equal(draft.amount, 1000)
  assert.equal(draft.orderId, context.providerOrderId)
  assert.equal(draft.orderName, '퀀텀 계속 만나기 참가비 1,000원')
  assert.match(draft.successUrl, /^https:\/\/quantum\.example\/api\/payments\/continuation\/confirm\?/)
  assert.match(draft.failUrl, /^https:\/\/quantum\.example\/api\/payments\/continuation\/cancel\?/)
  assert.equal(verifyContinuationFeeReturnState(state, context, 's'.repeat(32)), true)
  assert.equal(verifyContinuationFeeReturnState(state, { ...context, purpose: 'friend_request' }, 's'.repeat(32)), false)
})

test('continuation return paths cannot escape the matching journey', () => {
  assert.throws(() => buildContinuationFeeCheckoutDraft({
    ...context,
    origin: 'https://quantum.example',
    returnPath: '//evil.example',
    state: 'signed-state',
  }), /invalid_continuation_return_path/)
})

test('Toss approval is accepted only with exact DONE evidence', () => {
  const payment = {
    paymentKey: 'payment_key_12345678',
    orderId: context.providerOrderId,
    status: 'DONE',
    totalAmount: 1000,
  }
  assert.equal(isVerifiedContinuationTossPayment(payment, {
    paymentKey: payment.paymentKey,
    providerOrderId: context.providerOrderId,
  }), true)
  assert.equal(isVerifiedContinuationTossPayment({ ...payment, status: 'READY' }, {
    paymentKey: payment.paymentKey,
    providerOrderId: context.providerOrderId,
  }), false)
  assert.equal(isVerifiedContinuationTossPayment({ ...payment, totalAmount: 2000 }, {
    paymentKey: payment.paymentKey,
    providerOrderId: context.providerOrderId,
  }), false)
})

test('verification start decision blocks every non-verifying provider path', () => {
  type Decision = 'verify_provider' | 'paid' | 'recovery_required' | 'invalid'
  const decide = (continuationFeeApi as unknown as {
    decideContinuationFeeVerificationStart?: (value: unknown) => Decision
  }).decideContinuationFeeVerificationStart
  assert.equal(typeof decide, 'function')
  if (!decide) return
  const cases: Array<{ label: string; value: unknown; expected: Decision }> = [
    { label: 'expired', value: { status: 'recovery_required', provider_verified: false, revision: 1 }, expected: 'recovery_required' },
    { label: 'cancelled', value: { status: 'cancelled', provider_verified: false, revision: 1 }, expected: 'recovery_required' },
    { label: 'unknown', value: { status: 'mystery', provider_verified: false, revision: 1 }, expected: 'invalid' },
    { label: 'malformed', value: null, expected: 'invalid' },
    { label: 'verified', value: { status: 'verified', provider_verified: true, revision: 1 }, expected: 'paid' },
    { label: 'unproven verified', value: { status: 'verified', provider_verified: false, revision: 1 }, expected: 'invalid' },
    { label: 'verifying', value: { status: 'verifying', provider_verified: false, revision: 1 }, expected: 'verify_provider' },
    { label: 'prepared', value: { status: 'prepared', provider_verified: false, revision: 1 }, expected: 'invalid' },
  ]
  for (const item of cases) {
    assert.equal(decide(item.value), item.expected, item.label)
  }
})
