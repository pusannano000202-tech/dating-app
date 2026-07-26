import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildDepositPaymentRequestDraft,
  buildDepositCustomerKey,
  getDepositPaymentReadiness,
  normalizeDepositReturnPath,
  resolveDepositPaymentProvider,
} from '../../lib/payments/deposit'
import {
  buildTossRefundRequestKey,
  verifyTossPartialRefundEvidence,
  verifyTossRefundEvidence,
  type TossPaymentObject,
} from '../../lib/payments/toss'
import { getSupabaseAdminKeyStatus } from '../../lib/supabase-admin'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n')
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

test('Supabase admin credentials have one server-only resolver', () => {
  const helperPath = join(ROOT, 'lib/supabase-admin.ts')

  assert.equal(existsSync(helperPath), true, 'lib/supabase-admin.ts is missing')
})

test('Supabase admin resolver accepts a modern secret key before a legacy service-role JWT', () => {
  const previousEnv = {
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  try {
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_fake_modern_server_key_123456'
    process.env.SUPABASE_SERVICE_ROLE_KEY = makeFakeJwt({ role: 'anon' })

    assert.deepEqual(getSupabaseAdminKeyStatus(), {
      ok: true,
      key: 'sb_secret_fake_modern_server_key_123456',
      source: 'secret',
    })

    delete process.env.SUPABASE_SECRET_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = makeFakeJwt({ role: 'service_role' })
    assert.equal(getSupabaseAdminKeyStatus().ok, true)

    process.env.SUPABASE_SERVICE_ROLE_KEY = makeFakeJwt({ role: 'anon' })
    assert.deepEqual(getSupabaseAdminKeyStatus(), { ok: false, reason: 'invalid' })
  } finally {
    restoreEnv('SUPABASE_SECRET_KEY', previousEnv.SUPABASE_SECRET_KEY)
    restoreEnv('SUPABASE_SERVICE_ROLE_KEY', previousEnv.SUPABASE_SERVICE_ROLE_KEY)
  }
})

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

  assert.match(startRoute, /payMockDepositForMatch/)
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
  assert.match(webhookRoute, /getSupabaseAdminKey/)
  assert.doesNotMatch(webhookRoute, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(webhookRoute, /mapTossPaymentStatusToReconcileAction/)
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

test('payment provider cannot be downgraded to mock by request input in production', () => {
  const routes = [
    readSource('app/api/deposits/route.ts'),
    readSource('app/api/payments/deposit/route.ts'),
    readSource('app/api/payments/deposit/confirm/route.ts'),
    readSource('app/api/payments/deposit/cancel/route.ts'),
    readSource('app/api/payments/deposit/webhook/route.ts'),
  ]

  for (const route of routes) {
    assert.match(route, /resolveDepositPaymentProvider\(\)/)
    assert.doesNotMatch(route, /resolveDepositPaymentProvider\(\s*(?:body|readString|req\.nextUrl)/)
  }

  const previousServerProvider = process.env.PAYMENT_PROVIDER
  const previousPublicProvider = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER
  const previousNodeEnv = process.env.NODE_ENV

  try {
    process.env.PAYMENT_PROVIDER = 'toss'
    process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = 'mock'
    assert.equal(resolveDepositPaymentProvider(), 'toss')

    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    assert.deepEqual(getDepositPaymentReadiness('mock'), {
      ok: false,
      provider: 'mock',
      error: 'payment_provider_not_configured',
      missing: [],
      invalid: ['mock_payments_disabled_in_production'],
    })
  } finally {
    restoreEnv('PAYMENT_PROVIDER', previousServerProvider)
    restoreEnv('NEXT_PUBLIC_PAYMENT_PROVIDER', previousPublicProvider)
    restoreEnv('NODE_ENV', previousNodeEnv)
  }
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
  assert.match(paymentLib, /getSupabaseAdminKeyStatus/)
})

test('mock deposit readiness requires the same server settlement credential as its route', () => {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  try {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'development'
    delete process.env.SUPABASE_SECRET_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    assert.deepEqual(getDepositPaymentReadiness('mock'), {
      ok: false,
      provider: 'mock',
      error: 'payment_provider_not_configured',
      missing: ['supabase_admin_key'],
      invalid: [],
    })

    process.env.SUPABASE_SECRET_KEY = 'sb_secret_fake_mock_server_key_123456'
    assert.deepEqual(getDepositPaymentReadiness('mock'), {
      ok: true,
      provider: 'mock',
    })
  } finally {
    restoreEnv('NODE_ENV', previousEnv.NODE_ENV)
    restoreEnv('SUPABASE_SECRET_KEY', previousEnv.SUPABASE_SECRET_KEY)
    restoreEnv('SUPABASE_SERVICE_ROLE_KEY', previousEnv.SUPABASE_SERVICE_ROLE_KEY)
  }
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
    assert.match(envExample, /SUPABASE_SECRET_KEY=/)
    assert.match(envExample, /SUPABASE_SERVICE_ROLE_KEY=/)
    assert.match(envExample, /sb_secret_/)
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
  assert.match(checker, /SUPABASE_SECRET_KEY/)
  assert.match(checker, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(checker, /--no-env-file/)
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
  assert.match(checker, /checkDevPreviewAuthEnv/)
  assert.match(checker, /NEXT_PUBLIC_DEV_AUTH_BYPASS/)
  assert.match(checker, /NEXT_PUBLIC_BOOTING_DEMO_MODE/)
  assert.match(checker, /production deployments must not enable dev preview auth flags/)
  assert.match(checker, /classifyAppOrigin\(env\.NEXT_PUBLIC_APP_ORIGIN\)/)
  assert.match(checker, /isPlaceholderValue/)
  assert.match(checker, /localhost/)
  assert.match(checker, /printNextSteps/)
  assert.match(checker, /vercel login/)
  assert.match(checker, /vercel link/)
  assert.match(checker, /NEXT_PUBLIC_APP_ORIGIN/)
  assert.doesNotMatch(checker, /console\.log\(process\.env/)
  assert.doesNotMatch(checker, /TOSS_SECRET_KEY=.*test/)
  assert.doesNotMatch(checker, /SUPABASE_SERVICE_ROLE_KEY=.*eyJ/)
  assert.doesNotMatch(checker, /SUPABASE_SECRET_KEY=.*sb_secret_[A-Za-z0-9_-]{12,}/)
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
    SUPABASE_SECRET_KEY: '',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: makeFakeJwt({ role: 'anon' }),
    NEXT_PUBLIC_TOSS_CLIENT_KEY: 'test_ck_fake_client_key',
    TOSS_SECRET_KEY: ['test', 'sk', 'fake_secret_key'].join('_'),
    PAYMENT_INTERNAL_SECRET: 'local-internal-secret',
    SUPABASE_SERVICE_ROLE_KEY: `${makeFakeJwt({ role: 'service_role' })}그저`,
  }

  assert.throws(
    () => execFileSync('node', ['scripts/check-payment-env.mjs', '--provider=toss', '--no-env-file'], {
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
    SUPABASE_SECRET_KEY: '',
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
    () => execFileSync('node', ['scripts/check-payment-env.mjs', '--provider=toss', '--no-env-file'], {
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
    SUPABASE_SECRET_KEY: '',
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
    () => execFileSync('node', ['scripts/check-payment-env.mjs', '--provider=toss', '--no-env-file'], {
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
  assert.match(paymentLib, /matchId\?: string/)
  assert.match(paymentLib, /match_id=\$\{encodeURIComponent\(params\.matchId\)\}/)
  assert.match(depositsRoute, /returnPath: typeof body\.return_path === 'string' \? body\.return_path : undefined/)
  assert.match(depositsRoute, /match_id_required/)
  assert.match(depositsRoute, /validateDepositMatchContext/)
  assert.match(depositsRoute, /\.eq\('match_id', matchId\)/)
  assert.match(depositsRoute, /match_id: matchId/)
  assert.match(paymentRoute, /returnPath: typeof body\.return_path === 'string' \? body\.return_path : undefined/)
  assert.match(paymentRoute, /match_id_required/)
  assert.match(paymentRoute, /validateDepositMatchContext/)
  assert.match(paymentRoute, /\.eq\('match_id', matchId\)/)
  assert.match(paymentRoute, /match_id: matchId/)
  assert.match(confirmRoute, /match_id_required/)
  assert.match(confirmRoute, /validateDepositMatchContext/)
  assert.match(confirmRoute, /\.eq\('match_id', matchId\)/)
  assert.match(confirmRoute, /normalizeDepositReturnPath\(req\.nextUrl\.searchParams\.get\('return_path'\)\)/)
  assert.match(cancelRoute, /normalizeDepositReturnPath\(req\.nextUrl\.searchParams\.get\('return_path'\)\)/)
  assert.match(cancelRoute, /getPublicAppOrigin\(\) \|\| req\.nextUrl\.origin/)
  assert.doesNotMatch(cancelRoute, /new URL\('\/match\/start'/)
  assert.doesNotMatch(groupCreatePage, /fetch\('\/api\/deposits'/)
  assert.doesNotMatch(groupCreatePage, /requestTossPaymentWindow\(data\.payment\)/)
  assert.match(matchDetailPage, /return_path: `\/match\/\$\{match\.match_id\}`/)
  assert.match(matchDetailPage, /match_id: match\.match_id/)
})

test('client pages open Toss payment window with the browser SDK request payload', () => {
  const groupCreatePage = readSource('app/group/create/page.tsx')
  const matchDetailPage = readSource('app/match/[id]/page.tsx')
  const browserHelper = readSource('lib/payments/toss-browser.ts')

  assert.doesNotMatch(groupCreatePage, /await requestTossPaymentWindow\(data\.payment\)/)
  assert.match(matchDetailPage, /await requestTossPaymentWindow\(data\.payment\)/)
  assert.match(browserHelper, /https:\/\/js\.tosspayments\.com\/v2\/standard/)
  assert.match(browserHelper, /payment\.requestPayment/)
  assert.match(browserHelper, /requestPayment\('카드'/)
  assert.doesNotMatch(groupCreatePage, /window\.location\.href = data\.payment\.checkoutUrl/)
  assert.doesNotMatch(matchDetailPage, /window\.location\.href = data\.payment\.checkoutUrl/)
  assert.doesNotMatch(groupCreatePage, /res\.status === 202\)[\s\S]{0,220}setError\('외부 결제창 연결 준비 상태/)
})

test('mock deposit panel shows a demo confirmation step before marking payment complete', () => {
  const depositPanel = readSource('components/matching/DepositPaymentPanel.tsx')

  assert.match(depositPanel, /useState/)
  assert.match(depositPanel, /시연용 결제 확인/)
  assert.match(depositPanel, /실제 돈은 나가지 않아요/)
  assert.match(depositPanel, /결제 확인하고 완료 처리/)
  assert.match(depositPanel, /setMockReviewOpen\(true\)/)
  assert.match(depositPanel, /onPay\(\)/)
})

test('group create explains deposits happen after tentative match instead of charging in queue setup', () => {
  const groupCreatePanel = readSource('components/matching/group-create/FreeBetaQueuePanel.tsx')
  const groupCreatePage = readSource('app/group/create/page.tsx')

  assert.match(groupCreatePanel, /보증금은 가매칭이 잡힌 뒤/)
  assert.match(groupCreatePanel, /가매칭 후 결제/)
  assert.doesNotMatch(groupCreatePanel, /onConfirmParticipation/)
  assert.doesNotMatch(groupCreatePanel, /결제 확인/)
  assert.doesNotMatch(groupCreatePage, /onConfirmParticipation=\{payDeposit\}/)
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

test('group create does not handle deposit callbacks because deposits happen after tentative match', () => {
  const groupCreatePage = readSource('app/group/create/page.tsx')
  const matchDetailPage = readSource('app/match/[id]/page.tsx')

  assert.doesNotMatch(groupCreatePage, /const paymentStatus = searchParams\.get\('payment'\)/)
  assert.doesNotMatch(groupCreatePage, /보증금 결제가 확인됐어요/)
  assert.doesNotMatch(groupCreatePage, /refreshDeposit\(group\.id\)/)
  assert.match(matchDetailPage, /match_id: match\.match_id/)
  assert.match(matchDetailPage, /return_path: `\/match\/\$\{match\.match_id\}`/)
})

test('match refund route prepares, settles with Toss, and finalizes in that order', () => {
  const refundRoute = readSource('app/api/matches/[id]/refund/route.ts')

  assert.match(refundRoute, /prepare_refund_request/)
  assert.match(refundRoute, /finalize_refund_request/)
  assert.match(refundRoute, /cancelTossPayment/)
  assert.match(refundRoute, /createPaymentServiceClient/)
  assert.match(refundRoute, /refund_request_id/)
  assert.match(refundRoute, /refund_settlement_pending/)
  assert.doesNotMatch(refundRoute, /submit_refund_request/)
  assert.ok(
    refundRoute.indexOf(".rpc('prepare_refund_request'") < refundRoute.indexOf('const settlement = await settleRefundWithProvider'),
    'refund must be prepared before provider settlement',
  )
  assert.ok(
    refundRoute.indexOf('const settlement = await settleRefundWithProvider') < refundRoute.indexOf(".rpc('finalize_refund_request'"),
    'DB refund must be finalized only after provider settlement succeeds',
  )
  assert.match(refundRoute, /const payment = await cancelTossPayment/)
  assert.doesNotMatch(refundRoute, /missing:/)
})

test('mock payment is server-only and bound to the current match', () => {
  const routes = [
    readSource('app/api/deposits/route.ts'),
    readSource('app/api/payments/deposit/route.ts'),
    readSource('app/api/payments/deposit/confirm/route.ts'),
  ]
  const serverHelper = readSource('lib/payments/deposit-server.ts')

  for (const route of routes) {
    assert.doesNotMatch(route, /\.rpc\('mock_pay_deposit'/)
    assert.match(route, /payMockDepositForMatch/)
  }

  assert.match(serverHelper, /mock_pay_deposit_for_match/)
  assert.match(serverHelper, /getSupabaseAdminKey/)
  assert.doesNotMatch(serverHelper, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(serverHelper, /p_match_id: params\.matchId/)
  assert.match(serverHelper, /p_user_id: params\.userId/)
})

test('deposit writes use service-only boundaries and Toss confirmation revalidates the match atomically', () => {
  const startRoutes = [
    readSource('app/api/deposits/route.ts'),
    readSource('app/api/payments/deposit/route.ts'),
  ]
  const confirmRoute = readSource('app/api/payments/deposit/confirm/route.ts')

  for (const route of startRoutes) {
    assert.match(route, /createPaymentServiceClient/)
    assert.match(route, /const paymentService = createPaymentServiceClient\(\)/)
    assert.match(route, /paymentService[\s\S]*\.from\('deposits'\)[\s\S]*\.insert\(/)
    assert.doesNotMatch(route, /const created = await supabase[\s\S]*\.insert\(/)
  }

  assert.match(confirmRoute, /createPaymentServiceClient/)
  assert.match(confirmRoute, /const paymentService = createPaymentServiceClient\(\)/)
  assert.match(confirmRoute, /\.rpc\('finalize_toss_deposit_payment'/)
  assert.doesNotMatch(confirmRoute, /reverseApprovedDepositPayment/)
  assert.doesNotMatch(confirmRoute, /cancelTossPayment/)
  assert.match(confirmRoute, /recoverAmbiguousTossConfirmation/)
  assert.match(confirmRoute, /getTossPayment/)
  assert.match(confirmRoute, /finalizeApprovedDepositPayment/)
  assert.match(confirmRoute, /payment_reconciliation_required/)
  assert.doesNotMatch(confirmRoute, /\.update\(\{\s*status: 'paid'/)

  const migration = readSource(
    'supabase/migrations/20260715155041_phase12_payment_ownership_refund_and_friend_safety.sql',
  )
  const finalizer = migration.match(
    /CREATE OR REPLACE FUNCTION public\.finalize_toss_deposit_payment[\s\S]*?GRANT EXECUTE ON FUNCTION public\.finalize_toss_deposit_payment[^;]+;/,
  )?.[0] ?? ''
  assert.match(finalizer, /FROM public\.matches AS m[\s\S]*FOR UPDATE/)
  assert.match(finalizer, /v_match\.status NOT IN \('pending', 'confirmed'\)/)
  assert.match(finalizer, /FROM public\.deposits AS d[\s\S]*FOR UPDATE/)
  assert.match(finalizer, /TO service_role/)
})

test('Toss general payment webhook re-queries and finalizes DONE through the ownership RPC', () => {
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
  assert.match(webhookRoute, /\.rpc\('finalize_toss_deposit_payment'/)
  assert.match(webhookRoute, /p_match_id: deposit\.match_id/)
  assert.match(webhookRoute, /p_group_id: deposit\.group_id/)
  assert.match(webhookRoute, /p_user_id: deposit\.user_id/)
  assert.match(webhookRoute, /partial_cancellation_requires_reconciliation/)
  assert.match(webhookRoute, /sumSuccessfulCancelAmount/)
  assert.doesNotMatch(webhookRoute, /if \(status === 'DONE'\) return 'paid'/)
  assert.doesNotMatch(webhookRoute, /status:\s*nextStatus/)
  assert.doesNotMatch(webhookRoute, /\.update\(\{\s*status:\s*'paid'/)
  assert.doesNotMatch(webhookRoute, /tosspayments-webhook-signature/)
  assert.match(tossHelper, /method: 'GET'/)
  assert.match(tossHelper, /if \(options\.method === 'POST'\)/)
})

test('deposit finalization failures never trigger an automatic provider reversal', () => {
  const confirmRoute = readSource('app/api/payments/deposit/confirm/route.ts')

  assert.match(confirmRoute, /recoverDepositAfterFinalizationFailure/)
  assert.match(confirmRoute, /payment_reconciliation_required/)
  assert.doesNotMatch(confirmRoute, /reverseApprovedDepositPayment/)
  assert.doesNotMatch(confirmRoute, /cancelTossPayment/)
})

test('partial refund evidence requires the latest DONE cancel, exact amount, balance, and total', () => {
  const payment: TossPaymentObject = {
    paymentKey: 'payment-key',
    orderId: 'deposit-order',
    status: 'PARTIAL_CANCELED',
    totalAmount: 10_000,
    balanceAmount: 3_000,
    lastTransactionKey: 'cancel-transaction',
    cancels: [{
      cancelAmount: 7_000,
      cancelStatus: 'DONE',
      transactionKey: 'cancel-transaction',
      canceledAt: '2026-07-25T10:00:00.000Z',
      refundableAmount: 3_000,
    }],
  }

  assert.deepEqual(
    verifyTossPartialRefundEvidence(payment, {
      requestedRefundAmount: 7_000,
      depositAmount: 10_000,
    }),
    {
      ok: true,
      transactionKey: 'cancel-transaction',
      canceledAt: '2026-07-25T10:00:00.000Z',
    },
  )
  assert.equal(
    buildTossRefundRequestKey({
      refundRequestId: 'refund-request',
      settlementVersion: 2,
      refundAmount: 7_000,
    }),
    'refund_refund-request_v2_7000',
  )

  assert.equal(
    verifyTossPartialRefundEvidence(
      { ...payment, lastTransactionKey: 'different-transaction' },
      { requestedRefundAmount: 7_000, depositAmount: 10_000 },
    ).ok,
    false,
  )
  assert.equal(
    verifyTossPartialRefundEvidence(
      { ...payment, balanceAmount: undefined },
      { requestedRefundAmount: 7_000, depositAmount: 10_000 },
    ).ok,
    false,
  )
  assert.equal(
    verifyTossPartialRefundEvidence(
      {
        ...payment,
        cancels: [
          ...(payment.cancels ?? []),
          {
            cancelAmount: 1_000,
            cancelStatus: 'DONE',
            transactionKey: 'older-cancel',
            refundableAmount: 2_000,
          },
        ],
      },
      { requestedRefundAmount: 7_000, depositAmount: 10_000 },
    ).ok,
    false,
  )

  assert.equal(
    verifyTossRefundEvidence(
      {
        ...payment,
        status: 'CANCELED',
        balanceAmount: 0,
        cancels: [{
          cancelAmount: 10_000,
          cancelStatus: 'DONE',
          transactionKey: 'full-cancel',
          refundableAmount: 0,
        }],
        lastTransactionKey: 'full-cancel',
      },
      { requestedRefundAmount: 10_000, depositAmount: 10_000 },
    ).ok,
    true,
  )
})

test('deposit confirmation re-reads the exact deposit and leaves uncertain settlement for reconciliation', () => {
  const confirmRoute = readSource('app/api/payments/deposit/confirm/route.ts')

  assert.match(confirmRoute, /recoverDepositAfterFinalizationFailure/)
  assert.match(confirmRoute, /\.eq\('id', params\.deposit\.id\)/)
  assert.match(confirmRoute, /\.eq\('match_id', params\.matchId\)/)
  assert.match(confirmRoute, /\.eq\('group_id', params\.groupId\)/)
  assert.match(confirmRoute, /\.eq\('user_id', params\.userId\)/)
  assert.match(confirmRoute, /\.eq\('toss_order_id', params\.payment\.orderId\)/)
  assert.match(confirmRoute, /recoveredDeposit\.toss_payment_key === params\.payment\.paymentKey/)
  assert.match(confirmRoute, /payment_reconciliation_required/)
  assert.doesNotMatch(confirmRoute, /cancelTossPayment/)
  assert.doesNotMatch(
    confirmRoute,
    /catch\s*\{[\s\S]*?\.update\(\{[\s\S]*?toss_payment_key:[\s\S]*?payment_reconciliation_required/,
  )
})

test('partial cancellation webhook recovers the matching pending refund request through its finalizer', () => {
  const webhookRoute = readSource('app/api/payments/deposit/webhook/route.ts')

  assert.match(webhookRoute, /deposit_refund_requests/)
  assert.match(webhookRoute, /verifyTossPartialRefundEvidence/)
  assert.match(webhookRoute, /buildTossRefundRequestKey/)
  assert.match(webhookRoute, /\.rpc\('finalize_refund_request'/)
  assert.match(webhookRoute, /p_refund_request_id: refundRequest\.id/)
  assert.match(webhookRoute, /p_settlement_version: refundRequest\.settlement_version/)
  assert.match(webhookRoute, /p_settlement_key: evidence\.transactionKey/)
  assert.match(webhookRoute, /p_provider_request_key: requestKey/)
  assert.match(webhookRoute, /refundRequest\.status === 'processed'/)
  assert.match(webhookRoute, /refundRequest\.settlement_key === evidence\.transactionKey/)
  assert.match(webhookRoute, /refundRequest\.provider_request_key === requestKey/)
  assert.doesNotMatch(
    webhookRoute,
    /if \(reconcileAction === 'partial_cancellation'\) \{\s*throw new WebhookReconcileError/,
  )
})

test('refund route verifies current Toss state before issuing a new cancellation', () => {
  const refundRoute = readSource('app/api/matches/[id]/refund/route.ts')

  assert.match(refundRoute, /const currentPayment = await getTossPayment\(paymentKey\)/)
  assert.match(refundRoute, /buildVerifiedTossSettlement/)
  assert.match(refundRoute, /verifyTossRefundEvidence/)
  assert.match(refundRoute, /currentPayment\.status !== 'DONE'/)
  assert.match(refundRoute, /provider_settlement_requires_reconciliation/)
  assert.ok(
    refundRoute.indexOf('await getTossPayment(paymentKey)')
      < refundRoute.indexOf('await cancelTossPayment'),
    'provider state must be inspected before a new cancellation is requested',
  )
})

test('internal Toss cancellation resolves the owned deposit before calling the provider', () => {
  const cancelRoute = readSource('app/api/payments/deposit/cancel/route.ts')

  assert.match(cancelRoute, /deposit_id_required/)
  assert.match(cancelRoute, /match_id_required/)
  assert.match(cancelRoute, /group_id_required/)
  assert.match(cancelRoute, /user_id_required/)
  assert.match(cancelRoute, /\.from\('deposits'\)/)
  assert.match(cancelRoute, /\.eq\('id', depositId\)/)
  assert.match(cancelRoute, /deposit\.toss_payment_key !== paymentKey/)
  assert.match(cancelRoute, /deposit\.match_id !== matchId/)
  assert.match(cancelRoute, /deposit\.group_id !== groupId/)
  assert.match(cancelRoute, /deposit\.user_id !== userId/)
  assert.match(cancelRoute, /partial_cancellation_not_supported/)
  assert.match(cancelRoute, /partial_cancellation_requires_reconciliation/)
  assert.match(cancelRoute, /payment\.status !== 'CANCELED'/)
  assert.match(cancelRoute, /refunded_amount: deposit\.amount/)
  assert.match(cancelRoute, /retained_amount: 0/)
  assert.ok(
    cancelRoute.indexOf(".from('deposits')") < cancelRoute.indexOf('await cancelTossPayment'),
    'the owned deposit must be loaded before Toss cancellation',
  )
  assert.ok(
    cancelRoute.indexOf('await cancelTossPayment') < cancelRoute.indexOf(".update({\n        status: 'refunded'"),
    'the deposit must be marked refunded only after Toss proves a full cancellation',
  )
})
