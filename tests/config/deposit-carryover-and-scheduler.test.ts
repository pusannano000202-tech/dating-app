import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('deposit carryover keeps provider evidence and records every match transfer', () => {
  const migration = readSource(
    'supabase/migrations/20260812003000_deposit_carryover.sql',
  )

  assert.match(migration, /CREATE TABLE public\.deposit_carryovers/)
  assert.match(migration, /source_match_id UUID NOT NULL/)
  assert.match(migration, /target_match_id UUID/)
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'available'/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.choose_deposit_carryover/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.apply_available_deposit_carryover/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.prepare_refund_request/)
  assert.match(migration, /UPDATE public\.deposit_carryovers AS c[\s\S]*SET status = 'cancelled'[\s\S]*INSERT INTO public\.deposit_refund_requests/)
  assert.match(migration, /FOR UPDATE OF d SKIP LOCKED/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.apply_available_deposit_carryover[\s\S]*TO service_role/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.apply_available_deposit_carryover[\s\S]*FROM authenticated/)
  assert.match(migration, /UPDATE public\.deposits[\s\S]*match_id = p_match_id[\s\S]*group_id = p_group_id/)
  assert.doesNotMatch(migration, /toss_payment_key\s*=/)
  assert.doesNotMatch(migration, /toss_order_id\s*=/)

  const hardening = readSource(
    'supabase/migrations/20260812004500_deposit_carryover_hardening.sql',
  )
  assert.match(hardening, /guard_refund_against_carryover\(\)[\s\S]*FROM PUBLIC/)
  assert.match(hardening, /cancel_deposit_carryover_for_refund\(UUID\)[\s\S]*FROM authenticated/)
  assert.match(hardening, /deposit_carryovers_source_match_idx/)
  assert.match(hardening, /deposit_carryovers_target_match_idx/)
  assert.match(hardening, /deposit_carryovers_target_group_idx/)
})

test('completed match settlement offers full refund or carryover without deducting support from deposit', () => {
  const page = readSource('app/match/[id]/refund/page.tsx')
  const route = readSource('app/api/matches/[id]/deposit-carryover/route.ts')
  const refundRoute = readSource('app/api/matches/[id]/refund/route.ts')

  assert.match(page, /다음 매칭에 그대로 사용/)
  assert.match(page, /\{amountLabel\} 전액 환불/)
  assert.match(page, /deposit-carryover/)
  assert.doesNotMatch(page, /app_fee_amount/)
  assert.doesNotMatch(page, /앱 기여금/)
  assert.match(route, /choose_deposit_carryover/)
  assert.match(refundRoute, /refundAmount !== DEPOSIT_AMOUNT/)
  assert.match(refundRoute, /full_refund_required/)
  assert.doesNotMatch(refundRoute, /app_fee_amount/)
  assert.doesNotMatch(refundRoute, /cancel_deposit_carryover_for_refund/)
})

test('new deposit checkout consumes an available carryover before opening a provider checkout', () => {
  const route = readSource('app/api/payments/deposit/route.ts')

  const applyIndex = route.indexOf(".rpc('apply_available_deposit_carryover'")
  const providerIndex = route.indexOf('resolveDepositPaymentProvider()')
  assert.ok(applyIndex >= 0)
  assert.ok(providerIndex >= 0)
  assert.ok(applyIndex < providerIndex)
  assert.match(route, /reused_carryover: true/)
})

test('match UI deposit checkout returns a no-payment result when carryover covers the deposit', () => {
  const route = readSource('app/api/deposits/route.ts')

  const applyIndex = route.indexOf(".rpc('apply_available_deposit_carryover'")
  const providerIndex = route.indexOf('resolveDepositPaymentProvider()')
  assert.ok(applyIndex >= 0)
  assert.ok(providerIndex >= 0)
  assert.ok(applyIndex < providerIndex)
  assert.match(route, /provider: 'carryover'/)
  assert.match(route, /reused_carryover: true/)
  assert.match(route, /payment_required: false/)
  assert.match(route, /status: 'held'/)
})

test('expired Toss attempts rotate only an unconfirmed pending order with compare-and-set', () => {
  const route = readSource('app/api/deposits/route.ts')
  const payment = readSource('lib/payments/deposit.ts')

  assert.match(route, /getTossPaymentByOrderId/)
  assert.match(route, /getTossDepositOrderAction/)
  assert.match(payment, /status === 'EXPIRED'/)
  assert.match(payment, /status === 'ABORTED'/)
  assert.match(route, /error\.code === 'NOT_FOUND_PAYMENT_SESSION'/)
  assert.match(route, /\.eq\('status', 'pending'\)/)
  assert.match(route, /\.eq\('toss_order_id', previousOrderId\)/)
  assert.match(route, /\.is\('toss_payment_key', null\)/)
  assert.match(route, /deposit_payment_reconciliation_required/)
})

test('existing deposit amount is validated before it can satisfy the match', () => {
  const route = readSource('app/api/deposits/route.ts')

  const amountCheckIndex = route.indexOf('deposit.amount !== DEPOSIT_AMOUNT')
  const existingDepositIndex = route.indexOf("deposit?.status === 'paid'")
  assert.ok(amountCheckIndex >= 0)
  assert.ok(existingDepositIndex >= 0)
  assert.ok(amountCheckIndex < existingDepositIndex)
})

test('Vercel cron invokes the bounded refund worker with a dedicated cron secret', () => {
  const worker = readSource('app/api/internal/payments/refunds/process/route.ts')
  const vercel = JSON.parse(readSource('vercel.json')) as {
    crons?: Array<{ path?: string; schedule?: string }>
  }

  assert.match(worker, /export async function GET/)
  assert.match(worker, /process\.env\.CRON_SECRET/)
  assert.match(worker, /export async function POST/)
  assert.match(worker, /process\.env\.PAYMENT_INTERNAL_SECRET/)
  assert.match(worker, /rpc\('expire_refund_requests'\)/)
  assert.match(worker, /MAX_REFUNDS_PER_INVOCATION = 5/)
  assert.doesNotMatch(worker, /for \(let batch = 0; batch < 3; batch \+= 1\)/)
  assert.ok(vercel.crons?.some((cron) =>
    cron.path === '/api/internal/payments/refunds/process'
    && cron.schedule === '0 19 * * *'))
})
