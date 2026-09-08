import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260814024300_matching_precard_section_trim_fix.sql',
)

test('precard section parser trims line breaks around enum values', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /create or replace function private\.quantum_event_card_section/i)
  assert.match(sql, /btrim\(v_rest,\s*e' \\t\\n\\r'\)/i)
  assert.match(sql, /set search_path\s*=\s*''/i)
  assert.match(sql, /revoke all on function private\.quantum_event_card_section/i)
})
