import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const SQL = readFileSync('docs/implementation/community-voice/g7-g8-schema.sql', 'utf8')

test('meetup lifecycle draft is additive, revisioned, and table access stays closed', () => {
  for (const table of [
    'activity_meetup_events',
    'activity_meetup_messages',
    'activity_meetup_guide_progress',
    'activity_meetup_personal_actions',
  ]) {
    assert.match(SQL, new RegExp(`create table public\\.${table}`, 'i'))
    assert.match(SQL, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    assert.match(SQL, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'))
  }
  assert.match(SQL, /add column scope_type text not null default 'school'/i)
  assert.match(SQL, /add column revision integer not null default 0/i)
  assert.match(SQL, /p_expected_revision integer/i)
  assert.match(SQL, /p_idempotency_key uuid/i)
  assert.match(SQL, /for update/i)
})

test('department challenge draft keeps explicit teams, accepted roster, and bilateral confirmations', () => {
  for (const table of [
    'department_challenges',
    'department_challenge_teams',
    'department_challenge_roster',
    'department_challenge_schedule_confirmations',
    'department_challenge_result_confirmations',
  ]) assert.match(SQL, new RegExp(`create table public\\.${table}`, 'i'))

  assert.match(SQL, /get_member_department_identity/i)
  assert.match(SQL, /department_identity_required/i)
  assert.match(SQL, /accepted_count[\s\S]*team_capacity/i)
  assert.match(SQL, /first_score[\s\S]*second_score/i)
  assert.doesNotMatch(SQL, /insert into public\.friend_requests/i)
})

test('public functions are authenticated-only thin state boundaries', () => {
  for (const fn of [
    'get_my_activity_meetup_detail',
    'send_my_activity_meetup_chat_message',
    'update_my_activity_meetup_schedule',
    'cancel_my_activity_meetup',
    'complete_my_activity_meetup',
    'create_department_challenge',
    'accept_department_challenge_opponent',
    'accept_department_challenge_roster_request',
    'confirm_my_department_challenge_schedule',
    'confirm_my_department_challenge_result',
  ]) {
    assert.match(SQL, new RegExp(`revoke all on function public\\.${fn}`, 'i'))
    assert.match(SQL, new RegExp(`grant execute on function public\\.${fn}`, 'i'))
  }
})

