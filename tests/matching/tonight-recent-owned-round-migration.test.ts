import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260903000500_tonight_financial_recovery_hardening.sql',
)

test('current Tonight round prioritizes every caller-owned unresolved financial journey', () => {
  assert.equal(fs.existsSync(migrationPath), true)
  const migration = fs.readFileSync(migrationPath, 'utf8')
  const current = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.get_current_tonight_round()'),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.get_my_tonight_journey('),
  )
  const unresolved = current.slice(0, current.indexOf('IF NOT FOUND THEN'))
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_current_tonight_round\(\)/i)
  assert.match(migration, /round_row\.status NOT IN \('completed', 'cancelled'\)/i)
  assert.match(migration, /application_row\.user_id = v_caller/i)
  assert.match(current, /quantum_private\.is_tonight_financial_recovery_application\(\s*application_row\.id,\s*v_caller\s*\)/i)
  assert.doesNotMatch(unresolved, /INTERVAL '7 days'/i)
  assert.doesNotMatch(unresolved, /round_row\.starts_at\s*[<>]/i)
  assert.match(migration, /membership\.user_id = v_caller[\s\S]*?membership\.revoked_at IS NULL/i)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_current_tonight_round\(\)/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_current_tonight_round\(\) TO authenticated/i)
})

test('an unresolved owned deposit journey wins over a newly opened round without membership', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8')
  const current = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.get_current_tonight_round()'),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.get_my_tonight_journey('),
  )
  assert.match(
    migration,
    /deposit\.status IN \(\s*'pending',\s*'paid',\s*'held',\s*'refund_requested',\s*'reconciliation_required'\s*\)/i,
  )
  assert.match(
    migration,
    /refund_request\.status IN \(\s*'requested',\s*'approved',\s*'processing',\s*'failed'\s*\)/i,
  )
  assert.match(
    migration,
    /tonight_deposit_reconciliation_jobs[\s\S]*?reconciliation_job\.status IN \('pending', 'processing', 'failed'\)/i,
  )

  const unresolvedBlock = current.slice(0, current.indexOf('IF NOT FOUND THEN'))
  assert.doesNotMatch(unresolvedBlock, /tonight_market_memberships/i)
  assert.doesNotMatch(unresolvedBlock, /round_row\.status IN \('completed', 'cancelled'\)/i)
  assert.doesNotMatch(unresolvedBlock, /starts_at\s*[<>]/i)
  assert.match(migration, /v_financial_recovery BOOLEAN := FALSE/i)
  assert.match(migration, /v_financial_recovery := TRUE/i)
  assert.match(migration, /'financial_recovery', v_financial_recovery/i)
})

test('historical journey lookup separates owned financial recovery from future eligibility', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8')
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_my_tonight_journey\(\s*p_round_id UUID\s*\)/i)
  assert.match(migration, /application_value\.user_id = v_caller/i)
  assert.match(migration, /v_has_active_membership := EXISTS/i)
  assert.match(
    migration,
    /IF NOT v_has_active_membership[\s\S]*?NOT quantum_private\.is_tonight_financial_recovery_application\(\s*application_row\.id,\s*v_caller\s*\)[\s\S]*?tonight_market_membership_required/i,
  )
  assert.match(migration, /v_recovery_only := NOT v_has_active_membership/i)
  assert.match(migration, /v_can_reveal := NOT v_recovery_only/i)
  assert.match(migration, /v_can_mark_arrival := NOT v_recovery_only/i)
})
