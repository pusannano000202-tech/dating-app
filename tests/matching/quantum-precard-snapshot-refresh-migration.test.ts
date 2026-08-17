import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260814024000_matching_precard_b_snapshot_refresh.sql',
)

function readMigration() {
  return fs.readFileSync(migrationPath, 'utf8')
}

test('B precard snapshot migration replaces only legacy room-card payloads', () => {
  const sql = readMigration()

  assert.match(sql, /create or replace function private\.snapshot_quantum_event_room_member_card/i)
  assert.match(sql, /quantum-precard-b-v1/i)

  for (const key of [
    'intro',
    'mbti',
    'conversation_energy',
    'plan_style',
    'interests',
    'music',
    'mint_chocolate',
    'naengmyeon',
    'meetup_role',
  ]) {
    assert.match(sql, new RegExp(`'${key}'`, 'i'))
  }

  assert.doesNotMatch(sql, /meetup_expectation/i)
  assert.match(sql, /on conflict \(occurrence_id, participant_user_id\) do update/i)
  assert.match(sql, /where not \(existing_snapshot\.safe_payload \?&/i)
  assert.match(sql, /revoke all on function private\.snapshot_quantum_event_room_member_card/i)
})

test('B precard snapshot migration keeps the anonymous participant read boundary', () => {
  const sql = readMigration()

  assert.match(sql, /create or replace function public\.get_my_quantum_event_room_participants\(\)/i)
  assert.match(sql, /room_membership_required/i)
  assert.match(sql, /room_school_mismatch/i)
  assert.match(sql, /snapshot\.participant_user_id not in/i)
  assert.doesNotMatch(sql, /'photo'|'real_name'|'display_name'|'department'|'phone'|'user_id'|'appearance'/i)
  assert.match(sql, /revoke all on function public\.get_my_quantum_event_room_participants\(\)/i)
  assert.match(sql, /grant execute on function public\.get_my_quantum_event_room_participants\(\)\s+to authenticated/i)
})
