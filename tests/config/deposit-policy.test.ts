import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DEPOSIT_AMOUNT, FREE_BETA_ENABLED } from '../../lib/constants'
import { OPERATIONS_CONFIG } from '../../lib/matching/config'
import { appFeeToRefundAmount, normalizeAppFeeAmount } from '../../lib/refund/fee-flow'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('deposit policy charges a 10000 won refundable deposit instead of free beta', () => {
  assert.equal(FREE_BETA_ENABLED, false)
  assert.equal(DEPOSIT_AMOUNT, 10000)
  assert.equal(OPERATIONS_CONFIG.DEPOSIT_AMOUNT_KRW, 10000)

  assert.equal(normalizeAppFeeAmount(15000, DEPOSIT_AMOUNT), 10000)
  assert.equal(appFeeToRefundAmount(3000, DEPOSIT_AMOUNT), 7000)
})

test('refund page is not blocked by the old free beta gate', () => {
  const refundPage = readSource('app/match/[id]/refund/page.tsx')

  assert.doesNotMatch(refundPage, /FREE_BETA_ENABLED/)
  assert.doesNotMatch(refundPage, /무료 베타 진행 중/)
  assert.doesNotMatch(refundPage, /환불 기능을 꺼둔 상태/)
  assert.match(refundPage, /DEPOSIT_AMOUNT/)
  assert.match(refundPage, /보증금/)
})

test('deposit API exposes an explicit mock provider while real payment providers stay opt-in', () => {
  const depositRoute = readSource('app/api/deposits/route.ts')
  const paymentLib = readSource('lib/payments/deposit.ts')

  assert.match(depositRoute, /resolveDepositPaymentProvider/)
  assert.match(depositRoute, /mock_pay_deposit/)
  assert.match(paymentLib, /DepositPaymentProvider/)
  assert.match(paymentLib, /\['mock', 'toss'\]/)
  assert.match(paymentLib, /NEXT_PUBLIC_PAYMENT_PROVIDER/)
  assert.doesNotMatch(paymentLib, /kakao|KAKAOPAY|KAKAOPAY_CID/i)
  assert.match(paymentLib, /payment_provider_not_configured/)
  assert.doesNotMatch(paymentLib, /production/i)
})

test('mock deposit RPC enforces the configured 10000 won amount at the database boundary', () => {
  const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readSource(`supabase/migrations/${file}`))
    .join('\n')

  assert.match(migrations, /invalid_deposit_amount/)
  assert.match(migrations, /p_amount\s*<>\s*10000/)
  assert.match(migrations, /Temporary mock deposit payment.*10,000원/)
})
