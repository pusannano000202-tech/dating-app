import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260810223000_appearance_prompt_v3.sql'),
  'utf8',
)

test('appearance prompt v3 replaces only the approved scoring functions', () => {
  assert.match(migration, /appearance-anchor-v2/i)
  assert.match(migration, /appearance-anchor-v3/i)
  for (const functionName of [
    'get_my_appearance_score_status',
    'get_group_appearance_score_readiness',
    'claim_private_appearance_score',
    'complete_private_appearance_score',
    'enter_match_pool',
  ]) {
    assert.match(migration, new RegExp(functionName, 'i'))
  }
  assert.match(migration, /pg_get_functiondef/i)
  assert.match(migration, /EXECUTE function_definition/i)
})
