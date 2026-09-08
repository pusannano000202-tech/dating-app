import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260811180914_quantum_event_lifecycle_and_chat_window.sql',
)
const hardeningMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260811203000_quantum_event_lifecycle_hardening.sql',
)

test('event lifecycle migration creates server-owned occurrences and private participant state', () => {
  assert.ok(fs.existsSync(migrationPath), 'event lifecycle migration must exist')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /create table if not exists public\.quantum_event_occurrences/i)
  assert.match(sql, /unique\s*\(event_id,\s*starts_at\)/i)
  assert.match(sql, /application_closes_at/i)
  assert.match(sql, /alter table public\.quantum_event_participations[\s\S]*occurrence_id/i)
  assert.match(sql, /status[\s\S]*recruiting[\s\S]*confirmed[\s\S]*cancelled[\s\S]*completed/i)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all on table public\.quantum_event_occurrences from public, anon, authenticated/i)
})

test('event applications bind to one occurrence at least two hours ahead', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /Asia\/Seoul/i)
  assert.match(sql, /interval '2 hours'/i)
  assert.match(sql, /get_or_create_quantum_event_occurrence/i)
  assert.match(sql, /date_part\('dow',\s*v_local_now\)/i)
  assert.doesNotMatch(sql, /pg_catalog\.extract\s*\(/i)
  assert.match(sql, /on conflict \(event_id, starts_at\)/i)
  assert.match(sql, /set_my_quantum_event_participation/i)
  assert.match(sql, /occurrence_id\s*=\s*excluded\.occurrence_id/i)
})

test('lifecycle read RPC returns counts, friends, schedule, match, and server time without raw private data', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /get_my_quantum_event_lifecycle/i)
  for (const field of [
    'occurrence_id',
    'starts_at',
    'ends_at',
    'chat_opens_at',
    'server_now',
    'participant_counts',
    'party_members',
    'match_id',
    'cancel_reason',
    'review_required',
  ]) assert.match(sql, new RegExp(`'${field}'`))
  assert.doesNotMatch(sql, /appearance_score_raw/i)
  assert.match(sql, /revoke all on function public\.get_my_quantum_event_lifecycle\(\) from public, anon/i)
  assert.match(sql, /grant execute on function public\.get_my_quantum_event_lifecycle\(\) to authenticated/i)
})

test('chat RPCs reject reads and writes until twenty minutes before the server schedule', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /get_my_match_chat_window/i)
  assert.match(sql, /scheduled_start\s*-\s*interval '20 minutes'/i)
  assert.match(sql, /chat_not_open/i)
  assert.match(sql, /create or replace function public\.get_match_chat_messages/i)
  assert.match(sql, /create or replace function public\.send_match_chat_message/i)
  assert.match(sql, /set search_path = ''/i)
  assert.match(sql, /revoke all on function public\.get_my_match_chat_window\(uuid\) from public, anon/i)
})

test('hardening migration makes capacity, terminal states, and chat gates server-owned', () => {
  assert.ok(fs.existsSync(hardeningMigrationPath), 'hardening migration must exist')
  const sql = fs.readFileSync(hardeningMigrationPath, 'utf8')

  assert.match(sql, /for update/i)
  assert.match(sql, /application_closed/i)
  assert.match(sql, /event_full/i)
  assert.match(sql, /gender_capacity_full/i)
  assert.match(sql, /event_state_locked/i)
  assert.match(sql, /status = 'cancelled'/i)
  assert.doesNotMatch(sql, /delete from public\.quantum_event_participations/i)
  assert.match(sql, /revoke select, insert, update, delete[\s\S]*match_chat_messages[\s\S]*authenticated/i)
  assert.match(sql, /meeting\.status = 'scheduled'/i)
})
