import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function recoveryMigration(): string {
  const names = readdirSync(migrationsDir).filter((name) =>
    /^20260903000900_tonight_service_confirmation_recovery\.sql$/.test(name),
  )
  assert.equal(names.length, 1, 'expected one 00900 service confirmation recovery migration')
  return readFileSync(join(migrationsDir, names[0]), 'utf8')
}

function readFunction(sql: string, schema: 'public' | 'quantum_private', name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing ${schema}.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1)
  assert.notEqual(end, -1)
  return sql.slice(start, end + 3)
}

test('partner service attempts are private append-only evidence with a canonical bounded payload', () => {
  const sql = recoveryMigration()

  assert.match(sql, /^\s*--[\s\S]*?\bBEGIN;[\s\S]*?\bCOMMIT;\s*$/i)
  assert.match(sql, /CREATE TABLE quantum_private\.tonight_partner_service_confirmation_attempts/i)
  assert.match(sql, /reported_attendee_count SMALLINT[\s\S]*?BETWEEN 0 AND 5/i)
  assert.match(sql, /observed_arrived_count SMALLINT[\s\S]*?BETWEEN 0 AND 5/i)
  assert.match(sql, /expected_confirmation_revision INTEGER[\s\S]*?>= 0/i)
  assert.match(sql, /idempotency_key TEXT NOT NULL UNIQUE/i)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /REVOKE ALL ON TABLE quantum_private\.tonight_partner_service_confirmation_attempts[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /BEFORE UPDATE[\s\S]*?tonight_partner_service_confirmation_attempts[\s\S]*?prevent_tonight_immutable_mutation/i)
  assert.match(sql, /BEFORE DELETE[\s\S]*?tonight_partner_service_confirmation_attempts[\s\S]*?prevent_tonight_immutable_mutation/i)
})

test('partner records an owned service attempt in an independent RPC before confirmation', () => {
  const sql = recoveryMigration()
  const fn = readFunction(sql, 'public', 'partner_record_tonight_service_confirmation_attempt')

  assert.match(fn, /p_reported_attendee_count[\s\S]*?< 0[\s\S]*?> 5[\s\S]*?invalid_confirmed_attendee_count/i)
  assert.match(fn, /public\.is_venue_partner\(v_venue_id, v_caller\)/i)
  assert.match(fn, /FOR UPDATE OF team/i)
  assert.match(fn, /FOR UPDATE OF attendance/i)
  assert.match(fn, /COUNT\(\*\)[\s\S]*?attendance\.status = 'arrived'/i)
  assert.match(fn, /expected_confirmation_revision[\s\S]*?stale_revision/i)
  assert.match(fn, /idempotency_key[\s\S]*?idempotency_conflict/i)
  assert.match(fn, /INSERT INTO quantum_private\.tonight_partner_service_confirmation_attempts/i)
  assert.doesNotMatch(fn, /attendance_reconciliation_required/i)
})

test('service exceptions appear only after grace for a missing confirmation or latest mismatch', () => {
  const fn = readFunction(recoveryMigration(), 'public', 'admin_get_tonight_service_exceptions')

  assert.match(fn, /public\.is_admin\(v_caller\)/i)
  assert.match(fn, /INTERVAL '10 minutes'/i)
  assert.match(fn, /ORDER BY attempt\.attempted_at DESC, attempt\.id DESC/i)
  assert.match(fn, /'service_confirmation_missing'/i)
  assert.match(fn, /'headcount_mismatch'/i)
  assert.match(fn, /latest_attempt\.reported_attendee_count/i)
  assert.match(fn, /confirmation\.confirmed_attendee_count/i)
})

