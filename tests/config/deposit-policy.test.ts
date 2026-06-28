import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DEPOSIT_AMOUNT, FREE_BETA_ENABLED } from '../../lib/constants'
import { OPERATIONS_CONFIG } from '../../lib/matching/config'
import { getDepositPaymentReadiness } from '../../lib/payments/deposit'
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

test('refund page starts from full refund and separates voluntary contribution copy', () => {
  const refundPage = readSource('app/match/[id]/refund/page.tsx')

  assert.match(refundPage, /useState<number>\(0\)/)
  assert.match(refundPage, /보증금 정산/)
  assert.match(refundPage, /앱 기여금/)
  assert.match(refundPage, /환불 예정 금액/)
  assert.match(refundPage, /전액 환불/)
  assert.match(refundPage, /3,000/)
  assert.match(refundPage, /2,000/)
  assert.match(refundPage, /1,000/)
  assert.doesNotMatch(refundPage, /매칭비 정산/)
  assert.doesNotMatch(refundPage, /앱에게 줄 매칭비/)
})

test('refund page keeps contribution and refund amounts readable on the light settlement card', () => {
  const refundPage = readSource('app/match/[id]/refund/page.tsx')

  assert.doesNotMatch(refundPage, /text-white">\{appFee\.toLocaleString\(\)\}/)
  assert.doesNotMatch(refundPage, /text-white">\{refundAmount\.toLocaleString\(\)\}/)
  assert.match(refundPage, /data-testid="refund-app-fee-current"/)
  assert.match(refundPage, /data-testid="refund-amount-preview"/)
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

test('Toss runtime readiness rejects configured keys that include copied prose', () => {
  const previousEnv = {
    NEXT_PUBLIC_TOSS_CLIENT_KEY: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
    TOSS_SECRET_KEY: process.env.TOSS_SECRET_KEY,
    PAYMENT_INTERNAL_SECRET: process.env.PAYMENT_INTERNAL_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  try {
    process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY = 'test_ck_fake_client_key'
    process.env.TOSS_SECRET_KEY = 'test_sk_fake_secret_key 이거니까'
    process.env.PAYMENT_INTERNAL_SECRET = 'local-internal-secret'
    process.env.SUPABASE_SERVICE_ROLE_KEY = makeFakeJwt({ role: 'service_role' })

    const readiness = getDepositPaymentReadiness('toss')

    assert.equal(readiness.ok, false)
    if (!readiness.ok) {
      assert.equal(readiness.error, 'payment_provider_not_configured')
      assert.deepEqual(readiness.invalid, ['TOSS_SECRET_KEY'])
    }
  } finally {
    restoreEnv(previousEnv)
  }
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

function makeFakeJwt(payload: Record<string, unknown>) {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.')
}

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (typeof value === 'undefined') {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}
