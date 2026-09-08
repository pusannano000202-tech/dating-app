import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260905120000_integrated_continuation_and_weekly.sql')
const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')

test('integrated migration separates weekly candidates, canonical sources, program day, and physical meeting number', () => {
  assert.ok(fs.existsSync(migrationPath), 'integrated continuation migration must exist')
  const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')

  assert.match(sql, /create table public\.quantum_weekly_applications/i)
  assert.match(sql, /create table public\.quantum_weekly_application_candidates/i)
  assert.match(sql, /create table public\.quantum_continuation_sources/i)
  assert.match(sql, /source_kind in \('tonight_team', 'scheduled_event_occurrence'\)/i)
  assert.match(sql, /num_nonnulls\(tonight_team_id, scheduled_event_occurrence_id\) = 1/i)
  assert.match(sql, /program_day smallint not null check \(program_day between 1 and 5\)/i)
  assert.match(sql, /physical_meeting_no smallint not null check \(physical_meeting_no between 2 and 6\)/i)
  assert.match(sql, /transition_index smallint not null check \(transition_index between 0 and 4\)/i)
  assert.doesNotMatch(sql, /board_game_direct/i)
})

test('integrated migration exposes narrow private-consent, verified-payment, chat, and idempotent command RPCs', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
  for (const rpc of [
    'apply_to_my_weekly_activity',
    'open_continuation_transition',
    'set_my_continuation_choice',
    'prepare_my_continuation_fee',
    'confirm_my_continuation_fee_for_service',
    'get_my_integrated_continuation_series',
    'send_my_continuation_chat_message',
  ]) assert.match(sql, new RegExp(`create or replace function public\\.${rpc}`, 'i'))

  assert.match(sql, /'locked'[\s\S]*'send'[\s\S]*'read_only'[\s\S]*'hidden'/i)
  assert.match(sql, /set search_path = ''/i)
  assert.match(sql, /revoke all on function/i)
  assert.match(sql, /idempotency_key/i)
  assert.match(sql, /provider_verified/i)
})

test('Day 2 scheduling covers three thirty-minute rounds and Day 5 requires operational fallback details', () => {
  const match = sql.match(/create or replace function public\.schedule_continuation_occurrence_for_service\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  const rpc = match[0]
  assert.match(rpc, /target_program_day = 2[\s\S]*interval '120 minutes'/i)
  assert.match(rpc, /target_program_day = 5[\s\S]*route_summary/i)
  assert.match(rpc, /weather_fallback/i)
  assert.match(rpc, /return_guidance/i)
})

test('Day actions enforce persisted sequence state instead of allowing a direct finish', () => {
  const match = sql.match(/create or replace function public\.apply_my_continuation_content_action\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  const rpc = match[0]
  assert.match(rpc, /selected_game/i)
  assert.match(rpc, /conversation_round/i)
  assert.match(rpc, /practice_scores/i)
  assert.match(rpc, /drawn_card_count/i)
  assert.match(rpc, /route_confirmed/i)
  assert.match(rpc, /content_sequence_not_ready/i)

  const replayLookup = rpc.indexOf('where command.actor_user_id = v_actor and command.idempotency_key = p_idempotency_key')
  const liveStateGate = rpc.indexOf("if v_occurrence.status not in ('confirmed', 'in_progress')")
  assert.ok(replayLookup >= 0 && replayLookup < liveStateGate, 'an exact replay must survive the state change caused by its first execution')
})

test('weekly application rechecks the canonical matching readiness gate', () => {
  const match = sql.match(/create or replace function public\.apply_to_my_weekly_activity\(([\s\S]*?)\n\$\$;/i)
  assert.ok(match)
  assert.match(match[0], /public\.is_profile_matching_ready\(v_actor\)/i)
  assert.match(match[0], /profile_not_ready/i)
})
