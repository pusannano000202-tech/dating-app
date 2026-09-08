import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260814023100_matching_precard_b_content_length.sql',
  ),
  'utf8',
)

test('B precard database length matches the 900-character API contract', () => {
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS pre_match_card_drafts_content_text_check/i,
  )
  assert.match(
    migration,
    /ADD CONSTRAINT pre_match_card_drafts_content_text_check[\s\S]*char_length\(btrim\(content_text\)\) BETWEEN 10 AND 900/i,
  )
  assert.doesNotMatch(migration, /BETWEEN 10 AND 500/i)
})

test('B precard length migration does not widen table privileges', () => {
  assert.doesNotMatch(migration, /GRANT\s/i)
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/i)
  assert.doesNotMatch(migration, /DROP TABLE/i)
})
