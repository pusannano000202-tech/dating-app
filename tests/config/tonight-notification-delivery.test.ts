import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

test('Tonight notification worker uses the shared timing-safe internal guard', () => {
  const route = readSource('app/api/internal/tonight/notifications/dispatch/route.ts')

  assert.match(route, /isAuthorizedInternalRequest/)
  assert.match(route, /process\.env\.CRON_SECRET/)
  assert.match(route, /enqueue_due_tonight_notifications/)
  assert.match(route, /claim_tonight_notification_outbox/)
  assert.match(route, /complete_tonight_notification_outbox_batch/)
  assert.match(route, /fail_tonight_notification_outbox/)
  assert.match(route, /claim_tonight_push_deliveries/)
  assert.match(route, /complete_tonight_push_delivery/)
})

test('Tonight worker can drain a 10K in-app fanout inside the short deadline window', () => {
  const route = readSource('app/api/internal/tonight/notifications/dispatch/route.ts')
  const migration = readSource('supabase/migrations/20260903012223_tonight_notification_outbox.sql')

  assert.match(route, /OUTBOX_BATCH_SIZE = 1_000/)
  assert.match(route, /MAX_OUTBOX_BATCHES = 10/)
  assert.match(route, /PUSH_CONCURRENCY = 100/)
  assert.match(route, /WORKER_TIME_BUDGET_MS = 50_000/)
  assert.match(route, /for \(let batchIndex = 0; batchIndex < MAX_OUTBOX_BATCHES/)
  assert.match(route, /completed\.data === outboxRows\.length/)
  assert.match(route, /for \(let index = 0; index < deliveries\.length; index \+= PUSH_CONCURRENCY/)

  const integerConstant = (name: string) => {
    const value = route.match(new RegExp(`const ${name} = ([\\d_]+)`))?.[1]
    assert.ok(value, `${name} must be declared as a static integer`)
    return Number(value.replaceAll('_', ''))
  }
  const outboxClaimCap = Number(
    migration.match(/claim_tonight_notification_outbox[\s\S]*?least\(COALESCE\(p_limit, 100\), (\d+)\)/i)?.[1],
  )
  const pushClaimCap = Number(
    migration.match(/claim_tonight_push_deliveries[\s\S]*?least\(COALESCE\(p_limit, 50\), (\d+)\)/i)?.[1],
  )

  assert.ok(Number.isFinite(outboxClaimCap), 'outbox claim cap must be present in SQL')
  assert.ok(Number.isFinite(pushClaimCap), 'push claim cap must be present in SQL')
  assert.ok(outboxClaimCap * integerConstant('MAX_OUTBOX_BATCHES') >= 10_000)
  assert.ok(pushClaimCap * integerConstant('MAX_PUSH_BATCHES') >= 10_000)
})

test('Tonight push APIs use Tonight-specific RPCs and never reuse Campus Seven consent', () => {
  const config = readSource('app/api/tonight/notifications/push/config/route.ts')
  const subscriptions = readSource('app/api/tonight/notifications/push/subscriptions/route.ts')

  assert.match(config, /get_my_tonight_push_readiness/)
  assert.match(subscriptions, /upsert_my_tonight_push_subscription/)
  assert.match(subscriptions, /delete_my_tonight_push_subscription/)
  assert.doesNotMatch(`${config}\n${subscriptions}`, /campus.seven/i)
})

test('Tonight client notification code cannot import the Node-only web-push bundle', () => {
  const control = readSource('components/tonight/TonightNotificationControl.tsx')
  const contract = readSource('lib/notifications/tonight-contract.ts')
  assert.ok(fs.existsSync(path.join(process.cwd(), 'lib/notifications/tonight-web-push.server.ts')))
  const serverSender = readSource('lib/notifications/tonight-web-push.server.ts')

  assert.doesNotMatch(`${control}\n${contract}`, /from ['"].*tonight-web-push|from ['"]web-push/)
  assert.doesNotMatch(contract, /process\.env/)
  assert.match(serverSender, /import 'server-only'/)
  assert.match(serverSender, /from 'web-push'/)
})

test('Tonight push subscription mutations require live user or partner access and JSON-only bodies', () => {
  const subscriptions = readSource('app/api/tonight/notifications/push/subscriptions/route.ts')

  assert.match(subscriptions, /requireRequestAccess\(/)
  assert.match(subscriptions, /allowedRoles:\s*\['user', 'partner'\]/)
  assert.match(subscriptions, /createSupabaseRequestClient\(request\)/)
  assert.match(subscriptions, /content-type/)
  assert.match(subscriptions, /application\\\/json/)
  assert.match(subscriptions, /isAllowedTonightPushEndpoint\(body\.endpoint\)/)
  assert.match(subscriptions, /tonight_push_subscription_limit_reached/)
  assert.ok(
    subscriptions.indexOf('requireRequestAccess(request') < subscriptions.indexOf('readBody(request)'),
    'trusted-Origin and role checks must run before a text/plain body can be parsed',
  )
})

test('Tonight participant and partner screens offer explicit push choice and visibility refresh', () => {
  const control = readSource('components/tonight/TonightNotificationControl.tsx')
  const user = readSource('components/tonight/UserTonightExperience.tsx')
  const partner = readSource('components/tonight/PartnerTonightConsole.tsx')

  assert.match(user, /TonightNotificationControl/)
  assert.match(user, /mode === 'live' && application/)
  assert.match(user, /if \(!silent\) setLoadError/)
  assert.match(partner, /TonightNotificationControl/)
  assert.match(control, /알림 켜기/)
  assert.match(control, /명시적으로 켠 이 기기에서만/)
  assert.match(control, /visibilitychange/)
  assert.match(control, /window\.setInterval/)
  assert.match(control, /onRefresh/)
})

test('in-app Tonight notifications open the Tonight journey with stage-specific copy', () => {
  const notifications = readSource('app/notifications/page.tsx')

  assert.match(notifications, /kind === 'tonight_journey'/)
  assert.match(notifications, /allocation_published/)
  assert.match(notifications, /deposit_due/)
  assert.match(notifications, /partner_acceptance_due/)
  assert.match(notifications, /venue_revealed/)
  assert.match(notifications, /arrival_due/)
  assert.match(notifications, /push_resubscribe_required: '이 기기의 오늘밤 알림을 다시 켜주세요'/)
  assert.match(notifications, /브라우저 푸시 연결이 만료됐어요/)
  assert.match(notifications, /payload\.audience === 'partner'/)
  assert.match(notifications, /'\/partner\/tonight'/)
  assert.match(notifications, /'\/tonight'/)
})

test('Web Push clicks preserve participant and partner destinations without allowing redirects', () => {
  const worker = readSource('public/tonight-sw.js')

  assert.match(worker, /new Set\(\['\/tonight', '\/partner\/tonight'\]\)/)
  assert.match(worker, /safeTonightUrl\(payload\.url\)/)
  assert.match(worker, /safeTonightUrl\(event\.notification\?\.data\?\.url\)/)
  assert.match(worker, /client\.navigate\(targetUrl\)/)
  assert.match(worker, /openWindow\(targetUrl\)/)
  assert.doesNotMatch(worker, /new URL\(.*payload\.url/)
})

test('Vercel schedules the Tonight notification worker every minute', () => {
  const vercel = JSON.parse(readSource('vercel.json')) as {
    crons?: Array<{ path: string; schedule: string }>
  }
  assert.ok(vercel.crons?.some((cron) => (
    cron.path === '/api/internal/tonight/notifications/dispatch'
    && cron.schedule === '* * * * *'
  )))
})

test('Tonight Web Push remains separately disabled in both environment templates', () => {
  for (const relativePath of ['.env.example', '.env.local.example']) {
    const env = readSource(relativePath)
    assert.match(env, /^TONIGHT_NOTIFICATIONS_ENABLED=false$/m, `${relativePath} needs the Tonight-only gate`)
  }
})
