import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n')
}

test('today source registration derives and locks the exact completed attendance snapshot', () => {
  const sql = source('supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql')
  const match = sql.match(
    /create or replace function public\.register_my_tonight_continuation_source\(([\s\S]*?)\n\$\$;/i,
  )
  assert.ok(match, 'authenticated tonight source registration RPC must exist')
  const rpc = match[0]

  assert.match(rpc, /p_team_id uuid[\s\S]*p_idempotency_key uuid/i)
  assert.doesNotMatch(rpc, /p_(?:activity|roster|attendance|member)/i)
  assert.match(rpc, /auth\.uid\(\)/i)
  assert.match(rpc, /from public\.tonight_teams[\s\S]*for update/i)
  assert.match(rpc, /status <> 'completed'/i)
  assert.match(rpc, /from public\.tonight_team_members/i)
  assert.match(rpc, /from public\.tonight_attendance/i)
  assert.match(rpc, /status = 'pending'/i)
  assert.match(rpc, /from public\.tonight_partner_service_confirmations/i)
  assert.match(rpc, /confirmed_attendee_count <> v_arrived_count/i)
  assert.match(rpc, /observed_arrived_count <> v_arrived_count/i)
  assert.match(rpc, /for (?:no key )?update/i)
  assert.match(rpc, /source_id/i)
})

test('today source POST accepts only team identity and idempotency and delegates snapshot truth to RPC', () => {
  const route = source('app/api/match/series/source-from-tonight/route.ts')
  assert.match(route, /assertTrustedMutationOrigin/)
  assert.match(route, /readStrictJson\(request, \['team_id', 'idempotency_key'\]\)/)
  assert.match(route, /register_my_tonight_continuation_source/)
  assert.doesNotMatch(route, /activity_snapshot|roster_revision|attendance_revision/)
  assert.match(route, /Cache-Control[\s\S]*private, no-store/)
})

test('scheduled source registration derives a completed occurrence and resolved attendance snapshot', () => {
  const sql = source('supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql')
  const match = sql.match(
    /create or replace function public\.register_my_scheduled_continuation_source\(([\s\S]*?)\n\$\$;/i,
  )
  assert.ok(match, 'authenticated scheduled source registration RPC must exist')
  const rpc = match[0]

  assert.match(rpc, /p_occurrence_id uuid[\s\S]*p_idempotency_key uuid/i)
  assert.doesNotMatch(rpc, /p_(?:activity|roster|attendance|member)/i)
  assert.match(rpc, /from public\.quantum_event_occurrences[\s\S]*for update/i)
  assert.match(rpc, /status <> 'completed'/i)
  assert.match(rpc, /from public\.quantum_event_match_members/i)
  assert.match(rpc, /from public\.quantum_weekly_attendance_resolutions/i)
  assert.match(rpc, /attendance_status in \('disputed'/i)
  assert.match(rpc, /source_id/i)
})

test('weekly attendance resolution is privileged, revision checked, idempotent, and audited', () => {
  const sql = source('supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql')
  assert.match(sql, /create table public\.quantum_weekly_attendance_audit/i)
  const match = sql.match(
    /create or replace function public\.resolve_weekly_attendance_for_service\(([\s\S]*?)\n\$\$;/i,
  )
  assert.ok(match, 'weekly attendance resolver must exist')
  const rpc = match[0]
  assert.match(rpc, /request\.jwt\.claim\.role/i)
  assert.match(rpc, /p_expected_attendance_revision integer/i)
  assert.match(rpc, /p_resolution_id uuid/i)
  assert.match(rpc, /for update/i)
  assert.match(rpc, /insert into public\.quantum_weekly_attendance_audit/i)
})
