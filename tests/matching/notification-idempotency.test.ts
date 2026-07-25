import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { syncDailyCardsThenLoadNotifications } from '../../lib/notifications/load-notifications'

const ROOT = process.cwd()

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

test('notification reads stay side-effect free', () => {
  const notificationApi = readSource('app/api/notifications/route.ts')

  assert.match(notificationApi, /export async function GET/)
  assert.match(notificationApi, /get_my_notifications/)
  assert.doesNotMatch(notificationApi, /notify_available_daily_cards/)
  assert.match(notificationApi, /notification_lookup_failed/)
  assert.match(notificationApi, /status: 500/)
  assert.doesNotMatch(notificationApi, /error\.message/)
})

test('daily card notification sync uses an explicit authenticated POST route', () => {
  const syncApi = readSource('app/api/notifications/sync-daily-cards/route.ts')

  assert.match(syncApi, /export async function POST/)
  assert.match(syncApi, /supabase\.auth\.getUser\(\)/)
  assert.match(syncApi, /status: 401/)
  assert.match(syncApi, /notify_available_daily_cards/)
  assert.match(syncApi, /daily_card_notification_sync_failed/)
})

test('notifications page uses the sync-then-read helper', () => {
  const notificationsPage = readSource('app/notifications/page.tsx')
  assert.match(notificationsPage, /syncDailyCardsThenLoadNotifications\(fetch\)/)
})

test('a failed daily card sync response does not block notification reads', async () => {
  const calls: Array<{ input: string; method?: string }> = []
  const readResponse = {
    ok: true,
    status: 200,
    async json() {
      return { notifications: [] }
    },
  }

  const result = await syncDailyCardsThenLoadNotifications(async (input, init) => {
    calls.push({ input, method: init?.method })
    if (calls.length === 1) {
      return { ok: false, status: 500, async json() { return {} } }
    }
    return readResponse
  })

  assert.deepEqual(calls, [
    { input: '/api/notifications/sync-daily-cards', method: 'POST' },
    { input: '/api/notifications?limit=100', method: undefined },
  ])
  assert.equal(result, readResponse)
})

test('daily card notification migration enforces database-level idempotency', () => {
  const migration = readSource('supabase/migrations/20260715150637_harden_daily_card_notification_idempotency.sql')

  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS notifications_daily_card_available_unique_idx[\s\S]*?ON public\.notifications \(\s*user_id,\s*kind,\s*\(payload ->> 'match_id'\),\s*\(payload ->> 'day_offset'\)\s*\)\s*WHERE kind = 'daily_card_available'/,
  )
  assert.match(migration, /LOCK TABLE public\.notifications IN SHARE ROW EXCLUSIVE MODE/)
  assert.match(migration, /notifications_daily_card_payload_check/)
  assert.match(migration, /NULLIF\(payload ->> 'match_id', ''\) IS NOT NULL/)
  assert.match(migration, /NULLIF\(payload ->> 'day_offset', ''\) IS NOT NULL/)
  assert.match(migration, /ORDER BY \(read_at IS NULL\) DESC,\s*created_at DESC,\s*id DESC/)
  assert.match(migration, /SET search_path = ''/)
  assert.match(migration, /v_user_id UUID := auth\.uid\(\)/)
  assert.match(migration, /gm\.user_id = v_user_id/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.notify_available_daily_cards\(UUID\) FROM PUBLIC/)
  assert.match(migration, /ON CONFLICT DO NOTHING/)
  assert.doesNotMatch(migration, /WHERE NOT EXISTS/)
})
