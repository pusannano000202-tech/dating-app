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
  assert.doesNotMatch(refundPage, /매칭비/)
})

test('refund page keeps contribution and refund amounts readable on the light settlement card', () => {
  const refundPage = readSource('app/match/[id]/refund/page.tsx')

  assert.doesNotMatch(refundPage, /text-white">\{appFee\.toLocaleString\(\)\}/)
  assert.doesNotMatch(refundPage, /text-white">\{refundAmount\.toLocaleString\(\)\}/)
  assert.match(refundPage, /data-testid="refund-app-fee-current"/)
  assert.match(refundPage, /data-testid="refund-amount-preview"/)
  assert.doesNotMatch(refundPage, /text-violet-100/)
  assert.doesNotMatch(refundPage, /text-violet-300/)
  assert.doesNotMatch(refundPage, /text-white/)
  assert.doesNotMatch(refundPage, /border-white\/15/)
  assert.doesNotMatch(refundPage, /bg-black\/20/)
})

test('refund page reserves mobile-only bottom-nav clearance for the CTA', () => {
  const refundPage = readSource('app/match/[id]/refund/page.tsx')

  assert.match(
    refundPage,
    /<main className="[^"]*\bpb-28\b[^"]*\bmd:pb-10\b[^"]*"/,
  )
})

test('deposit API keeps mock local-only while real payment providers stay opt-in', () => {
  const depositRoute = readSource('app/api/deposits/route.ts')
  const paymentLib = readSource('lib/payments/deposit.ts')

  assert.match(depositRoute, /resolveDepositPaymentProvider/)
  assert.match(depositRoute, /payMockDepositForMatch/)
  assert.match(paymentLib, /DepositPaymentProvider/)
  assert.match(paymentLib, /\['mock', 'toss'\]/)
  assert.match(paymentLib, /NEXT_PUBLIC_PAYMENT_PROVIDER/)
  assert.doesNotMatch(paymentLib, /kakao|KAKAOPAY|KAKAOPAY_CID/i)
  assert.match(paymentLib, /payment_provider_not_configured/)
  assert.match(paymentLib, /NODE_ENV === 'production'/)
  assert.match(paymentLib, /mock_payments_disabled_in_production/)
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

test('Phase 12 migration binds active deposits to matches and removes public mock payment access', () => {
  const ownershipMigration = readSource(
    'supabase/migrations/20260715154000_add_deposit_match_ownership_staging.sql',
  )
  const migration = readSource(
    'supabase/migrations/20260715155041_phase12_payment_ownership_refund_and_friend_safety.sql',
  )

  assert.match(ownershipMigration, /ADD COLUMN IF NOT EXISTS match_id UUID/)
  assert.match(ownershipMigration, /REFERENCES public\.matches\(id\)/)
  assert.match(ownershipMigration, /MIN\(match_id::TEXT\)::UUID/)
  assert.doesNotMatch(ownershipMigration, /MIN\(match_id\)/)
  assert.doesNotMatch(ownershipMigration, /candidate_links/)
  assert.doesNotMatch(ownershipMigration, /JOIN public\.matches AS m/)
  assert.match(migration, /active_deposits_missing_match_id/)
  assert.match(migration, /CREATE UNIQUE INDEX[\s\S]*deposits[\s\S]*match_id[\s\S]*user_id/)
  assert.match(migration, /WHERE status IN \('pending', 'paid', 'held'\)/)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.deposits FROM authenticated/)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.deposit_refund_requests FROM authenticated/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.mock_pay_deposit\(UUID, INT\) FROM authenticated/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.distribute_no_show_penalty\(UUID, UUID\[\]\) FROM PUBLIC/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.distribute_no_show_penalty\(UUID, UUID\[\]\) FROM authenticated/)
  assert.match(migration, /mock_pay_deposit_for_match/)
  assert.match(migration, /prepare_refund_request/)
  assert.match(migration, /finalize_refund_request/)
  assert.match(migration, /SET search_path = ''/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.finalize_refund_request[\s\S]*TO service_role/)
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.mock_pay_deposit_for_match\(UUID, UUID, UUID, INT\) TO authenticated/,
  )

  const noShowPenalty = migration.match(
    /CREATE OR REPLACE FUNCTION public\.distribute_no_show_penalty[\s\S]*?REVOKE ALL ON FUNCTION public\.distribute_no_show_penalty/,
  )?.[0] ?? ''
  assert.match(noShowPenalty, /d\.match_id = p_match_id/)
  assert.doesNotMatch(noShowPenalty, /AND group_id IN/)
})

