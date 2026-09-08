import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  signTonightPaymentReturnState,
  verifyTonightPaymentReturnState,
} from '../../lib/payments/tonight-payment-return-state'

const secret = 'test-payment-internal-secret-that-is-long-enough'
const context = {
  applicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  orderId: 'tn_aaaaaaaaaaaa_bbbbbbbbbbbb_cccccccccccc',
}

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

test('Tonight payment return state is caller/order bound, expiring, and tamper evident', () => {
  const now = new Date('2026-09-03T09:35:00.000Z')
  const state = signTonightPaymentReturnState(context, secret, now)
  assert.equal(verifyTonightPaymentReturnState(state, context, secret, now), true)
  assert.equal(verifyTonightPaymentReturnState(`${state}x`, context, secret, now), false)
  assert.equal(verifyTonightPaymentReturnState(state, { ...context, orderId: `${context.orderId}x` }, secret, now), false)
  assert.equal(verifyTonightPaymentReturnState(
    state,
    context,
    secret,
    new Date(now.getTime() + 61 * 60 * 1000),
  ), false)
})

test('Tonight checkout callbacks require the signed state on both success and cancellation', () => {
  const start = read('app/api/payments/tonight-deposit/route.ts')
  const confirm = read('app/api/payments/tonight-deposit/confirm/route.ts')
  const cancel = read('app/api/payments/tonight-deposit/cancel/route.ts')
  const draft = read('lib/payments/tonight-deposit.ts')

  assert.match(start, /signTonightPaymentReturnState/)
  assert.match(start, /PAYMENT_INTERNAL_SECRET/)
  assert.match(draft, /common\.set\('state', params\.paymentState\)/)
  for (const callback of [confirm, cancel]) {
    assert.match(callback, /'state'/)
    assert.match(callback, /verifyTonightPaymentReturnState/)
    assert.match(callback, /PAYMENT_INTERNAL_SECRET/)
    assert.match(callback, /invalid_payment_return_state/)
  }
})
