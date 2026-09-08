import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const predecessor = '20260903021152'

function auditPaginationMigration(): { filename: string; sql: string } {
  const names = readdirSync(migrationsDir).filter((name) =>
    /^\d{14}_tonight_audit_pagination\.sql$/.test(name),
  )
  assert.equal(names.length, 1, 'expected exactly one audit pagination migration')
  const [filename] = names
  assert.ok(filename.slice(0, 14) > predecessor, 'audit pagination migration must follow its predecessor')
  return { filename, sql: readFileSync(join(migrationsDir, filename), 'utf8') }
}

function readFunction(sql: string, name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing public.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing ${name} body`)
  assert.notEqual(end, -1, `missing ${name} end`)
  return sql.slice(start, end + 3)
}

test('audit RPC uses a descending occurred_at and id keyset with one-row lookahead', () => {
  const { sql } = auditPaginationMigration()
  const fn = readFunction(sql, 'super_admin_list_tonight_audit_events')

  assert.match(sql, /^\s*--[\s\S]*?\bBEGIN;[\s\S]*?\bCOMMIT;\s*$/i)
  assert.match(fn, /p_round_id UUID/i)
  assert.match(fn, /p_before_occurred_at TIMESTAMPTZ/i)
  assert.match(fn, /p_before_id BIGINT/i)
  assert.match(fn, /p_limit INTEGER/i)
  assert.match(fn, /p_limit IS NULL OR p_limit < 1 OR p_limit > 50[\s\S]*?invalid_limit/i)
  assert.match(
    fn,
    /\(p_before_occurred_at IS NULL\) <> \(p_before_id IS NULL\)[\s\S]*?invalid_audit_cursor/i,
  )
  assert.match(
    fn,
    /\(audit\.occurred_at, audit\.id\) < \(p_before_occurred_at, p_before_id\)/i,
  )
  assert.match(fn, /ORDER BY audit\.occurred_at DESC, audit\.id DESC[\s\S]*?LIMIT p_limit \+ 1/i)
  assert.match(fn, /audit\.id::TEXT AS audit_cursor_id/i)
})

test('audit RPC preserves super-admin recent-auth and supports global or one-round reads', () => {
  const fn = readFunction(auditPaginationMigration().sql, 'super_admin_list_tonight_audit_events')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(fn, /p_round_id IS NOT NULL[\s\S]*?tonight_round_not_found/i)
  assert.match(fn, /p_round_id IS NULL\s+OR/i)
  assert.match(fn, /audit\.entity_type = 'round' AND audit\.entity_id = p_round_id/i)
  assert.match(fn, /application_row\.round_id = p_round_id/i)
  assert.match(fn, /team\.round_id = p_round_id/i)
  for (const entityType of [
    'deposit_reconciliation',
    'service_confirmation_attempt',
    'deposit_disposition_job',
    'settlement_job',
    'market_membership',
    'tonight_notification_outbox',
    'tonight_push_delivery',
  ]) {
    assert.match(fn, new RegExp(`audit\\.entity_type = '${entityType}'`, 'i'))
  }
  assert.match(fn, /tonight_deposit_reconciliation_jobs[\s\S]*?tonight_deposits[\s\S]*?tonight_applications/i)
  assert.match(fn, /tonight_partner_service_confirmation_attempts[\s\S]*?tonight_teams/i)
  assert.match(fn, /tonight_deposit_disposition_jobs[\s\S]*?tonight_deposits[\s\S]*?tonight_applications/i)
  assert.match(fn, /tonight_settlement_jobs[\s\S]*?tonight_teams/i)
  assert.match(fn, /tonight_market_memberships[\s\S]*?tonight_rounds[\s\S]*?market_code/i)
  assert.match(fn, /tonight_notification_outbox[\s\S]*?outbox\.round_id = p_round_id/i)
  assert.match(
    fn,
    /tonight_push_deliveries[\s\S]*?tonight_notification_outbox[\s\S]*?notification_id[\s\S]*?outbox\.round_id = p_round_id/i,
  )
  assert.doesNotMatch(fn, /reason TEXT|p_reason/i)
})

test('audit pagination installs its index and retires the legacy raw bulk RPC', () => {
  const { sql } = auditPaginationMigration()

  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS tonight_audit_events_recent_idx\s+ON quantum_private\.tonight_audit_events \(occurred_at DESC, id DESC\)/i,
  )
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.super_admin_list_tonight_audit_events\(\s*UUID, TIMESTAMPTZ, BIGINT, INTEGER\s*\)\s+FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.super_admin_list_tonight_audit_events\(\s*UUID, TIMESTAMPTZ, BIGINT, INTEGER\s*\)\s+TO authenticated/i,
  )
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.super_admin_list_tonight_audit_events\(UUID, INTEGER\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.super_admin_list_tonight_audit_events\(UUID, INTEGER\)/i,
  )
})