test('refund settlement records immutable attempt and provider evidence', () => {
  const migration = readSource(
    'supabase/migrations/20260715155041_phase12_payment_ownership_refund_and_friend_safety.sql',
  )
  const refundRoute = readSource('app/api/matches/[id]/refund/route.ts')

  assert.match(migration, /settlement_version INT NOT NULL DEFAULT 1/)
  assert.match(migration, /provider_payment_key TEXT/)
  assert.match(migration, /provider_order_id TEXT/)
  assert.match(migration, /provider_request_key TEXT/)
  assert.match(migration, /settled_refund_amount INT/)
  assert.match(migration, /refunded_amount INT/)
  assert.match(migration, /retained_amount INT/)
  assert.match(migration, /legacy_unverified/)
  assert.match(migration, /legacy_refund_verification_required/)
  assert.match(migration, /p_settlement_version/)
  assert.match(migration, /p_provider_payment_key/)
  assert.match(migration, /p_provider_order_id/)
  assert.match(migration, /p_provider_request_key/)
  assert.match(migration, /p_settled_refund_amount/)
  assert.match(migration, /p_provider_status IS NULL/)
  assert.match(migration, /p_provider_status IS DISTINCT FROM 'MOCK'/)
  assert.match(migration, /p_provider_status IS DISTINCT FROM 'NOT_REQUIRED'/)
  assert.match(refundRoute, /settlement_version/)
  assert.match(refundRoute, /params\.payment\.paymentKey !== params\.deposit\.toss_payment_key/)
  assert.match(refundRoute, /params\.payment\.orderId !== params\.deposit\.toss_order_id/)
  assert.match(refundRoute, /verifyTossRefundEvidence/)
  assert.match(refundRoute, /const currentPayment = await getTossPayment\(paymentKey\)/)
  assert.match(refundRoute, /reference: evidence\.transactionKey/)
  assert.doesNotMatch(refundRoute, /\.reduce\(/)
  assert.match(refundRoute, /buildTossRefundRequestKey/)
})

test('legacy no-consent department friendships are removed before consent-only suggestions launch', () => {
  const migration = readSource(
    'supabase/migrations/20260715155041_phase12_payment_ownership_refund_and_friend_safety.sql',
  )

  assert.match(
    migration,
    /DELETE FROM public\.friendships[\s\S]*status = 'active'[\s\S]*created_from_request_id IS NULL/,
  )
})

test('match confirmation and detail count deposits for the exact match only', () => {
  const migration = readSource(
    'supabase/migrations/20260715155041_phase12_payment_ownership_refund_and_friend_safety.sql',
  )
  const confirmMatch = migration.match(
    /CREATE OR REPLACE FUNCTION public\.confirm_match[\s\S]*?GRANT EXECUTE ON FUNCTION public\.confirm_match/,
  )?.[0] ?? ''
  const matchDetail = migration.match(
    /CREATE OR REPLACE FUNCTION public\.get_match_detail[\s\S]*?GRANT EXECUTE ON FUNCTION public\.get_match_detail/,
  )?.[0] ?? ''

  assert.match(confirmMatch, /d\.match_id = p_match_id/)
  assert.match(matchDetail, /d\.match_id = p_match_id/g)
  assert.doesNotMatch(confirmMatch, /WHERE d\.group_id = v_caller_group_id/)
  assert.doesNotMatch(matchDetail, /WHERE d\.group_id = v_(?:my|opp)_group_id/)
})

test('automatic refund paths queue provider settlement without claiming completion', () => {
  const migration = readSource(
    'supabase/migrations/20260715155041_phase12_payment_ownership_refund_and_friend_safety.sql',
  )
  const continuationTrigger = migration.match(
    /CREATE OR REPLACE FUNCTION public\.trg_continuation_both_continue_check[\s\S]*?REVOKE ALL ON FUNCTION public\.trg_continuation_both_continue_check/,
  )?.[0] ?? ''
  const expiryWorker = migration.match(
    /CREATE OR REPLACE FUNCTION public\.expire_refund_requests[\s\S]*?REVOKE ALL ON FUNCTION public\.expire_refund_requests/,
  )?.[0] ?? ''
  const prepareRefund = migration.match(
    /CREATE OR REPLACE FUNCTION public\.prepare_refund_request[\s\S]*?REVOKE ALL ON FUNCTION public\.prepare_refund_request/,
  )?.[0] ?? ''

  for (const source of [continuationTrigger, expiryWorker]) {
    assert.match(source, /public\.deposit_refund_requests/)
    assert.match(source, /'pending'/)
    assert.doesNotMatch(source, /UPDATE public\.deposits/)
    assert.doesNotMatch(source, /'refund_processed'/)
  }

  assert.match(prepareRefund, /deposit_match_mismatch/)
  assert.doesNotMatch(prepareRefund, /UPDATE public\.deposits/)
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
