import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260903000000_tonight_refund_dead_letter.sql',
)

test('irrecoverable Tonight refunds are dead-lettered immediately by a service-only RPC', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'dead-letter migration must exist')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.service_dead_letter_tonight_refund_request\s*\(/i)
  assert.match(sql, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
  assert.match(sql, /auth\.role\(\)[\s\S]*?service_role_required/i)
  assert.match(sql, /FOR UPDATE/i)
  assert.match(sql, /p_expected_revision/i)
  assert.match(sql, /p_idempotency_key/i)
  assert.match(sql, /p_error[\s\S]*?invalid_refund_claim[\s\S]*?provider_evidence_mismatch[\s\S]*?provider_request_rejected/i)
  assert.match(sql, /settlement_attempt_count\s*=\s*10/i)
  assert.match(sql, /status\s*=\s*'failed'/i)
  assert.match(sql, /quantum_private\.write_tonight_audit/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.service_dead_letter_tonight_refund_request/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.service_dead_letter_tonight_refund_request[\s\S]*?TO service_role/i)
  assert.doesNotMatch(sql, /GRANT EXECUTE[\s\S]*?TO (?:anon|authenticated)/i)
})