test('only a recently authenticated super admin can recover the latest matching attempt', () => {
  const sql = recoveryMigration()
  const fn = readFunction(sql, 'public', 'super_admin_recover_tonight_service_confirmation')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(fn, /require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(fn, /attempt\.id = p_attempt_id[\s\S]*?attempt\.team_id = p_team_id/i)
  assert.match(fn, /ORDER BY latest_attempt\.attempted_at DESC, latest_attempt\.id DESC[\s\S]*?latest_service_attempt_required/i)
  assert.match(fn, /p_expected_revision IS NULL[\s\S]*?expected_revision_required/i)
  assert.match(fn, /v_confirmation\.revision <> p_expected_revision[\s\S]*?stale_revision/i)
  assert.match(fn, /v_observed_arrived_count <> v_attempt\.reported_attendee_count[\s\S]*?attendance_reconciliation_required/i)
  assert.match(fn, /INSERT INTO public\.tonight_partner_service_confirmations|UPDATE public\.tonight_partner_service_confirmations/i)
  assert.match(fn, /write_tonight_audit[\s\S]*?'service_confirmation_recovered'/i)
  assert.match(fn, /pg_catalog\.to_jsonb\(v_confirmation\)/i)
  assert.doesNotMatch(fn, /p_reason|reason/i)
  assert.match(fn, /UPDATE public\.tonight_teams[\s\S]*?status = 'completed'/i)
})

test('ordinary admins remain read-only while recovery and attempt RPC ACLs are explicit', () => {
  const sql = recoveryMigration()

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.partner_record_tonight_service_confirmation_attempt\(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.partner_record_tonight_service_confirmation_attempt\(UUID, SMALLINT, TIMESTAMPTZ, INTEGER, TEXT\)\s+TO authenticated/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.super_admin_recover_tonight_service_confirmation\(UUID, UUID, INTEGER, TEXT\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.super_admin_recover_tonight_service_confirmation\(UUID, UUID, INTEGER, TEXT\)\s+TO authenticated/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_get_tonight_service_exceptions\(UUID\)\s+TO authenticated/i)
})

test('team summaries and super-admin bundle options are cursor-bounded to fifty teams', () => {
  const sql = recoveryMigration()
  const summary = readFunction(sql, 'public', 'admin_get_tonight_round_summary_page')
  const bundles = readFunction(sql, 'public', 'super_admin_list_tonight_team_bundle_options')

  for (const fn of [summary, bundles]) {
    assert.match(fn, /p_limit INTEGER DEFAULT 50/i)
    assert.match(fn, /p_limit < 1 OR p_limit > 50[\s\S]*?invalid_limit/i)
    assert.match(fn, /team\.team_number > p_after_team_number/i)
    assert.match(fn, /ORDER BY team\.team_number[\s\S]*?LIMIT p_limit \+ 1/i)
  }
  assert.match(bundles, /require_recent_super_admin_auth\(v_caller\)/i)
  assert.doesNotMatch(bundles, /phone|photo|appearance_score/i)
})

test('call outcomes use one UI API and database enum without changing attendance on cancelled', () => {
  const sql = recoveryMigration()
  const call = readFunction(sql, 'public', 'admin_record_tonight_call_attempt')

  assert.match(sql, /DROP CONSTRAINT IF EXISTS tonight_call_attempts_outcome_check/i)
  assert.match(sql, /CHECK \(outcome IN \('answered', 'no_answer', 'wrong_number', 'arriving', 'cancelled'\)\)/i)
  assert.match(sql, /WHEN 'busy' THEN 'no_answer'[\s\S]*?WHEN 'follow_up' THEN 'arriving'/i)
  assert.match(call, /p_outcome NOT IN \('answered', 'no_answer', 'wrong_number', 'arriving', 'cancelled'\)/i)
  assert.doesNotMatch(call, /UPDATE public\.tonight_attendance|UPDATE public\.tonight_teams/i)
  assert.match(sql, /cancelled is contact history only/i)
})

test('existing terminal and settlement workers consume the recovered canonical confirmation row', () => {
  const settlement = readFileSync(join(migrationsDir, '20260903000100_tonight_settlement_automation.sql'), 'utf8')
  const terminal = readFileSync(join(migrationsDir, '20260903000200_tonight_deposit_terminal_automation.sql'), 'utf8')

  assert.match(settlement, /FROM public\.tonight_partner_service_confirmations AS confirmation/i)
  assert.match(terminal, /FROM public\.tonight_partner_service_confirmations AS confirmation/i)
})
