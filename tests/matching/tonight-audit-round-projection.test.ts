import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const predecessor = '20260903040909'

function projectionMigration(): { filename: string; sql: string } {
  const names = readdirSync(migrationsDir).filter((name) =>
    /^\d{14}_tonight_audit_round_projection\.sql$/.test(name),
  )
  assert.equal(names.length, 1, 'expected exactly one audit round projection migration')
  const [filename] = names
  assert.ok(filename.slice(0, 14) > predecessor, 'projection migration must follow its predecessor')
  return { filename, sql: readFileSync(join(migrationsDir, filename), 'utf8') }
}

function readFunction(sql: string, schema: string, name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing ${schema}.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing ${name} body`)
  assert.notEqual(end, -1, `missing ${name} end`)
  return sql.slice(start, end + 3)
}

test('audit round projection is private, immutable, and indexed for direct descending keyset reads', () => {
  const { sql } = projectionMigration()

  assert.match(sql, /^\s*--[\s\S]*?\bBEGIN;[\s\S]*?\bCOMMIT;\s*$/i)
  assert.match(
    sql,
    /CREATE TABLE quantum_private\.tonight_audit_round_projection\s*\([\s\S]*?round_id UUID NOT NULL[\s\S]*?audit_id BIGINT NOT NULL[\s\S]*?occurred_at TIMESTAMPTZ NOT NULL[\s\S]*?PRIMARY KEY \(round_id, audit_id\)/i,
  )
  assert.match(
    sql,
    /CREATE INDEX tonight_audit_round_projection_page_idx\s+ON quantum_private\.tonight_audit_round_projection\s*\(round_id, occurred_at DESC, audit_id DESC\)/i,
  )
  assert.match(
    sql,
    /ALTER TABLE quantum_private\.tonight_audit_round_projection ENABLE ROW LEVEL SECURITY[\s\S]*?FORCE ROW LEVEL SECURITY/i,
  )
  assert.match(
    sql,
    /REVOKE ALL ON TABLE quantum_private\.tonight_audit_round_projection\s+FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /CREATE TRIGGER tonight_audit_round_projection_update_immutable[\s\S]*?BEFORE UPDATE[\s\S]*?prevent_tonight_immutable_mutation/i,
  )
  assert.match(
    sql,
    /CREATE TRIGGER tonight_audit_round_projection_delete_immutable[\s\S]*?BEFORE DELETE[\s\S]*?prevent_tonight_immutable_mutation/i,
  )
  assert.doesNotMatch(
    sql.match(/CREATE TABLE quantum_private\.tonight_audit_round_projection[\s\S]*?\);/i)?.[0] ?? '',
    /name|phone|photo|payment|before_state|after_state/i,
  )
})

test('projection is race-safe, backfilled, and maintained for audit and future market-round inserts', () => {
  const { sql } = projectionMigration()
  const resolver = readFunction(sql, 'quantum_private', 'resolve_tonight_audit_round_ids')

  assert.match(
    sql,
    /LOCK TABLE public\.tonight_rounds, quantum_private\.tonight_audit_events\s+IN SHARE ROW EXCLUSIVE MODE/i,
  )
  assert.match(
    sql,
    /CREATE TRIGGER tonight_audit_events_project_round[\s\S]*?AFTER INSERT[\s\S]*?ON quantum_private\.tonight_audit_events/i,
  )
  assert.match(
    sql,
    /CREATE TRIGGER tonight_rounds_project_market_membership_audits[\s\S]*?AFTER INSERT[\s\S]*?ON public\.tonight_rounds/i,
  )
  assert.match(
    sql,
    /INSERT INTO quantum_private\.tonight_audit_round_projection[\s\S]*?CROSS JOIN LATERAL quantum_private\.resolve_tonight_audit_round_ids\([\s\S]*?ON CONFLICT \(round_id, audit_id\) DO NOTHING/i,
  )

  for (const entityType of [
    'round',
    'application',
    'venue_capacity',
    'team',
    'deposit',
    'deposit_reconciliation',
    'refund_request',
    'applicant_feature',
    'attendance',
    'service_confirmation',
    'service_confirmation_attempt',
    'settlement',
    'deposit_disposition_job',
    'settlement_job',
    'call_attempt',
    'tonight_notification_outbox',
    'tonight_push_delivery',
    'market_membership',
  ]) {
    assert.match(resolver, new RegExp(`p_entity_type = '${entityType}'`, 'i'))
  }
})

test('round-scoped audit reads use the projection index path while global reads keep stable keysets', () => {
  const { sql } = projectionMigration()
  const fn = readFunction(sql, 'public', 'super_admin_list_tonight_audit_events')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(fn, /p_limit IS NULL OR p_limit < 1 OR p_limit > 50[\s\S]*?invalid_limit/i)
  assert.match(fn, /\(p_before_occurred_at IS NULL\) <> \(p_before_id IS NULL\)[\s\S]*?invalid_audit_cursor/i)
  assert.match(fn, /p_round_id IS NOT NULL[\s\S]*?tonight_round_not_found/i)
  assert.match(fn, /IF p_round_id IS NULL THEN/i)
  assert.match(
    fn,
    /FROM quantum_private\.tonight_audit_round_projection AS projection\s+JOIN quantum_private\.tonight_audit_events AS audit\s+ON audit\.id = projection\.audit_id/i,
  )
  assert.match(fn, /projection\.round_id = p_round_id/i)
  assert.match(
    fn,
    /\(projection\.occurred_at, projection\.audit_id\) < \(p_before_occurred_at, p_before_id\)/i,
  )
  assert.match(
    fn,
    /ORDER BY projection\.occurred_at DESC, projection\.audit_id DESC[\s\S]*?LIMIT p_limit \+ 1/i,
  )
  assert.match(
    fn,
    /FROM quantum_private\.tonight_audit_events AS audit[\s\S]*?\(audit\.occurred_at, audit\.id\) < \(p_before_occurred_at, p_before_id\)[\s\S]*?ORDER BY audit\.occurred_at DESC, audit\.id DESC[\s\S]*?LIMIT p_limit \+ 1/i,
  )
  assert.doesNotMatch(fn, /audit\.entity_type\s*=/i)
  assert.match(fn, /audit\.id::TEXT AS audit_cursor_id/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.super_admin_list_tonight_audit_events\(\s*UUID, TIMESTAMPTZ, BIGINT, INTEGER\s*\)\s+FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.super_admin_list_tonight_audit_events\(\s*UUID, TIMESTAMPTZ, BIGINT, INTEGER\s*\)\s+TO authenticated/i,
  )
})
