import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260814016000_notifications_enforce_rpc_only_access.sql',
  ),
  'utf8',
)

test('notifications restore only the server insert needed by trusted fan-out', () => {
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\.notifications FROM anon, authenticated, service_role/,
  )
  assert.match(
    sql,
    /GRANT INSERT ON TABLE public\.notifications TO service_role/,
  )
  assert.doesNotMatch(sql, /GRANT [^;]+ TO (?:anon|authenticated)/)
  assert.doesNotMatch(sql, /GRANT (?:SELECT|UPDATE|DELETE|ALL)[^;]*TO service_role/)
})
