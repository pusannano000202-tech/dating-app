import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260814024100_matching_precard_safe_text_runtime_fix.sql',
)

test('safe card text uses the PostgreSQL GREATEST expression at runtime', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /create or replace function private\.quantum_event_safe_card_text/i)
  assert.match(sql, /greatest\(1, p_max_length\)/i)
  assert.doesNotMatch(sql, /pg_catalog\.greatest/i)
  assert.match(sql, /set search_path\s*=\s*''/i)
  assert.match(sql, /revoke all on function private\.quantum_event_safe_card_text/i)
})
