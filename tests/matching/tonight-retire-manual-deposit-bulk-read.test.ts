import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260903033000_tonight_retire_manual_deposit_bulk_read.sql',
)

const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : ''

test('retires the unbounded manual-deposit identity reader after the paged exception cutover', () => {
  assert.match(sql, /^BEGIN;/m)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.super_admin_list_tonight_manual_deposits\(UUID\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.super_admin_list_tonight_manual_deposits\(UUID\)/i,
  )
  assert.match(sql, /COMMIT;/i)
  assert.doesNotMatch(sql, /GRANT EXECUTE/i)
})
