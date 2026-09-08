import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260903012300_tonight_financial_worker_claims.sql',
)

test('deposit disposition and settlement workers use private leased job queues', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'financial worker claim migration must exist')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  for (const queue of [
    'tonight_deposit_disposition_jobs',
    'tonight_settlement_jobs',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE quantum_private\\.${queue}`, 'i'))
    assert.match(sql, new RegExp(`ALTER TABLE quantum_private\\.${queue} ENABLE ROW LEVEL SECURITY`, 'i'))
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE quantum_private\\.${queue}[\\s\\S]*?service_role`, 'i'))
  }

  assert.match(sql, /service_claim_tonight_deposit_dispositions/i)
  assert.match(sql, /service_release_tonight_deposit_disposition/i)
  assert.match(sql, /service_complete_tonight_deposit_disposition/i)
  assert.match(sql, /service_claim_tonight_settlements/i)
  assert.match(sql, /service_release_tonight_settlement/i)
  assert.match(sql, /service_complete_tonight_settlement/i)
  assert.match(sql, /FOR UPDATE OF job SKIP LOCKED/gi)
  assert.match(sql, /lease_expires_at <= CURRENT_TIMESTAMP/gi)
  assert.match(sql, /attempt_count >= 8 THEN 'dead_letter'/gi)
  assert.match(sql, /next_attempt_at\s*=\s*CURRENT_TIMESTAMP[\s\S]*?pg_catalog\.power\s*\(\s*2/i)
})

test('financial claims reconcile a crash after the business write and preserve idempotency', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(
    sql,
    /UPDATE quantum_private\.tonight_deposit_disposition_jobs AS job[\s\S]*?SET status = 'completed'[\s\S]*?tonight_deposit_terminal_events/i,
  )
  assert.match(
    sql,
    /UPDATE quantum_private\.tonight_settlement_jobs AS job[\s\S]*?SET status = 'completed'[\s\S]*?tonight_settlements/i,
  )
  assert.match(sql, /UNIQUE \(deposit_id, attendance_revision\)/i)
  assert.match(sql, /team_id UUID NOT NULL UNIQUE/i)
  assert.match(sql, /IF job_row\.status = 'completed' THEN RETURN TRUE/i)
  assert.match(sql, /job_row\.lease_id <> p_lease_id[\s\S]*?job_row\.revision <> p_expected_revision/i)
  assert.match(sql, /auth\.role\(\)[\s\S]*?service_role_required/gi)
})

test('only service role can claim, release, or complete financial jobs', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.service_list_tonight_unfinalized_deposits\(INTEGER\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.service_list_tonight_unsettled_teams\(INTEGER\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i,
  )
  for (const signature of [
    'service_claim_tonight_deposit_dispositions\\(UUID, INTEGER, INTEGER\\)',
    'service_release_tonight_deposit_disposition\\(UUID, UUID, INTEGER, TEXT\\)',
    'service_complete_tonight_deposit_disposition\\(UUID, UUID, INTEGER\\)',
    'service_claim_tonight_settlements\\(UUID, INTEGER, INTEGER\\)',
    'service_release_tonight_settlement\\(UUID, UUID, INTEGER, TEXT\\)',
    'service_complete_tonight_settlement\\(UUID, UUID, INTEGER\\)',
  ]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`, 'i'))
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}[\\s\\S]*?TO service_role`, 'i'))
  }
})
