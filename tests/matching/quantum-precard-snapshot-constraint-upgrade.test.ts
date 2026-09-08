import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260814024400_matching_precard_snapshot_constraint_upgrade.sql',
)

test('room-card constraint accepts only B snapshots without deleting legacy rows', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /drop constraint if exists quantum_event_room_card_snapshots_safe_payload_check/i)
  assert.match(sql, /add constraint quantum_event_room_card_snapshots_safe_payload_check/i)
  assert.match(sql, /not valid/i)
  assert.doesNotMatch(sql, /delete\s+from\s+public\.quantum_event_room_card_snapshots/i)

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
})
