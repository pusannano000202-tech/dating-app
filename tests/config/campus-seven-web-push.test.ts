import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getCampusSevenGuideCueSchedule } from '../../lib/campus-seven/live-guide'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

function loadMigration(): string {
  const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
    .filter((name) => name.endsWith('_campus_seven_timed_web_push.sql'))
  assert.equal(migrations.length, 1, 'exactly one timed web-push migration is required')
  return read(`supabase/migrations/${migrations[0]}`)
}

test('campus seven timed notifications are disabled by default and idempotent', () => {
  const migration = loadMigration()

  assert.match(migration, /ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE/)
  assert.match(migration, /'campus_seven_guide'/)
  assert.match(migration, /notifications_campus_seven_guide_payload_check/)
  assert.match(migration, /NULLIF\(payload ->> 'cohort_id', ''\) IS NOT NULL/)
  assert.match(migration, /NULLIF\(payload ->> 'cue_key', ''\) IS NOT NULL/)
  assert.match(migration, /notifications_campus_seven_guide_unique_idx/)
  assert.match(migration, /\(payload ->> 'cohort_id'\)/)
  assert.match(migration, /\(payload ->> 'day_number'\)/)
  assert.match(migration, /\(payload ->> 'cue_key'\)/)
  assert.match(migration, /ON CONFLICT DO NOTHING/)
})

