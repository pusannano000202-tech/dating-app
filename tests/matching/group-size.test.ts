import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { normalizeGroupSize } from '../../lib/matching/group-size'

test('normalizeGroupSize supports only 2:2 and 3:3 matching sizes', () => {
  assert.equal(normalizeGroupSize('2'), 2)
  assert.equal(normalizeGroupSize(2), 2)
  assert.equal(normalizeGroupSize('3'), 3)
  assert.equal(normalizeGroupSize(3), 3)
  assert.equal(normalizeGroupSize('1'), 3)
  assert.equal(normalizeGroupSize('4'), 3)
  assert.equal(normalizeGroupSize(undefined), 3)
})

test('enter_match_pool requires the active member count to exactly match the selected group size', () => {
  const migrationPath = join(
    process.cwd(),
    'supabase/migrations/20260622183000_match_pool_exact_group_size.sql',
  )

  assert.equal(existsSync(migrationPath), true)

  const migration = readFileSync(migrationPath, 'utf8')

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enter_match_pool/)
  assert.match(migration, /v_active_count <> v_group\.size/)
  assert.match(migration, /group_not_full/)
  assert.match(migration, /Requires active member count to equal groups\.size/)
})
