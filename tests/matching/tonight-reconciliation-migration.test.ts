import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20260903000300_tonight_deposit_reconciliation_worker.sql',
), 'utf8')
const hardening = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20260903000500_tonight_financial_recovery_hardening.sql',
), 'utf8')
const neverAuthorized = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20260903000800_tonight_never_authorized_reconciliation.sql',
), 'utf8')

test('prepared Tonight orders are durably queued and leased for provider reconciliation', () => {
  assert.match(migration, /CREATE TABLE quantum_private\.tonight_deposit_reconciliation_jobs/i)
  assert.match(migration, /deposit_id UUID NOT NULL UNIQUE/i)
  assert.match(migration, /CREATE TRIGGER tonight_deposit_reconciliation_enqueue/i)
  assert.match(migration, /AFTER INSERT ON public\.tonight_deposits/i)
  assert.match(migration, /service_claim_tonight_deposit_reconciliations/i)
  assert.match(migration, /deposit_status TEXT/i)
  assert.match(migration, /FOR UPDATE OF job SKIP LOCKED/i)
  assert.match(migration, /service_release_tonight_deposit_reconciliation/i)
  assert.match(migration, /service_finalize_tonight_deposit_reconciliation/i)
  assert.match(migration, /settlement_attempt_count|attempt_count/i)
  assert.match(migration, /write_tonight_audit/i)
  assert.match(migration, /SET search_path = ''/i)
  assert.match(migration, /auth\.role\(\)[\s\S]*?service_role_required/i)
})

test('expired processing leases are closed when the browser callback already finalized the deposit', () => {
  assert.match(
    migration,
    /WHERE deposit\.id = job\.deposit_id\s+AND \(\s*job\.status IN \('pending', 'failed'\)\s+OR \(job\.status = 'processing' AND job\.lease_expires_at <= CURRENT_TIMESTAMP\)\s*\)\s+AND deposit\.status IN \('paid', 'held', 'refund_requested', 'refunded', 'forfeited'\)/i,
  )
})