test('the server cue table matches all 38 live guide moments', () => {
  const migration = loadMigration()
  const cueRows = [...migration.matchAll(
    /\(\s*([1-7]),\s*'([a-z0-9-]+)',\s*(-?\d+),\s*'(?:notice|action|reveal|closing)'/g,
  )].map((match) => ({
    dayNumber: Number(match[1]),
    key: match[2],
    offsetMinutes: Number(match[3]),
  }))

  assert.equal(cueRows.length, 38)
  assert.deepEqual(cueRows, getCampusSevenGuideCueSchedule())
  assert.match(migration, /\(1, 'arrival', -20, 'notice'/)
  assert.match(migration, /\(4, 'rank', 155, 'closing'/)
  assert.match(migration, /\(6, 'date-choice-open', -420, 'action'/)
  assert.match(migration, /\(7, 'final', 240, 'closing'/)
})

test('dispatch selects only due cues for active joined participants', () => {
  const migration = loadMigration()

  assert.match(migration, /dispatch_due_campus_seven_notifications/)
  assert.match(migration, /SET search_path = ''/)
  assert.match(migration, /settings\.notifications_enabled = TRUE/)
  assert.match(migration, /cohort\.status IN \('ready', 'running'\)/)
  assert.match(migration, /enrollment\.status = 'active'/)
  assert.match(migration, /enrollment\.joined_day <= cue\.day_number/)
  assert.match(migration, /cue\.scheduled_at <= p_now/)
  assert.match(migration, /cue\.scheduled_at > p_now - INTERVAL '10 minutes'/)
  assert.match(migration, /set_config\('app\.campus_seven_notification_dispatch', 'on', TRUE\)/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.dispatch_due_campus_seven_notifications\(TIMESTAMPTZ\) FROM authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.dispatch_due_campus_seven_notifications\(TIMESTAMPTZ\) TO service_role/)
})

test('push subscriptions and delivery outbox are private and bounded', () => {
  const migration = loadMigration()

  assert.match(migration, /CREATE TABLE public\.campus_seven_push_subscriptions/)
  assert.match(migration, /CREATE TABLE public\.campus_seven_push_deliveries/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON public\.campus_seven_push_subscriptions FROM anon, authenticated/)
  assert.match(migration, /REVOKE ALL ON public\.campus_seven_push_deliveries FROM anon, authenticated/)
  assert.match(migration, /REVOKE ALL ON public\.notifications FROM anon, authenticated/)
  assert.match(migration, /upsert_my_campus_seven_push_subscription/)
  assert.match(migration, /active_enrollment_required/)
  assert.match(migration, /delete_my_campus_seven_push_subscription/)
  assert.match(migration, /FOR UPDATE OF delivery SKIP LOCKED/)
  assert.match(migration, /attempt_count < 3/)
  assert.match(migration, /INTERVAL '5 minutes'/)
  assert.match(migration, /status = 'safety_withdrawn'/)
  assert.match(migration, /revoked_at = NOW\(\)/)
  assert.match(migration, /claim_campus_seven_web_push_deliveries[\s\S]*settings\.notifications_enabled/)
})

test('Supabase Cron stores detailed in-app alerts and calls push through Vault', () => {
  const migration = loadMigration()

  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_cron/)
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_net/)
  assert.match(migration, /cron\.schedule/)
  assert.match(migration, /campus-seven-guide-notifications/)
  assert.match(migration, /campus-seven-web-push-deliveries/)
  assert.match(migration, /vault\.decrypted_secrets/)
  assert.match(migration, /campus_seven_web_push_url/)
  assert.match(migration, /campus_seven_web_push_secret/)
  assert.match(migration, /net\.http_post/)
})

test('push APIs require authenticated enrollment or a protected cron token', () => {
  const configRoute = read('app/api/campus-seven/push/config/route.ts')
  const subscriptionsRoute = read('app/api/campus-seven/push/subscriptions/route.ts')
  const cronRoute = read('app/api/cron/campus-seven-web-push/route.ts')
  const sender = read('lib/campus-seven/web-push.ts')

  assert.match(configRoute, /supabase\.auth\.getUser\(\)/)
  assert.match(subscriptionsRoute, /supabase\.auth\.getUser\(\)/)
  assert.match(subscriptionsRoute, /upsert_my_campus_seven_push_subscription/)
  assert.match(subscriptionsRoute, /delete_my_campus_seven_push_subscription/)
  assert.match(sender, /CAMPUS_SEVEN_PUSH_CRON_SECRET/)
  assert.match(cronRoute, /config\.cronSecret/)
  assert.match(sender, /timingSafeEqual/)
  assert.match(sender, /새 안내가 도착했어요\. 앱에서 확인해 주세요\./)
  assert.match(sender, /topic: delivery\.notification_id\.replace\(\/\-\/g, ''\)\.slice\(0, 32\)/)
  assert.doesNotMatch(cronRoute, /venue|meetingPoint|department|alias/i)
  assert.match(sender, /statusCode === 404 \|\| statusCode === 410/)
  assert.match(cronRoute, /claim_campus_seven_web_push_deliveries/)
  assert.match(cronRoute, /complete_campus_seven_web_push_delivery/)
})

test('participant permission UI registers a privacy-minimized service worker', () => {
  const control = read('components/matching/campus-seven/CampusSevenPushControl.tsx')
  const experience = read('components/matching/campus-seven/CampusSevenExperience.tsx')
  const worker = read('public/campus-seven-sw.js')
  const env = read('.env.example')

  assert.match(control, /Notification\.requestPermission\(\)/)
  assert.match(control, /navigator\.serviceWorker\.register\('\/campus-seven-sw\.js'\)/)
  assert.match(control, /pushManager\.subscribe/)
  assert.match(control, /syncSubscription\(subscription\)/)
  assert.match(control, /if \(!synced\) await subscription\.unsubscribe\(\)/)
  assert.match(control, /\/api\/campus-seven\/push\/subscriptions/)
  assert.match(control, /구독 해제/)
  assert.match(experience, /CampusSevenPushControl/)
  assert.match(worker, /self\.addEventListener\('push'/)
  assert.match(worker, /새 안내가 도착했어요\. 앱에서 확인해 주세요\./)
  assert.match(worker, /\/match\/campus-seven/)
  assert.doesNotMatch(worker, /event\.data\.json\(\)[\s\S]*body/)
  assert.doesNotMatch(worker, /\/icon-192\.png/)
  assert.match(env, /CAMPUS_SEVEN_NOTIFICATIONS_ENABLED=false/)
  assert.match(env, /WEB_PUSH_VAPID_PUBLIC_KEY=/)
  assert.match(env, /WEB_PUSH_VAPID_PRIVATE_KEY=/)
})

test('campus seven notifications open the live screen and keep details in-app', () => {
  const page = read('app/notifications/page.tsx')

  assert.match(page, /campus_seven_guide/)
  assert.match(page, /payload\.title/)
  assert.match(page, /payload\.body/)
  assert.match(page, /\/match\/campus-seven/)
})
