import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260903001500_tonight_deposit_policy_consent.sql',
)
const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : ''

test('deposit policy acceptance is append-only, versioned, and user-bound', () => {
  assert.match(sql, /CREATE TABLE quantum_private\.tonight_deposit_policy_acceptances/i)
  assert.match(sql, /application_id UUID NOT NULL UNIQUE/i)
  assert.match(sql, /policy_version TEXT NOT NULL/i)
  assert.match(sql, /policy_hash TEXT NOT NULL/i)
  assert.match(sql, /accepted_at TIMESTAMPTZ NOT NULL/i)
  assert.match(sql, /prevent_tonight_immutable_mutation/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.accept_tonight_deposit_policy/i)
  assert.match(sql, /v_caller UUID := auth\.uid\(\)/i)
  assert.match(sql, /application_row\.user_id <> v_caller/i)
  assert.match(sql, /deposit_time_gate_closed/i)
  assert.match(sql, /deposit_policy_version_invalid/i)
  assert.match(sql, /deposit_policy_hash_invalid/i)
})

test('database refuses deposit creation without the current policy acceptance', () => {
  assert.match(sql, /ADD COLUMN deposit_policy_version TEXT/i)
  assert.match(sql, /ADD COLUMN deposit_policy_accepted_at TIMESTAMPTZ/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION quantum_private\.require_tonight_deposit_policy_acceptance/i)
  assert.match(sql, /BEFORE INSERT ON public\.tonight_deposits/i)
  assert.match(sql, /deposit_policy_acceptance_required/i)
  assert.match(sql, /NEW\.deposit_policy_version := acceptance_row\.policy_version/i)
  assert.match(sql, /NEW\.deposit_policy_accepted_at := acceptance_row\.accepted_at/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.accept_tonight_deposit_policy[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.accept_tonight_deposit_policy[\s\S]*?TO authenticated/i)
  assert.doesNotMatch(sql, /GRANT .*tonight_deposit_policy_acceptances.*authenticated/i)
})
