import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260903012223_tonight_notification_outbox.sql',
)

function readMigration() {
  return fs.readFileSync(migrationPath, 'utf8')
}

test('Tonight uses a separate durable outbox and explicit push consent', () => {
  const sql = readMigration()

  assert.match(sql, /CREATE TABLE public\.tonight_notification_outbox/i)
  assert.match(sql, /CREATE TABLE public\.tonight_push_subscriptions/i)
  assert.match(sql, /CREATE TABLE public\.tonight_push_deliveries/i)
  assert.match(sql, /UNIQUE\s*\(recipient_user_id, event_key\)/i)
  assert.match(sql, /consented_at TIMESTAMPTZ NOT NULL/i)
  assert.match(sql, /upsert_my_tonight_push_subscription/i)
  assert.doesNotMatch(sql, /upsert_my_campus_seven_push_subscription/i)
})

test('Tonight outbox covers every short deadline with privacy-minimized payloads', () => {
  const sql = readMigration()

  for (const eventType of [
    'allocation_published',
    'deposit_due',
    'partner_acceptance_due',
    'venue_revealed',
    'arrival_due',
  ]) {
    assert.match(sql, new RegExp(`'${eventType}'`))
  }

  assert.match(sql, /jsonb_build_object\([\s\S]*?'round_id'[\s\S]*?'event_type'/i)
  const payloadStart = sql.indexOf('pg_catalog.jsonb_build_object(', sql.indexOf('complete_tonight_notification_outbox'))
  const payloadEnd = sql.indexOf('ON CONFLICT DO NOTHING', payloadStart)
  assert.ok(payloadStart > 0 && payloadEnd > payloadStart)
  assert.doesNotMatch(sql.slice(payloadStart, payloadEnd), /'address'|'phone'|'display_name'|'department'|'venue_name'/i)
  assert.match(sql, /'venue_revealed'::TEXT[\s\S]*?team\.status IN \('accepted', 'revealed', 'in_progress', 'completed'\)/i)
})

test('Tonight catch-up never fans out stale notifications for terminal or expired rounds', () => {
  const sql = readMigration()
  const enqueueStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.enqueue_due_tonight_notifications')
  const enqueueEnd = sql.indexOf('CREATE OR REPLACE FUNCTION public.claim_tonight_notification_outbox', enqueueStart)
  const enqueue = sql.slice(enqueueStart, enqueueEnd)

  assert.match(enqueue, /round_row\.status NOT IN \('completed', 'cancelled'\)/)
  assert.match(enqueue, /round_row\.allocation_publish_at <= p_now[\s\S]{0,240}p_now < round_row\.deposit_due_at/)
  assert.match(enqueue, /round_row\.reveal_at <= p_now[\s\S]{0,240}p_now <= round_row\.starts_at/)
  assert.ok(
    (enqueue.match(/round_row\.status NOT IN \('completed', 'cancelled'\)/g) ?? []).length >= 5,
    'every stage query must reject terminal rounds',
  )
})

test('Tonight delivery claims leases and retries idempotently', () => {
  const sql = readMigration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.enqueue_due_tonight_notifications/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.claim_tonight_notification_outbox/i)
  assert.match(sql, /FOR UPDATE SKIP LOCKED/i)
  assert.match(sql, /attempt_count = outbox\.attempt_count \+ 1/i)
  assert.match(sql, /locked_at < p_now - INTERVAL '5 minutes'/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.complete_tonight_notification_outbox/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.complete_tonight_notification_outbox_batch/i)
  assert.match(sql, /p_outbox_ids UUID\[\]/i)
  assert.match(sql, /pg_catalog\.cardinality\(p_outbox_ids\) > 1000/i)
  assert.match(sql, /INSERT INTO public\.notifications/i)
  assert.match(sql, /INSERT INTO public\.tonight_push_deliveries/i)
  assert.match(sql, /ON CONFLICT DO NOTHING/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fail_tonight_notification_outbox/i)
  assert.match(sql, /INTERVAL '1 minute' \* LEAST/i)
  assert.match(sql, /notification\.payload ->> 'audience'/i)
})

test('Tonight push registration is bounded per caller under a database lock', () => {
  const sql = readMigration()

  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /revoked_at IS NULL[\s\S]*?>= 5/)
  assert.match(sql, /tonight_push_subscription_limit_reached/)
  assert.match(sql, /fcm\\\.googleapis\\\.com/)
  assert.match(sql, /updates\\\.push\\\.services\\\.mozilla\\\.com/)
  assert.match(sql, /web\\\.push\\\.apple\\\.com/)
  assert.match(sql, /notify\\\.windows\\\.com/)
})

test('Tonight notification tables are RLS protected and service RPCs are private', () => {
  const sql = readMigration()

  for (const table of [
    'tonight_notification_outbox',
    'tonight_push_subscriptions',
    'tonight_push_deliveries',
  ]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table}[\\s\\S]{0,100}PUBLIC, anon, authenticated`, 'i'))
  }

  for (const fn of [
    'enqueue_due_tonight_notifications',
    'claim_tonight_notification_outbox',
    'complete_tonight_notification_outbox',
    'complete_tonight_notification_outbox_batch',
    'fail_tonight_notification_outbox',
    'claim_tonight_push_deliveries',
    'complete_tonight_push_delivery',
  ]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}`))
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[\\s\\S]{0,140}TO service_role`))
  }
})
