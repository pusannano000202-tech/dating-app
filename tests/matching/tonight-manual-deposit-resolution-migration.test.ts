import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260903001000_tonight_manual_deposit_resolution.sql',
)

const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : ''

test('manual Tonight deposit decisions are append-only, revisioned, and caller bound', () => {
  assert.match(sql, /CREATE TABLE quantum_private\.tonight_manual_deposit_resolution_events/i)
  assert.match(sql, /decision TEXT NOT NULL CHECK \(decision IN \('refund', 'forfeit'\)\)/i)
  assert.match(sql, /actor_user_id UUID NOT NULL/i)
  assert.match(sql, /deposit_id UUID NOT NULL UNIQUE/i)
  assert.match(sql, /idempotency_key TEXT NOT NULL UNIQUE/i)
  assert.doesNotMatch(sql, /\breason\b/i)
  assert.match(sql, /prevent_tonight_immutable_mutation/i)

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.super_admin_resolve_tonight_manual_deposit\s*\(/i)
  assert.match(sql, /p_expected_revision INTEGER/i)
  assert.doesNotMatch(sql, /p_forfeit_policy_approved BOOLEAN|p_actor_user_id UUID/i)
  assert.match(sql, /v_caller UUID := auth\.uid\(\)/i)
  assert.match(sql, /public\.is_super_admin\(v_caller\)/i)
  assert.match(sql, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(sql, /team[\s\S]*?FOR UPDATE[\s\S]*?attendance[\s\S]*?FOR UPDATE[\s\S]*?deposit[\s\S]*?FOR UPDATE/i)
  assert.match(sql, /deposit_row\.revision <> p_expected_revision[\s\S]*?stale_revision/i)
  assert.match(sql, /attendance_row\.status NOT IN \('pending', 'no_show'\)/i)
  assert.match(sql, /deposit_row\.status <> 'held'/i)
  assert.match(sql, /terminal_event\.disposition = 'manual_review'/i)
})

test('refund is queued explicitly while forfeiture needs both server and database policy gates', () => {
  assert.match(sql, /'tonight_no_show_forfeit_policy_approved'[\s\S]*?pg_catalog\.to_jsonb\(FALSE\)/i)
  assert.match(sql, /p_decision = 'forfeit'[\s\S]*?app_config[\s\S]*?tonight_no_show_forfeit_policy_approved[\s\S]*?forfeit_policy_not_approved/i)
  assert.match(sql, /IF p_decision = 'refund'[\s\S]*?SET status = 'refund_requested'/i)
  assert.match(sql, /INSERT INTO public\.tonight_deposit_refund_requests/i)
  assert.match(sql, /ON CONFLICT \(deposit_id\) DO NOTHING/i)
  assert.match(sql, /ELSIF p_decision = 'forfeit'[\s\S]*?SET status = 'forfeited'/i)
  assert.match(sql, /p_decision = 'forfeit'[\s\S]*?EXISTS \([\s\S]*?tonight_deposit_refund_requests[\s\S]*?manual_deposit_refund_state_conflict/i)
  assert.match(sql, /actor_user_id,[\s\S]*?v_caller/i)
  assert.match(sql, /INSERT INTO quantum_private\.tonight_audit_events/i)
  assert.match(sql, /'authenticated'/i)
  assert.match(sql, /before_state[\s\S]*?after_state/i)
})

test('only super-admins can list actionable deposit identities and resolved rows disappear for ordinary admins', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.super_admin_list_tonight_manual_deposits\s*\(/i)
  assert.match(sql, /public\.is_super_admin\(v_caller\)/i)
  assert.match(sql, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(sql, /deposit_id UUID[\s\S]*?deposit_revision INTEGER/i)
  assert.match(sql, /NOT EXISTS \([\s\S]*?tonight_manual_deposit_resolution_events/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.admin_get_tonight_deposit_terminal_exceptions\s*\(/i)
  assert.match(sql, /terminal_event\.disposition = 'manual_review'[\s\S]*?NOT EXISTS \([\s\S]*?tonight_manual_deposit_resolution_events/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.super_admin_resolve_tonight_manual_deposit[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.super_admin_resolve_tonight_manual_deposit[\s\S]*?TO authenticated/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.super_admin_list_tonight_manual_deposits[\s\S]*?TO authenticated/i)
})
