import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const MIGRATION = join(
  ROOT,
  'supabase',
  'migrations',
  '20260903000001_admin_role_history_hardening.sql',
)

function readMigration(): string {
  return readFileSync(MIGRATION, 'utf8')
}

function readFunction(sql: string, schema: 'public' | 'quantum_private', name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing ${schema}.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for ${schema}.${name}`)
  assert.notEqual(end, -1, `missing end for ${schema}.${name}`)
  return sql.slice(start, end + 3)
}

test('admin role state is revisioned and changes have an immutable private event ledger', () => {
  const sql = readMigration()

  assert.match(sql, /ALTER TABLE public\.admins[\s\S]*?ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1/i)
  assert.match(
    sql,
    /CREATE TABLE quantum_private\.admin_role_events\s*\([\s\S]*?target_user_id UUID NOT NULL[\s\S]*?actor_user_id UUID NOT NULL[\s\S]*?action TEXT NOT NULL[\s\S]*?before_state JSONB NOT NULL[\s\S]*?after_state JSONB NOT NULL[\s\S]*?result_revision INTEGER NOT NULL[\s\S]*?idempotency_key TEXT NOT NULL/i,
  )
  assert.match(sql, /UNIQUE \(actor_user_id, idempotency_key\)/i)
  assert.match(sql, /ALTER TABLE quantum_private\.admin_role_events ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /REVOKE ALL ON TABLE quantum_private\.admin_role_events[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /CREATE TRIGGER admin_role_events_no_update[\s\S]*?BEFORE UPDATE/i)
  assert.match(sql, /CREATE TRIGGER admin_role_events_no_delete[\s\S]*?BEFORE DELETE/i)
})

test('admin role revision high-water survives revoke and is readable as a tombstone', () => {
  const sql = readMigration()

  assert.match(
    sql,
    /CREATE TABLE quantum_private\.admin_role_revision_states\s*\([\s\S]*?target_user_id UUID PRIMARY KEY[\s\S]*?revision INTEGER NOT NULL[\s\S]*?is_active BOOLEAN NOT NULL[\s\S]*?last_role TEXT/i,
  )
  assert.match(sql, /CHECK \(revision >= 0\)/i)
  assert.match(sql, /ALTER TABLE quantum_private\.admin_role_revision_states ENABLE ROW LEVEL SECURITY/i)
  assert.match(
    sql,
    /REVOKE ALL ON TABLE quantum_private\.admin_role_revision_states[\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /INSERT INTO quantum_private\.admin_role_revision_states[\s\S]*?SELECT[\s\S]*?admin\.user_id[\s\S]*?admin\.revision[\s\S]*?TRUE[\s\S]*?admin\.role[\s\S]*?FROM public\.admins AS admin/i,
  )

  const stateFn = readFunction(sql, 'public', 'super_admin_get_admin_role_state')
  assert.match(stateFn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(stateFn, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(stateFn, /COALESCE\(state\.revision, admin\.revision, 0\)/i)
  assert.match(stateFn, /COALESCE\(state\.is_active, admin\.user_id IS NOT NULL, FALSE\)/i)
})

test('revisioned admin grants are idempotent and cannot change the callers own role', () => {
  const sql = readMigration()
  const fn = readFunction(sql, 'public', 'grant_admin_revisioned')

  assert.match(fn, /p_expected_revision INTEGER/i)
  assert.match(fn, /p_idempotency_key TEXT/i)
  assert.match(fn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /p_user_id = v_caller[\s\S]*?cannot_change_own_admin_role/i)
  assert.match(fn, /pg_catalog\.pg_advisory_xact_lock/i)
  assert.match(fn, /FOR UPDATE/i)
  assert.match(fn, /admin_revision_conflict/i)
  assert.match(fn, /UPDATE public\.admins[\s\S]*?revision = state_row\.revision \+ 1/i)
  assert.match(fn, /INSERT INTO quantum_private\.admin_role_events/i)
  assert.match(fn, /admin_role_event_idempotency_conflict/i)
  assert.doesNotMatch(fn, /p_notes|reason/i)
})

test('revisioned admin grant CASes the persistent high-water instead of resetting an absent role to zero', () => {
  const sql = readMigration()
  const fn = readFunction(sql, 'public', 'grant_admin_revisioned')

  assert.match(
    fn,
    /INSERT INTO quantum_private\.admin_role_revision_states[\s\S]*?ON CONFLICT \(target_user_id\) DO NOTHING/i,
  )
  assert.match(
    fn,
    /FROM quantum_private\.admin_role_revision_states AS state[\s\S]*?WHERE state\.target_user_id = p_user_id[\s\S]*?FOR UPDATE/i,
  )
  assert.match(fn, /state_row\.revision <> p_expected_revision[\s\S]*?admin_revision_conflict/i)
  assert.match(fn, /v_result_revision := state_row\.revision \+ 1/i)
  assert.match(
    fn,
    /UPDATE quantum_private\.admin_role_revision_states[\s\S]*?revision = v_result_revision[\s\S]*?is_active = TRUE[\s\S]*?WHERE target_user_id = p_user_id[\s\S]*?revision = p_expected_revision/i,
  )
  assert.doesNotMatch(fn, /p_expected_revision <> 0/)
})

test('revisioned admin revoke blocks self and preserves an immutable before/after record', () => {
  const sql = readMigration()
  const fn = readFunction(sql, 'public', 'revoke_admin_revisioned')

  assert.match(fn, /p_expected_revision INTEGER/i)
  assert.match(fn, /p_idempotency_key TEXT/i)
  assert.match(fn, /p_user_id = v_caller[\s\S]*?cannot_change_own_admin_role/i)
  assert.match(fn, /admin_revision_conflict/i)
  assert.match(fn, /DELETE FROM public\.admins/i)
  assert.match(fn, /INSERT INTO quantum_private\.admin_role_events/i)
  assert.match(fn, /'revoke'/i)
  assert.doesNotMatch(fn, /p_notes|reason/i)
})

test('revisioned admin revoke advances a persistent tombstone before deleting the live role', () => {
  const sql = readMigration()
  const fn = readFunction(sql, 'public', 'revoke_admin_revisioned')

  assert.match(
    fn,
    /FROM quantum_private\.admin_role_revision_states AS state[\s\S]*?WHERE state\.target_user_id = p_user_id[\s\S]*?FOR UPDATE/i,
  )
  assert.match(fn, /state_row\.revision <> p_expected_revision[\s\S]*?admin_revision_conflict/i)
  assert.match(fn, /v_result_revision := state_row\.revision \+ 1/i)
  assert.match(
    fn,
    /UPDATE quantum_private\.admin_role_revision_states[\s\S]*?revision = v_result_revision[\s\S]*?is_active = FALSE[\s\S]*?WHERE target_user_id = p_user_id[\s\S]*?revision = p_expected_revision/i,
  )
  assert.match(fn, /UPDATE quantum_private\.admin_role_revision_states[\s\S]*?DELETE FROM public\.admins/i)
})

test('legacy unsafe admin mutation signatures are disabled and only revisioned RPCs are exposed', () => {
  const sql = readMigration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.grant_admin\([\s\S]*?deprecated_admin_role_rpc/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.revoke_admin\([\s\S]*?deprecated_admin_role_rpc/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.grant_admin\(UUID, TEXT, TEXT\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.revoke_admin\(UUID\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.grant_admin_revisioned\(UUID, TEXT, INTEGER, TEXT\)\s+TO authenticated/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.revoke_admin_revisioned\(UUID, INTEGER, TEXT\)\s+TO authenticated/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.super_admin_get_admin_role_state\(UUID\)\s+TO authenticated/i)
})
