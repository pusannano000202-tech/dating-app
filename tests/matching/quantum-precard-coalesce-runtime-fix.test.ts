import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260814024200_matching_precard_coalesce_runtime_fix.sql',
)

test('precard readiness and snapshots use PostgreSQL COALESCE expressions', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /create or replace function private\.quantum_event_precard_ready/i)
  assert.match(sql, /create or replace function private\.snapshot_quantum_event_room_member_card/i)
  assert.match(sql, /coalesce\(\(/i)
  assert.match(sql, /coalesce\(pg_catalog\.jsonb_agg/i)
  assert.match(sql, /coalesce\(v_interests_section, ''\)/i)
  assert.doesNotMatch(sql, /pg_catalog\.coalesce/i)
  assert.match(sql, /set search_path\s*=\s*''/i)
  assert.match(sql, /revoke all on function private\.quantum_event_precard_ready/i)
  assert.match(sql, /revoke all on function private\.snapshot_quantum_event_room_member_card/i)
})
