import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260814023000_matching_precard_b_completed_items.sql',
  ),
  'utf8',
)

test('B precard migration permits exactly seven completed items', () => {
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS pre_match_card_drafts_completed_items_check/i,
  )
  assert.match(
    migration,
    /ADD CONSTRAINT pre_match_card_drafts_completed_items_check[\s\S]*completed_items BETWEEN 0 AND 7/i,
  )
  assert.doesNotMatch(migration, /completed_items BETWEEN 0 AND 6/i)
})

test('B precard migration changes only the completed-items check', () => {
  assert.doesNotMatch(migration, /GRANT\s/i)
  assert.doesNotMatch(migration, /REVOKE\s/i)
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/i)
  assert.doesNotMatch(migration, /DROP TABLE/i)
})
