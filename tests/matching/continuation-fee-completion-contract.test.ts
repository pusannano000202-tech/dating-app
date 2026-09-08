import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n')
}

test('continuation prepare returns a real sandbox checkout only after readiness checks', () => {
  const prepare = source('app/api/payments/continuation/prepare/route.ts')
  assert.match(prepare, /getContinuationFeeProviderAvailability/)
  assert.match(prepare, /provider !== availability\.provider/)
  assert.match(prepare, /buildContinuationFeeCheckoutDraft/)
  assert.match(prepare, /order\.status !== 'prepared'/)
  assert.match(prepare, /Date\.parse\(order\.checkoutExpiresAt\) <= Date\.now\(\)/)
  assert.match(prepare, /signContinuationFeeReturnState/)
  assert.match(prepare, /clientKey/)
  assert.doesNotMatch(prepare, /live_charge_created:\s*true/)
})

test('continuation callback confirms with Toss then verifies exact provider evidence server-side', () => {
  const confirm = source('app/api/payments/continuation/confirm/route.ts')
  assert.match(confirm, /export async function GET/)
  assert.match(confirm, /verifyContinuationFeeReturnState/)
  assert.match(confirm, /begin_continuation_fee_verification_for_service/)
  assert.match(confirm, /confirmTossPayment/)
  assert.match(confirm, /getTossPaymentByOrderId/)
  assert.match(confirm, /isVerifiedContinuationTossPayment/)
  assert.match(confirm, /confirm_my_continuation_fee_for_service/)
  assert.match(confirm, /queue_continuation_fee_recovery_for_service/)
  const decisionIndex = confirm.indexOf('const startDecision = decideContinuationFeeVerificationStart')
  const providerCallIndex = confirm.indexOf('payment = await confirmOrRecoverTossPayment')
  assert.ok(decisionIndex > -1)
  assert.ok(providerCallIndex > decisionIndex)
  assert.match(confirm, /startDecision === 'paid'[\s\S]*paymentRedirect\(returnPath, 'paid'\)/)
  assert.match(confirm, /startDecision === 'recovery_required'[\s\S]*paymentRedirect\(returnPath, 'recovery_required'\)/)
  assert.match(confirm, /startDecision !== 'verify_provider'[\s\S]*invalid_payment_state/)
})

test('cancel endpoint handles both owner cancellation and the signed Toss failure return', () => {
  const cancel = source('app/api/payments/continuation/cancel/route.ts')
  assert.match(cancel, /export async function POST/)
  assert.match(cancel, /export async function GET/)
  assert.match(cancel, /cancel_my_continuation_fee/)
  assert.match(cancel, /verifyContinuationFeeReturnState/)
})

test('recovery worker is secret protected and performs lease lookup cancel verify and retry', () => {
  const worker = source('app/api/internal/payments/continuation/reconcile/route.ts')
  assert.match(worker, /isAuthorizedInternalRequest/)
  assert.match(worker, /service_expire_continuation_fee_orders/)
  assert.match(worker, /service_claim_continuation_fee_recoveries/)
  assert.match(worker, /getTossPaymentByOrderId/)
  assert.match(worker, /cancelTossPayment/)
  assert.match(worker, /verifyTossRefundEvidence/)
  assert.match(worker, /service_release_continuation_fee_recovery/)
  assert.match(worker, /service_finalize_continuation_fee_recovery/)
})

test('checkout UI never renders local and sandbox payment buttons together', () => {
  const component = source('components/matching/ContinuationFeeCheckout.tsx')
  assert.match(component, /chooseContinuationFeeProvider/)
  assert.match(component, /requestTossPaymentWindow/)
  assert.match(component, /로컬 검증 시뮬레이터/)
  assert.match(component, /실제 청구 없음/)
  assert.doesNotMatch(component, /샌드박스 주문 준비/)
})
