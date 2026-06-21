import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('deposit payment API has explicit start, confirm, cancel, and webhook surfaces', () => {
  const routes = [
    'app/api/payments/deposit/route.ts',
    'app/api/payments/deposit/confirm/route.ts',
    'app/api/payments/deposit/cancel/route.ts',
    'app/api/payments/deposit/webhook/route.ts',
    'lib/payments/toss.ts',
  ]

  for (const route of routes) {
    assert.equal(existsSync(join(ROOT, route)), true, `${route} is missing`)
  }
})

test('deposit payment routes use provider readiness and delegate Toss calls to the server helper', () => {
  const startRoute = readSource('app/api/payments/deposit/route.ts')
  const confirmRoute = readSource('app/api/payments/deposit/confirm/route.ts')
  const cancelRoute = readSource('app/api/payments/deposit/cancel/route.ts')
  const webhookRoute = readSource('app/api/payments/deposit/webhook/route.ts')
  const tossHelper = readSource('lib/payments/toss.ts')

  for (const source of [startRoute, confirmRoute, cancelRoute, webhookRoute]) {
    assert.match(source, /getDepositPaymentReadiness/)
    assert.doesNotMatch(source, /fetch\(['"]https:\/\//)
  }

  assert.match(startRoute, /mock_pay_deposit/)
  assert.match(startRoute, /createTossPaymentWindow/)
  assert.match(confirmRoute, /isDepositPaymentAmountValid/)
  assert.match(confirmRoute, /confirmTossPayment/)
  assert.doesNotMatch(confirmRoute, /awaiting_provider_webhook/)
  assert.match(cancelRoute, /payment_cancelled/)
  assert.match(cancelRoute, /PAYMENT_INTERNAL_SECRET/)
  assert.match(cancelRoute, /cancelTossPayment/)
  assert.match(webhookRoute, /payment_provider_not_configured/)
  assert.match(tossHelper, /https:\/\/api\.tosspayments\.com\/v1/)
  assert.match(tossHelper, /\/payments\/confirm/)
  assert.match(tossHelper, /encodeURIComponent\(params\.paymentKey\).*\/cancel/)
  assert.match(tossHelper, /Authorization/)
  assert.match(tossHelper, /Idempotency-Key/)
})

test('deposit payment routes do not expose missing provider environment variable names', () => {
  const routes = [
    'app/api/deposits/route.ts',
    'app/api/payments/deposit/route.ts',
    'app/api/payments/deposit/confirm/route.ts',
    'app/api/payments/deposit/cancel/route.ts',
    'app/api/payments/deposit/webhook/route.ts',
  ]

  for (const route of routes) {
    assert.doesNotMatch(readSource(route), /missing:/, `${route} exposes missing env names`)
  }
})

test('deposit payment request draft sends failed checkout back through cancel route', () => {
  const paymentLib = readSource('lib/payments/deposit.ts')

  assert.match(paymentLib, /failUrl/)
  assert.match(paymentLib, /\/api\/payments\/deposit\/cancel/)
})
