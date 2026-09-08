import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20260903000200_tonight_deposit_terminal_automation.sql',
), 'utf8')

test('completed Tonight attendance receives an idempotent deposit disposition without automatic forfeiture', () => {
  assert.match(migration, /CREATE TABLE quantum_private\.tonight_deposit_terminal_events/i)
  assert.match(migration, /UNIQUE \(deposit_id, attendance_revision\)/i)
  assert.match(migration, /'refund_queued', 'manual_review'/i)
  assert.match(migration, /service_list_tonight_unfinalized_deposits/i)
  assert.match(migration, /service_finalize_tonight_deposit_disposition/i)
  assert.match(migration, /auth\.role\(\)[\s\S]*?service_role_required/i)
  assert.match(migration, /team[\s\S]*?FOR UPDATE[\s\S]*?attendance[\s\S]*?FOR UPDATE[\s\S]*?deposit[\s\S]*?FOR UPDATE/i)
  assert.match(migration, /attendance_row\.status IN \('arrived', 'excused'\)/i)
  assert.match(migration, /deposit\.status IN \('paid', 'held'\)/i)
  assert.match(migration, /deposit_row\.status NOT IN \('paid', 'held'\)/i)
  assert.doesNotMatch(migration, /deposit_row\.status NOT IN \('paid', 'held', 'reconciliation_required'\)/i)
  assert.match(migration, /SET status = 'refund_requested'/i)
  assert.match(migration, /tonight_deposit_refund_requests/i)
  assert.match(migration, /ON CONFLICT \(deposit_id\) DO NOTHING/i)
  assert.match(migration, /WHEN deposit_row\.status = 'paid' THEN 'held'/i)
  assert.doesNotMatch(migration, /SET status = 'forfeited'/i)
  assert.match(migration, /write_tonight_audit/i)
  assert.match(migration, /p_expected_attendance_revision INTEGER/i)
  assert.match(migration, /terminal_event\.attendance_revision = attendance\.revision/i)
  assert.match(migration, /attendance_row\.revision <> p_expected_attendance_revision/i)
})

test('manual-review deposit dispositions are visible to admins but not venue partners', () => {
  assert.match(migration, /admin_get_tonight_deposit_terminal_exceptions/i)
  assert.match(migration, /'deposit_manual_review'/i)
  assert.match(migration, /attendance\.status IN \('pending', 'no_show'\)/i)
  assert.match(migration, /REVOKE ALL ON TABLE quantum_private\.tonight_deposit_terminal_events\s+FROM PUBLIC, anon, authenticated, service_role/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.service_list_tonight_unfinalized_deposits\(INTEGER\)\s+TO service_role/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.service_finalize_tonight_deposit_disposition\(UUID, INTEGER, INTEGER, TEXT\)\s+TO service_role/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_get_tonight_deposit_terminal_exceptions\(UUID\)\s+TO authenticated/i)
})
