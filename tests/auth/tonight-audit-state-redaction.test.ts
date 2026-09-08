import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const migrationsDir = join(root, 'supabase', 'migrations')

function redactionMigration(): string {
  const names = readdirSync(migrationsDir).filter((name) =>
    /^\d{14}_tonight_audit_state_redaction\.sql$/.test(name),
  )
  assert.equal(names.length, 1, 'expected one audit-state redaction migration')
  assert.ok(names[0].slice(0, 14) > '20260903043000')
  return readFileSync(join(migrationsDir, names[0]), 'utf8')
}

function readFunction(sql: string, schema: string, name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing ${schema}.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1)
  assert.notEqual(end, -1)
  return sql.slice(start, end + 3)
}

test('audit-state redaction recursively removes sensitive keys from objects and arrays', () => {
  const sql = redactionMigration()
  const helper = readFunction(sql, 'quantum_private', 'redact_tonight_audit_state')

  assert.match(helper, /IMMUTABLE[\s\S]*?SET search_path = ''/i)
  assert.match(helper, /pg_catalog\.jsonb_each\(p_value\)/i)
  assert.match(helper, /entry\.key !~\* '\(\?:payment_key\|secret\|token\|password\|phone\|photo\|idempotency\)'/i)
  assert.match(helper, /redact_tonight_audit_state\(entry\.value\)/i)
  assert.match(helper, /pg_catalog\.jsonb_array_elements\(p_value\)[\s\S]*?WITH ORDINALITY/i)
  assert.match(helper, /redact_tonight_audit_state\(item\.value\)/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION quantum_private\.redact_tonight_audit_state\(JSONB\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  )
})

test('the Data API audit reader returns only DB-sanitized states without weakening pagination guards', () => {
  const sql = redactionMigration()
  const fn = readFunction(sql, 'public', 'super_admin_list_tonight_audit_events')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(fn, /p_limit IS NULL OR p_limit < 1 OR p_limit > 50/i)
  assert.match(fn, /\(audit\.occurred_at, audit\.id\) < \(p_before_occurred_at, p_before_id\)/i)
  assert.match(fn, /\(projection\.occurred_at, projection\.audit_id\) < \(p_before_occurred_at, p_before_id\)/i)
  assert.equal((fn.match(/LIMIT p_limit \+ 1/gi) ?? []).length, 2)
  assert.equal((fn.match(/quantum_private\.redact_tonight_audit_state\(audit\.before_state\)/gi) ?? []).length, 2)
  assert.equal((fn.match(/quantum_private\.redact_tonight_audit_state\(audit\.after_state\)/gi) ?? []).length, 2)
  assert.doesNotMatch(fn, /,\s*audit\.before_state\s*,/i)
  assert.doesNotMatch(fn, /,\s*audit\.after_state\s*(?:\n|FROM)/i)
})

test('the API retains recursive defense-in-depth redaction', () => {
  const route = readFileSync(
    join(root, 'app/api/admin/super-admin/tonight/audit/route.ts'),
    'utf8',
  )
  assert.match(route, /function sanitizeAuditState\(value: unknown\): unknown/i)
  assert.match(route, /Array\.isArray\(value\)[\s\S]*?value\.map\(sanitizeAuditState\)/i)
  assert.match(route, /payment_key\|secret\|token\|password\|phone\|photo\|idempotency/i)
  assert.match(route, /\.map\(\(\[key, nested\]\) => \[key, sanitizeAuditState\(nested\)\]\)/i)
})
