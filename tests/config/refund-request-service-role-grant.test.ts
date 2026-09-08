import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260814017000_refund_request_restore_service_role_update.sql',
  ),
  'utf8',
)

test('refund finalization restores only service-role update access', () => {
  assert.match(
    sql,
    /GRANT UPDATE ON TABLE public\.deposit_refund_requests TO service_role/,
  )
  assert.doesNotMatch(sql, /TO (?:anon|authenticated)/)
  assert.doesNotMatch(sql, /GRANT (?:INSERT|DELETE|ALL)/)
})
