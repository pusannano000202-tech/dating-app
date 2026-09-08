import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260903012500_tonight_terminal_worker_recovery.sql',
)

function migration(): string {
  assert.equal(fs.existsSync(migrationPath), true, 'terminal worker recovery migration must exist')
  return fs.readFileSync(migrationPath, 'utf8')
}

test('expired final claims fail closed instead of staying processing forever', () => {
  const sql = migration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.service_sweep_tonight_terminal_worker_claims\s*\(/i)
  assert.match(sql, /tonight_deposit_disposition_jobs[\s\S]*?status = 'dead_letter'[\s\S]*?attempt_count >= 8[\s\S]*?lease_expires_at <= p_now/i)
  assert.match(sql, /tonight_settlement_jobs[\s\S]*?status = 'dead_letter'[\s\S]*?attempt_count >= 8[\s\S]*?lease_expires_at <= p_now/i)
  assert.match(sql, /tonight_deposit_refund_requests[\s\S]*?status = 'failed'[\s\S]*?settlement_attempt_count >= 10[\s\S]*?settlement_lease_expires_at <= p_now/i)
  assert.match(sql, /tonight_deposit_reconciliation_jobs[\s\S]*?status = 'failed'[\s\S]*?outcome = 'manual_review'[\s\S]*?attempt_count >= 20[\s\S]*?lease_expires_at <= p_now/i)
  assert.match(sql, /tonight_notification_outbox[\s\S]*?status = 'failed'[\s\S]*?attempt_count >= 8[\s\S]*?locked_at < p_now - INTERVAL '5 minutes'/i)
  assert.match(sql, /tonight_push_deliveries[\s\S]*?status = 'failed'[\s\S]*?attempt_count >= 5[\s\S]*?locked_at < p_now - INTERVAL '5 minutes'/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.service_sweep_tonight_terminal_worker_claims\(TIMESTAMPTZ, INTEGER\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.service_sweep_tonight_terminal_worker_claims\(TIMESTAMPTZ, INTEGER\)[\s\S]*?TO service_role/i)
})

test('terminal recovery locks and updates only a bounded batch per queue', () => {
  const sql = migration()

  assert.match(sql, /p_batch_size INTEGER DEFAULT 50/i)
  assert.match(sql, /p_batch_size NOT BETWEEN 1 AND 100[\s\S]*?invalid_batch_size/i)

  for (const table of [
    'tonight_deposit_disposition_jobs',
    'tonight_settlement_jobs',
    'tonight_deposit_refund_requests',
    'tonight_deposit_reconciliation_jobs',
    'tonight_notification_outbox',
    'tonight_push_deliveries',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `${table}[\\s\\S]*?ORDER BY[\\s\\S]*?LIMIT p_batch_size[\\s\\S]*?FOR UPDATE(?: OF [a-z_]+)? SKIP LOCKED`,
        'i',
      ),
      `${table} stale claims must use a bounded skip-locked candidate set`,
    )
  }

  assert.match(sql, /'batch_limit',\s*p_batch_size/i)
  assert.match(sql, /'has_more',\s*v_has_more/i)
  assert.match(sql, /'has_more_by_kind'/i)
  assert.match(sql, /v_has_more :=[\s\S]*?v_push_has_more/i)
})

test('operators receive bounded financial queue health without participant PII', () => {
  const sql = migration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.admin_get_tonight_financial_worker_health\s*\(/i)
  assert.match(sql, /p_limit INTEGER DEFAULT 50/i)
  assert.match(sql, /p_limit NOT BETWEEN 1 AND 50/i)
  assert.match(sql, /deposit_dead_letter_count/i)
  assert.match(sql, /settlement_dead_letter_count/i)
  assert.match(sql, /refund_failed_count/i)
  assert.match(sql, /reconciliation_failed_count/i)
  assert.match(sql, /notification_failed_count/i)
  assert.match(sql, /push_failed_count/i)
  assert.match(sql, /oldest_deposit_disposition_active_at/i)
  assert.match(sql, /oldest_settlement_active_at/i)
  assert.match(sql, /p_before_updated_at TIMESTAMPTZ DEFAULT NULL/i)
  assert.match(sql, /p_before_job_kind TEXT DEFAULT NULL/i)
  assert.match(sql, /p_before_job_id UUID DEFAULT NULL/i)
  assert.match(sql, /invalid_financial_cursor/i)
  assert.match(sql, /\(item\.updated_at, item\.job_kind, item\.job_id\)\s*<\s*\(p_before_updated_at, p_before_job_kind, p_before_job_id\)/i)
  assert.match(sql, /ORDER BY updated_at DESC, job_kind DESC, job_id DESC[\s\S]*?LIMIT p_limit \+ 1/i)
  assert.doesNotMatch(sql, /subject_phone|reporter_phone|display_name/i)
  assert.match(sql, /public\.is_admin\(v_caller\)/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_get_tonight_financial_worker_health\(UUID, TIMESTAMPTZ, TEXT, UUID, INTEGER\)[\s\S]*?TO authenticated/i)
})

test('only a recently authenticated super-admin can retry a dead-letter financial job', () => {
  const sql = migration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.super_admin_retry_tonight_financial_job\s*\(/i)
  assert.match(sql, /require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(sql, /p_job_kind NOT IN \('deposit_disposition', 'settlement'\)/i)
  assert.match(sql, /v_status <> 'dead_letter'/i)
  assert.match(sql, /v_actual_revision <> p_expected_revision/i)
  assert.match(sql, /attempt_count = 0/i)
  assert.match(sql, /write_tonight_audit/i)
  assert.match(sql, /financial_job_retry_requested/i)
  assert.doesNotMatch(sql, /p_reason|p_notes/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.super_admin_retry_tonight_financial_job\(TEXT, UUID, INTEGER, TEXT\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.super_admin_retry_tonight_financial_job\(TEXT, UUID, INTEGER, TEXT\)[\s\S]*?TO authenticated/i)
})