test('refund_requested alone cannot discard a provider reconciliation job', () => {
  assert.match(
    migration,
    /AND \(\s*EXISTS \([\s\S]*?FROM quantum_private\.tonight_deposit_result_events AS result_event[\s\S]*?result_event\.result_status IN \('paid', 'held'\)[\s\S]*?OR EXISTS \([\s\S]*?FROM public\.tonight_deposit_refund_requests AS refund_request[\s\S]*?refund_request\.status = 'completed'[\s\S]*?\)\s*\)/i,
  )
  assert.match(
    migration,
    /WHERE deposit\.status IN \('pending', 'reconciliation_required', 'cancelled', 'refund_requested'\)/i,
  )
})

test('reconciliation jobs are private and terminal failures surface to admins', () => {
  assert.match(migration, /admin_get_tonight_reconciliation_exceptions/i)
  assert.match(migration, /'deposit_reconciliation_failed'/i)
  assert.match(migration, /'provider_cancelled_state_conflict'/i)
  assert.match(migration, /REVOKE ALL ON TABLE quantum_private\.tonight_deposit_reconciliation_jobs\s+FROM PUBLIC, anon, authenticated, service_role/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.service_claim_tonight_deposit_reconciliations/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_get_tonight_reconciliation_exceptions\(UUID\)\s+TO authenticated/i)
})

test('no-charge finalization requires the cancelled ledger event to survive concurrent callbacks', () => {
  assert.match(
    migration,
    /p_outcome = 'no_charge'[\s\S]*?deposit_row\.status <> 'cancelled'[\s\S]*?result_event\.result_status = 'cancelled'[\s\S]*?result_event\.provider_order_id = deposit_row\.provider_order_id[\s\S]*?deposit_no_charge_not_recorded/i,
  )
})

test('a late charged callback reopens a completed no-charge provider job', () => {
  assert.match(
    migration,
    /UPDATE quantum_private\.tonight_deposit_reconciliation_jobs AS job[\s\S]*?SET status = 'pending',[\s\S]*?FROM public\.tonight_deposits AS deposit/i,
  )
  assert.match(
    migration,
    /deposit\.status IN \('paid', 'held', 'reconciliation_required', 'refund_requested'\)/i,
  )
  assert.match(
    migration,
    /job\.status = 'completed'[\s\S]*?job\.outcome = 'no_charge'/i,
  )
  assert.match(
    migration,
    /SET status = 'pending',[\s\S]*?outcome = NULL,[\s\S]*?finalize_idempotency_key = NULL,[\s\S]*?completed_at = NULL/i,
  )

  const reopen = migration.search(/SET status = 'pending'/i)
  const claim = migration.search(/RETURN QUERY\s+WITH candidates/i)
  assert.ok(reopen >= 0 && reopen < claim)
})

test('super-admin can safely inspect and retry a terminal reconciliation job', () => {
  assert.match(hardening, /super_admin_list_tonight_reconciliation_failures/i)
  assert.match(hardening, /super_admin_retry_tonight_reconciliation/i)
  assert.match(hardening, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(hardening, /FOR UPDATE/i)
  assert.match(hardening, /job_row\.revision <> p_expected_revision[\s\S]*?stale_revision/i)
  assert.match(hardening, /job_row\.status <> 'failed'[\s\S]*?job_row\.attempt_count < 20[\s\S]*?reconciliation_job_not_retryable/i)
  assert.match(
    hardening,
    /FOR UPDATE OF job;[\s\S]*?WHERE audit\.entity_type = 'deposit_reconciliation'[\s\S]*?audit\.idempotency_key = p_idempotency_key[\s\S]*?RETURN \(audit_row\.after_state ->> 'revision'\)::INTEGER/i,
  )
  assert.match(
    hardening,
    /FROM public\.tonight_deposits AS deposit[\s\S]*?deposit\.id = job_row\.deposit_id[\s\S]*?deposit\.status IN \('pending', 'reconciliation_required', 'cancelled', 'refund_requested'\)/i,
  )
  assert.match(hardening, /SET status = 'pending',[\s\S]*?attempt_count = 0,[\s\S]*?revision = job\.revision \+ 1/i)
  assert.match(hardening, /deposit_reconciliation_retry_requested/i)
  assert.match(hardening, /REVOKE ALL ON FUNCTION public\.super_admin_retry_tonight_reconciliation/i)
  assert.match(hardening, /GRANT EXECUTE ON FUNCTION public\.super_admin_retry_tonight_reconciliation[\s\S]*?TO authenticated/i)
  assert.doesNotMatch(hardening, /provider_order_id TEXT[\s\S]*?super_admin_list_tonight_reconciliation_failures/i)
})

test('a prepared order becomes no-charge only after authoritative cancelled-and-absent evidence', () => {
  assert.match(neverAuthorized, /ADD COLUMN provider_not_found_count INTEGER NOT NULL DEFAULT 0/i)
  assert.match(neverAuthorized, /service_record_tonight_reconciliation_not_found/i)
  assert.match(neverAuthorized, /deposit_row\.status = 'cancelled'/i)
  assert.match(neverAuthorized, /deposit_row\.provider_payment_key_hash IS NULL/i)
  assert.match(
    neverAuthorized,
    /tonight_deposit_result_events[\s\S]*?result_event\.result_status = 'cancelled'[\s\S]*?result_event\.provider_order_id = deposit_row\.provider_order_id/i,
  )
  assert.match(neverAuthorized, /round_deposit_due_at \+ INTERVAL '15 minutes'/i)
  assert.match(neverAuthorized, /provider_not_found_count \+ 1 >= 3/i)
  assert.match(neverAuthorized, /status = 'completed',[\s\S]*?outcome = 'no_charge'/i)
  assert.match(neverAuthorized, /deposit_never_authorized/i)
  assert.match(neverAuthorized, /FOR UPDATE OF job/i)
  assert.match(neverAuthorized, /SET search_path = ''/i)
  assert.match(
    neverAuthorized,
    /REVOKE ALL ON FUNCTION public\.service_record_tonight_reconciliation_not_found[\s\S]*?GRANT EXECUTE ON FUNCTION public\.service_record_tonight_reconciliation_not_found[\s\S]*?TO service_role/i,
  )
})

test('exact-404 evidence is idempotent and serialized against a late charged callback', () => {
  assert.match(
    neverAuthorized,
    /WHERE audit\.entity_type = 'deposit_reconciliation'[\s\S]*?RETURN audit_row\.after_state[\s\S]*?FOR UPDATE OF job[\s\S]*?WHERE audit\.entity_type = 'deposit_reconciliation'[\s\S]*?RETURN audit_row\.after_state/i,
  )
  assert.match(
    neverAuthorized,
    /SELECT deposit\.\* INTO deposit_row[\s\S]*?FOR UPDATE OF deposit[\s\S]*?deposit_row\.status = 'cancelled'[\s\S]*?deposit_row\.provider_payment_key_hash IS NULL/i,
  )
  assert.match(
    neverAuthorized,
    /job_row\.status <> 'processing'[\s\S]*?job_row\.lease_id <> p_lease_id[\s\S]*?job_row\.revision <> p_expected_revision[\s\S]*?stale_revision/i,
  )
  assert.match(
    neverAuthorized,
    /before_state ->> 'lease_id'\)::UUID <> p_lease_id[\s\S]*?'lease_id', job_row\.lease_id/i,
  )
})

test('transient reconciliation failures reset the consecutive exact-404 proof', () => {
  assert.match(
    neverAuthorized,
    /CREATE OR REPLACE FUNCTION public\.service_release_tonight_deposit_reconciliation[\s\S]*?provider_not_found_count = 0/i,
  )
  assert.match(neverAuthorized, /p_error_code NOT IN \('provider_unavailable', 'record_unavailable'\)/i)
  assert.match(
    neverAuthorized,
    /CREATE OR REPLACE FUNCTION public\.super_admin_retry_tonight_reconciliation[\s\S]*?attempt_count = 0,[\s\S]*?provider_not_found_count = 0/i,
  )
})

test('late charged evidence still reopens a completed no-charge job', () => {
  assert.match(
    migration,
    /deposit\.status IN \('paid', 'held', 'reconciliation_required', 'refund_requested'\)[\s\S]*?job\.status = 'completed'[\s\S]*?job\.outcome = 'no_charge'/i,
  )
  assert.doesNotMatch(neverAuthorized, /provider_payment_key_hash\s*=\s*NULL/i)
})
