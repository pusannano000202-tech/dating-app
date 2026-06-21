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
  assert.match(webhookRoute, /getTossPayment/)
  assert.match(webhookRoute, /getTossPaymentByOrderId/)
  assert.match(webhookRoute, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(webhookRoute, /mapTossPaymentStatusToDepositStatus/)
  assert.match(webhookRoute, /toss_order_id/)
  assert.match(tossHelper, /https:\/\/api\.tosspayments\.com\/v1/)
  assert.match(tossHelper, /\/payments\/\$\{encodeURIComponent\(paymentKey\)\}/)
  assert.match(tossHelper, /\/payments\/orders\/\$\{encodeURIComponent\(orderId\)\}/)
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

test('local env example documents mock and Toss sandbox payment settings without secrets', () => {
  const envExample = readSource('.env.local.example')

  assert.match(envExample, /NEXT_PUBLIC_PAYMENT_PROVIDER=mock/)
  assert.match(envExample, /PAYMENT_PROVIDER=mock/)
  assert.match(envExample, /NEXT_PUBLIC_TOSS_CLIENT_KEY=/)
  assert.match(envExample, /TOSS_SECRET_KEY=/)
  assert.match(envExample, /PAYMENT_INTERNAL_SECRET=/)
  assert.match(envExample, /SUPABASE_SERVICE_ROLE_KEY=/)
  assert.match(envExample, /NEXT_PUBLIC_TOSS_CLIENT_KEY is safe for the browser/)
  assert.match(envExample, /TOSS_SECRET_KEY is server-only/)
  assert.match(envExample, /Never expose these with NEXT_PUBLIC_/)
  assert.doesNotMatch(envExample, /TOSS_SECRET_KEY=gsk_/)
  assert.doesNotMatch(envExample, /SUPABASE_SERVICE_ROLE_KEY=eyJ/)
})

test('payment env checker supports mock review and Toss sandbox preflight without printing secrets', () => {
  const packageJson = readSource('package.json')
  const checker = readSource('scripts/check-payment-env.mjs')

  assert.match(packageJson, /"check:payment-env": "node scripts\/check-payment-env\.mjs"/)
  assert.match(checker, /--provider=/)
  assert.match(checker, /NEXT_PUBLIC_PAYMENT_PROVIDER/)
  assert.match(checker, /PAYMENT_PROVIDER/)
  assert.match(checker, /NEXT_PUBLIC_TOSS_CLIENT_KEY/)
  assert.match(checker, /TOSS_SECRET_KEY/)
  assert.match(checker, /PAYMENT_INTERNAL_SECRET/)
  assert.match(checker, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(checker, /console\.table\(rows\)/)
  assert.doesNotMatch(checker, /console\.log\(env/)
  assert.doesNotMatch(checker, /console\.log\(fileEnv/)
  assert.doesNotMatch(checker, /console\.table\(env/)
})

test('deposit payment request draft sends failed checkout back through cancel route', () => {
  const paymentLib = readSource('lib/payments/deposit.ts')

  assert.match(paymentLib, /failUrl/)
  assert.match(paymentLib, /\/api\/payments\/deposit\/cancel/)
})

test('match refund route reports external Toss settlement separately from DB refund request', () => {
  const refundRoute = readSource('app/api/matches/[id]/refund/route.ts')

  assert.match(refundRoute, /submit_refund_request/)
  assert.match(refundRoute, /external_refund/)
  assert.match(refundRoute, /cancelTossPayment/)
  assert.match(refundRoute, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(refundRoute, /pending_provider_configuration/)
  assert.match(refundRoute, /server_settlement_not_configured/)
  assert.match(refundRoute, /refund_amount_zero/)
  assert.doesNotMatch(refundRoute, /missing:/)
})

test('Toss general payment webhook re-queries payment state instead of trusting signatures or body status', () => {
  const webhookRoute = readSource('app/api/payments/deposit/webhook/route.ts')
  const tossHelper = readSource('lib/payments/toss.ts')

  assert.match(webhookRoute, /no signature header/)
  assert.match(webhookRoute, /verifyPaymentFromWebhook/)
  assert.match(webhookRoute, /getTossPayment\(event\.paymentKey\)/)
  assert.match(webhookRoute, /getTossPaymentByOrderId\(event\.orderId\)/)
  assert.match(webhookRoute, /payment\.totalAmount !== DEPOSIT_AMOUNT/)
  assert.match(webhookRoute, /status === 'DONE'/)
  assert.match(webhookRoute, /status === 'CANCELED'/)
  assert.match(webhookRoute, /status === 'PARTIAL_CANCELED'/)
  assert.match(webhookRoute, /ignored_already_refunded/)
  assert.match(webhookRoute, /deposit\.notes/)
  assert.doesNotMatch(webhookRoute, /tosspayments-webhook-signature/)
  assert.match(tossHelper, /method: 'GET'/)
  assert.match(tossHelper, /if \(options\.method === 'POST'\)/)
})
