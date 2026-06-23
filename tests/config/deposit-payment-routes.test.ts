import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildDepositPaymentRequestDraft,
  buildDepositCustomerKey,
  normalizeDepositReturnPath,
} from '../../lib/payments/deposit'

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
    'lib/payments/toss-browser.ts',
    'lib/payments/toss.ts',
  ]

  for (const route of routes) {
    assert.equal(existsSync(join(ROOT, route)), true, `${route} is missing`)
  }
})

test('deposit payment routes use provider readiness and return Toss browser checkout payloads', () => {
  const startRoute = readSource('app/api/payments/deposit/route.ts')
  const depositsRoute = readSource('app/api/deposits/route.ts')
  const confirmRoute = readSource('app/api/payments/deposit/confirm/route.ts')
  const cancelRoute = readSource('app/api/payments/deposit/cancel/route.ts')
  const webhookRoute = readSource('app/api/payments/deposit/webhook/route.ts')
  const tossHelper = readSource('lib/payments/toss.ts')

  for (const source of [startRoute, confirmRoute, cancelRoute, webhookRoute]) {
    assert.match(source, /getDepositPaymentReadiness/)
    assert.doesNotMatch(source, /fetch\(['"]https:\/\//)
  }

  assert.match(startRoute, /mock_pay_deposit/)
  assert.match(startRoute, /clientKey: process\.env\.NEXT_PUBLIC_TOSS_CLIENT_KEY/)
  assert.match(depositsRoute, /clientKey: process\.env\.NEXT_PUBLIC_TOSS_CLIENT_KEY/)
  assert.match(startRoute, /getPublicAppOrigin\(\) \|\| req\.nextUrl\.origin/)
  assert.match(depositsRoute, /getPublicAppOrigin\(\) \|\| req\.nextUrl\.origin/)
  assert.doesNotMatch(startRoute, /createTossPaymentWindow/)
  assert.doesNotMatch(depositsRoute, /createTossPaymentWindow/)
  assert.match(confirmRoute, /isDepositPaymentAmountValid/)
  assert.match(confirmRoute, /confirmTossPayment/)
  assert.doesNotMatch(confirmRoute, /awaiting_provider_webhook/)
  assert.match(cancelRoute, /payment_cancelled/)
  assert.match(cancelRoute, /PAYMENT_INTERNAL_SECRET/)
  assert.match(cancelRoute, /cancelTossPayment/)
  assert.doesNotMatch(cancelRoute, /body\.internal_secret/)
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
  assert.doesNotMatch(tossHelper, /\/payments',/)
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

test('Toss deposit readiness requires checkout, refund, and reconciliation server envs', () => {
  const paymentLib = readSource('lib/payments/deposit.ts')

  assert.match(paymentLib, /TOSS_SECRET_KEY/)
  assert.match(paymentLib, /NEXT_PUBLIC_TOSS_CLIENT_KEY/)
  assert.match(paymentLib, /PAYMENT_INTERNAL_SECRET/)
  assert.match(paymentLib, /SUPABASE_SERVICE_ROLE_KEY/)
})

test('deposit checkout order name is readable Korean copy for Toss users', () => {
  const draft = buildDepositPaymentRequestDraft({
    provider: 'toss',
    groupId: 'group-1',
    userId: 'user-1',
    origin: 'https://booting.example',
    orderId: 'deposit_group1_user1_test',
  })

  assert.equal(draft.orderName, '부팅 보증금 10,000원')
  assert.doesNotMatch(draft.orderName, /[?�]|遺|蹂|湲|寃|留/)
})

test('local env example documents mock and Toss sandbox payment settings without secrets', () => {
  for (const file of ['.env.local.example', '.env.example']) {
    const envExample = readSource(file)

    assert.match(envExample, /NEXT_PUBLIC_PAYMENT_PROVIDER=mock/)
    assert.match(envExample, /PAYMENT_PROVIDER=mock/)
    assert.match(envExample, /NEXT_PUBLIC_TOSS_CLIENT_KEY=/)
    assert.match(envExample, /TOSS_SECRET_KEY=/)
    assert.match(envExample, /PAYMENT_INTERNAL_SECRET=/)
    assert.match(envExample, /SUPABASE_SERVICE_ROLE_KEY=/)
    assert.match(envExample, /NEXT_PUBLIC_TOSS_CLIENT_KEY is .*browser/)
    assert.match(envExample, /TOSS_SECRET_KEY is server-only/)
    assert.match(envExample, /Never expose these with NEXT_PUBLIC_/)
    assert.doesNotMatch(envExample, /TOSS_SECRET_KEY=gsk_/)
    assert.doesNotMatch(envExample, /SUPABASE_SERVICE_ROLE_KEY=eyJ/)
  }
})

test('payment env checker supports mock review and Toss sandbox preflight without printing secrets', () => {
  const packageJson = readSource('package.json')
  const checker = readSource('scripts/check-payment-env.mjs')

  assert.match(packageJson, /"check:payment-env": "node scripts\/check-payment-env\.mjs"/)
  assert.match(packageJson, /"check:secrets": "node scripts\/check-secret-leaks\.mjs"/)
  assert.match(checker, /--provider=/)
  assert.match(checker, /NEXT_PUBLIC_PAYMENT_PROVIDER/)
  assert.match(checker, /PAYMENT_PROVIDER/)
  assert.match(checker, /browser payment mode/)
  assert.match(checker, /server payment mode/)
  assert.match(checker, /NEXT_PUBLIC_TOSS_CLIENT_KEY/)
  assert.match(checker, /TOSS_SECRET_KEY/)
  assert.match(checker, /PAYMENT_INTERNAL_SECRET/)
  assert.match(checker, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(checker, /console\.table\(rows\)/)
  assert.match(checker, /isPlaceholderValue/)
  assert.doesNotMatch(checker, /console\.log\(env/)
  assert.doesNotMatch(checker, /console\.log\(fileEnv/)
  assert.doesNotMatch(checker, /console\.table\(env/)
})

test('deployment readiness checker verifies git, Vercel link, and Toss env without printing secrets', () => {
  const packageJson = readSource('package.json')
  const checker = readSource('scripts/check-deploy-readiness.mjs')

  assert.match(packageJson, /"check:deploy-readiness": "node scripts\/check-deploy-readiness\.mjs"/)
  assert.match(checker, /git status --short --branch/)
  assert.match(checker, /lines\.length > 1/)
  assert.match(checker, /readLocalEnvFile/)
  assert.match(checker, /\.\.\.readLocalEnvFile\(\),\s+\.\.\.process\.env/)
  assert.match(checker, /\.vercel[\\/]project\.json/)
  assert.match(checker, /vercel --version/)
  assert.match(checker, /vercel whoami/)
  assert.match(checker, /CI: '1'/)
  assert.match(checker, /VERCEL_TELEMETRY_DISABLED: '1'/)
  assert.match(checker, /where\.exe vercel/)
  assert.match(checker, /commandExists/)
  assert.match(checker, /scripts\/check-secret-leaks\.mjs/)
  assert.match(checker, /git-tracked files do not contain Supabase\/Toss secret values/)
  assert.match(checker, /scripts\/check-payment-env\.mjs/)
  assert.match(checker, /--provider=toss/)
  assert.match(checker, /classifyAppOrigin\(env\.NEXT_PUBLIC_APP_ORIGIN\)/)
  assert.match(checker, /isPlaceholderValue/)
  assert.match(checker, /localhost/)
  assert.doesNotMatch(checker, /console\.log\(process\.env/)
  assert.doesNotMatch(checker, /TOSS_SECRET_KEY=.*test/)
  assert.doesNotMatch(checker, /SUPABASE_SERVICE_ROLE_KEY=.*eyJ/)
})

test('tracked secret scanner blocks real payment and service-role keys without printing values', () => {
  const scanner = readSource('scripts/check-secret-leaks.mjs')

  assert.match(scanner, /git ls-files/)
  assert.match(scanner, /toss_api_key/)
  assert.match(scanner, /supabase_service_role_jwt/)
  assert.match(scanner, /tracked_supabase_public_jwt_env/)
  assert.match(scanner, /console\.error\(`\$\{finding\.file\}:\$\{finding\.line\}:\$\{finding\.detector\}`\)/)
  assert.doesNotMatch(scanner, /console\.error\([^)]*value/)
  assert.doesNotMatch(scanner, /console\.log\([^)]*value/)

  const output = execFileSync('node', ['scripts/check-secret-leaks.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  assert.match(output, /Tracked secret scan passed/)
})

test('payment env checker rejects malformed Toss and service role values without printing secrets', () => {
  const baseEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: makeFakeJwt({ role: 'anon' }),
    NEXT_PUBLIC_TOSS_CLIENT_KEY: 'test_ck_fake_client_key',
    TOSS_SECRET_KEY: ['test', 'sk', 'fake_secret_key'].join('_'),
    PAYMENT_INTERNAL_SECRET: 'local-internal-secret',
    SUPABASE_SERVICE_ROLE_KEY: `${makeFakeJwt({ role: 'service_role' })}그저`,
  }

  assert.throws(
    () => execFileSync('node', ['scripts/check-payment-env.mjs', '--provider=toss'], {
      cwd: ROOT,
      env: baseEnv,
      encoding: 'utf8',
      stdio: 'pipe',
    }),
    (error: unknown) => {
      const output = String((error as { stdout?: unknown; stderr?: unknown }).stdout ?? '')
        + String((error as { stdout?: unknown; stderr?: unknown }).stderr ?? '')
      assert.match(output, /INVALID/)
      assert.doesNotMatch(output, /local-internal-secret/)
      assert.doesNotMatch(output, /fake_secret_key/)
      return true
    },
  )
})

test('payment env checker rejects Toss keys with trailing prose or unsafe characters', () => {
  const baseEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: makeFakeJwt({ role: 'anon' }),
    NEXT_PUBLIC_PAYMENT_PROVIDER: 'toss',
    PAYMENT_PROVIDER: 'toss',
    NEXT_PUBLIC_TOSS_CLIENT_KEY: 'test_ck_fake_client_key',
    TOSS_SECRET_KEY: 'test_sk_fake_secret_key 이거니까',
    PAYMENT_INTERNAL_SECRET: 'local-internal-secret',
    SUPABASE_SERVICE_ROLE_KEY: makeFakeJwt({ role: 'service_role' }),
  }

  assert.throws(
    () => execFileSync('node', ['scripts/check-payment-env.mjs', '--provider=toss'], {
      cwd: ROOT,
      env: baseEnv,
      encoding: 'utf8',
      stdio: 'pipe',
    }),
    (error: unknown) => {
      const output = String((error as { stdout?: unknown; stderr?: unknown }).stdout ?? '')
        + String((error as { stdout?: unknown; stderr?: unknown }).stderr ?? '')
      assert.match(output, /INVALID/)
      assert.match(output, /TOSS_SECRET_KEY/)
      assert.doesNotMatch(output, /fake_secret_key/)
      return true
    },
  )
})

test('payment env checker rejects copied placeholder deployment values', () => {
  const baseEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'https://your-project.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_your-key',
    NEXT_PUBLIC_PAYMENT_PROVIDER: 'toss',
    PAYMENT_PROVIDER: 'toss',
    NEXT_PUBLIC_TOSS_CLIENT_KEY: 'test_ck_your_client_key',
    TOSS_SECRET_KEY: 'test_sk_your_secret_key',
    PAYMENT_INTERNAL_SECRET: 'replace_me_secret',
    SUPABASE_SERVICE_ROLE_KEY: makeFakeJwt({ role: 'service_role' }),
  }

  assert.throws(
    () => execFileSync('node', ['scripts/check-payment-env.mjs', '--provider=toss'], {
      cwd: ROOT,
      env: baseEnv,
      encoding: 'utf8',
      stdio: 'pipe',
    }),
    (error: unknown) => {
      const output = String((error as { stdout?: unknown; stderr?: unknown }).stdout ?? '')
        + String((error as { stdout?: unknown; stderr?: unknown }).stderr ?? '')
      assert.match(output, /INVALID/)
      assert.match(output, /NEXT_PUBLIC_SUPABASE_URL/)
      assert.doesNotMatch(output, /replace_me_secret/)
      assert.doesNotMatch(output, /your_secret_key/)
      return true
    },
  )
})

test('deposit payment request draft sends failed checkout back through cancel route', () => {
  const paymentLib = readSource('lib/payments/deposit.ts')

  assert.match(paymentLib, /failUrl/)
  assert.match(paymentLib, /\/api\/payments\/deposit\/cancel/)
})

test('Toss checkout browser success callback returns users to the app', () => {
  const confirmRoute = readSource('app/api/payments/deposit/confirm/route.ts')

  assert.match(confirmRoute, /export async function GET\(req: NextRequest\) \{\s+return confirmDeposit\(req, \{ redirectBrowser: true \}\)/)
  assert.match(confirmRoute, /NextResponse\.redirect\(target\)/)
  assert.match(confirmRoute, /normalizeDepositReturnPath\(req\.nextUrl\.searchParams\.get\('return_path'\)\)/)
  assert.match(confirmRoute, /getPublicAppOrigin\(\) \|\| req\.nextUrl\.origin/)
  assert.match(confirmRoute, /target\.searchParams\.set\('payment', 'paid'\)/)
  assert.match(confirmRoute, /target\.searchParams\.set\('payment', 'failed'\)/)
})

test('deposit checkout preserves safe return paths for group and match flows', () => {
  const paymentLib = readSource('lib/payments/deposit.ts')
  const depositsRoute = readSource('app/api/deposits/route.ts')
  const paymentRoute = readSource('app/api/payments/deposit/route.ts')
  const confirmRoute = readSource('app/api/payments/deposit/confirm/route.ts')
  const cancelRoute = readSource('app/api/payments/deposit/cancel/route.ts')
  const groupCreatePage = readSource('app/group/create/page.tsx')
  const matchDetailPage = readSource('app/match/[id]/page.tsx')

  assert.match(paymentLib, /returnPath\?: string/)
  assert.match(paymentLib, /normalizeDepositReturnPath/)
  assert.match(paymentLib, /return_path=\$\{encodeURIComponent\(returnPath\)\}/)
  assert.match(depositsRoute, /returnPath: typeof body\.return_path === 'string' \? body\.return_path : undefined/)
  assert.match(paymentRoute, /returnPath: typeof body\.return_path === 'string' \? body\.return_path : undefined/)
  assert.match(confirmRoute, /normalizeDepositReturnPath\(req\.nextUrl\.searchParams\.get\('return_path'\)\)/)
  assert.match(cancelRoute, /normalizeDepositReturnPath\(req\.nextUrl\.searchParams\.get\('return_path'\)\)/)
  assert.match(cancelRoute, /getPublicAppOrigin\(\) \|\| req\.nextUrl\.origin/)
  assert.doesNotMatch(cancelRoute, /new URL\('\/match\/start'/)
  assert.match(groupCreatePage, /return_path: `\/group\/create\?size=\$\{capacity\}`/)
  assert.match(matchDetailPage, /return_path: `\/match\/\$\{match\.match_id\}`/)
})

test('client pages open Toss payment window with the browser SDK request payload', () => {
  const groupCreatePage = readSource('app/group/create/page.tsx')
  const matchDetailPage = readSource('app/match/[id]/page.tsx')
  const browserHelper = readSource('lib/payments/toss-browser.ts')

  assert.match(groupCreatePage, /const data = await res\.json\(\)\.catch/)
  assert.match(groupCreatePage, /await requestTossPaymentWindow\(data\.payment\)/)
  assert.match(matchDetailPage, /await requestTossPaymentWindow\(data\.payment\)/)
  assert.match(browserHelper, /https:\/\/js\.tosspayments\.com\/v2\/standard/)
  assert.match(browserHelper, /payment\.requestPayment/)
  assert.match(browserHelper, /requestPayment\('카드'/)
  assert.doesNotMatch(groupCreatePage, /window\.location\.href = data\.payment\.checkoutUrl/)
  assert.doesNotMatch(matchDetailPage, /window\.location\.href = data\.payment\.checkoutUrl/)
  assert.doesNotMatch(groupCreatePage, /res\.status === 202\)[\s\S]{0,220}setError\('외부 결제창 연결 준비 상태/)
})

test('Toss customer key stays within the browser SDK length limit', () => {
  const longUserId = 'user_' + 'abcdef1234567890'.repeat(10)
  const customerKey = buildDepositCustomerKey(longUserId)

  assert.ok(customerKey.startsWith('deposit_'))
  assert.ok(customerKey.length <= 50, `customerKey is too long: ${customerKey.length}`)
  assert.doesNotMatch(customerKey, /[^a-zA-Z0-9_-]/)
})

test('deposit return path only allows group and match screens', () => {
  assert.equal(normalizeDepositReturnPath('/group/create?size=2'), '/group/create?size=2')
  assert.equal(normalizeDepositReturnPath('/match/dev-match-1'), '/match/dev-match-1')
  assert.equal(normalizeDepositReturnPath('/api/payments/deposit/cancel'), '/group/create')
  assert.equal(normalizeDepositReturnPath('/admin'), '/group/create')
  assert.equal(normalizeDepositReturnPath('//evil.example/path'), '/group/create')
  assert.equal(normalizeDepositReturnPath('https://evil.example/path'), '/group/create')
})

function makeFakeJwt(payload: Record<string, unknown>) {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.')
}

test('group create page explains payment callback results after Toss returns', () => {
  const groupCreatePage = readSource('app/group/create/page.tsx')

  assert.match(groupCreatePage, /const paymentStatus = searchParams\.get\('payment'\)/)
  assert.match(groupCreatePage, /보증금 결제가 확인됐어요/)
  assert.match(groupCreatePage, /결제가 완료되지 않았어요/)
  assert.match(groupCreatePage, /refreshDeposit\(group\.id\)/)
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
