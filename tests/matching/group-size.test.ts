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

  const routePath = join(process.cwd(), 'app/api/match-pool/enter/route.ts')
  const route = readFileSync(routePath, 'utf8')

  assert.match(route, /if\s*\(\s*activeMembers\.length\s*<\s*2\s*\)\s*\{/)
  assert.match(route, /if\s*\(\s*activeMembers\.length\s*!==\s*group\.size\s*\)\s*\{/)
  assert.ok(!/activeMembers\.length\s*<\s*group\.size/.test(route))
  assert.match(route, /select\('user_id'\)/)
  assert.match(route, /select\('id,\s*size,\s*status,\s*leader_user_id'\)/)
  assert.match(route, /const isLeader = group\.leader_user_id === user\.id/)
  assert.ok(route.indexOf("if (activeMembers.length < 2)") < route.indexOf('activeMembers.length !== group.size'))
  assert.ok(route.indexOf("if (!activeMembers.some((row: { user_id: string }) => row.user_id === user.id))") <
    route.indexOf('if (!isLeader)'))

  assert.match(migration, /v_group\.leader_user_id\s*\<\>\s*v_caller/)
  assert.match(route, /if\s*\(\s*!isLeader\s*\)\s*\{/)
  assert.ok(!/select\('user_id, role'\)/.test(route))
  assert.ok(!/row\.role\s*===\s*'leader'/.test(route))

  assert.match(route, /return NextResponse\.json\(\{ error: 'group_not_full' \}, \{ status: 409 \}\)/)
})
