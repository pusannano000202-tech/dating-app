import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260810225500_appearance_prompt_v3_ready_constraint.sql'),
  'utf8',
)

test('ready private scores accept only the approved prompt v3 contract', () => {
  assert.match(migration, /DROP CONSTRAINT IF EXISTS private_appearance_scores_check2/i)
  assert.match(migration, /ADD CONSTRAINT private_appearance_scores_check2/i)
  assert.match(migration, /prompt_version = 'appearance-anchor-v3'/i)
  assert.doesNotMatch(migration, /appearance-anchor-v2/i)
})
