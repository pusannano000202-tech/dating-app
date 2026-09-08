import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function readTonightMigrations(): string {
  const filenames = readdirSync(migrationsDir)
    .filter((entry) => /^\d{14}_tonight_(?:ledger_schema|lifecycle_rpcs)\.sql$/.test(entry))
    .sort()
  assert.equal(filenames.length, 2, 'expected schema and lifecycle Tonight migrations')
  return filenames.map((name) => readFileSync(join(migrationsDir, name), 'utf8')).join('\n')
}

function readFunction(sql: string, functionName: string): string {
  const start = sql.search(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\b`, 'i'),
  )
  assert.notEqual(start, -1, `missing function public.${functionName}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1)
  assert.notEqual(end, -1)
  return sql.slice(start, end + 3)
}

test('every exposed Tonight table has RLS and no direct browser or service mutation grant', () => {
  const sql = readTonightMigrations()
  const tables = [
    'tonight_market_memberships',
    'tonight_rounds',
    'tonight_round_activities',
    'tonight_friend_bundles',
    'tonight_friend_bundle_members',
    'tonight_applications',
    'tonight_application_choices',
    'tonight_venue_capacities',
    'tonight_teams',
    'tonight_team_members',
    'tonight_deposits',
    'tonight_deposit_refund_requests',
    'tonight_partner_acceptances',
    'tonight_attendance',
    'tonight_partner_service_confirmations',
    'tonight_settlements',
    'tonight_incident_reports',
  ]

  for (const table of tables) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL ON TABLE public\\.${table}\\s+FROM\\s+\\/\\* explicit role boundary \\*\\/\\s+PUBLIC, anon, authenticated, service_role`,
        'i',
      ),
    )
    assert.doesNotMatch(
      sql,
      new RegExp(`GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]*public\\.${table}[^;]*TO (?:anon|authenticated|service_role)`, 'i'),
    )
  }

  assert.match(sql, /GRANT USAGE ON SCHEMA quantum_private TO service_role/i)
  assert.doesNotMatch(sql, /GRANT USAGE ON SCHEMA quantum_private TO (?:anon|authenticated)/i)
  assert.match(sql, /ALTER TABLE quantum_private\.tonight_deposit_result_events ENABLE ROW LEVEL SECURITY/i)
  assert.match(
    sql,
    /REVOKE ALL ON TABLE quantum_private\.tonight_deposit_result_events\s+FROM\s+\/\* explicit role boundary \*\/\s+PUBLIC, anon, authenticated, service_role/i,
  )
})

test('every public Tonight RPC is fixed-search-path security definer with an explicit ACL', () => {
  const sql = readTonightMigrations()
  const functionNames = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(tonight_[a-z0-9_]+|submit_tonight_[a-z0-9_]+|partner_[a-z0-9_]*tonight[a-z0-9_]*|super_admin_[a-z0-9_]*tonight[a-z0-9_]*|service_[a-z0-9_]*tonight[a-z0-9_]*|mark_my_tonight_arrival|admin_[a-z0-9_]*tonight[a-z0-9_]*|get_my_tonight_journey)\s*\(/gi)]
    .map((match) => match[1])

  assert.ok(functionNames.length >= 12, 'expected the Tonight RPC surface')
  for (const name of new Set(functionNames)) {
    const fn = readFunction(sql, name)
    assert.match(fn, /SECURITY DEFINER\s+SET search_path = ''/i, `${name} must pin search_path`)
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]*?\\)\\s+FROM\\s+\\/\\* explicit role boundary \\*\\/\\s+PUBLIC, anon, authenticated, service_role`, 'i'),
      `${name} must have an explicit revoke boundary`,
    )
  }
  assert.doesNotMatch(sql, /auth\.jwt|user_metadata|app_metadata/i)
})

test('audit events derive actor and time automatically, store before/after, and cannot be changed', () => {
  const sql = readTonightMigrations()

  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION quantum_private\.write_tonight_audit[\s\S]*?auth\.uid\(\)[\s\S]*?CURRENT_TIMESTAMP[\s\S]*?p_before_state[\s\S]*?p_after_state/i,
  )
  assert.match(
    sql,
    /CREATE TRIGGER tonight_audit_events_immutable[\s\S]*?BEFORE UPDATE[\s\S]*?prevent_tonight_immutable_mutation/i,
  )
  assert.match(
    sql,
    /CREATE TRIGGER tonight_audit_events_delete_immutable[\s\S]*?BEFORE DELETE[\s\S]*?prevent_tonight_immutable_mutation/i,
  )
  assert.doesNotMatch(sql, /write_tonight_audit\([\s\S]{0,500}?p_reason/i)
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION quantum_private\.write_tonight_audit[\s\S]*?ON CONFLICT \(entity_type, idempotency_key\)[\s\S]*?audit_idempotency_conflict/i,
  )
})

test('user journey reveals exact venue only after partner acceptance and the DB reveal gate', () => {
  const sql = readTonightMigrations()
  const fn = readFunction(sql, 'get_my_tonight_journey')

  assert.match(fn, /member\.user_id = v_caller/i)
  assert.match(fn, /team\.status = 'accepted'/i)
  assert.match(fn, /CURRENT_TIMESTAMP >= round_row\.reveal_at/i)
  assert.match(fn, /CASE WHEN v_can_reveal THEN v_snapshot\.address ELSE NULL END/i)
  assert.match(fn, /CASE WHEN v_can_reveal THEN v_snapshot\.latitude ELSE NULL END/i)
  assert.match(fn, /CASE WHEN v_can_reveal THEN v_snapshot\.longitude ELSE NULL END/i)
})

test('operator summary is non-sensitive while super-admin diagnostics enforce the sensitive boundary', () => {
  const sql = readTonightMigrations()
  const safe = readFunction(sql, 'admin_get_tonight_round_summary')
  const sensitive = readFunction(sql, 'super_admin_get_tonight_team_diagnostics')

  assert.match(safe, /public\.is_admin\(v_caller\)/i)
  assert.doesNotMatch(safe, /phone|appearance_score|age_years|primary_photo|photo_url/i)
  assert.match(sensitive, /public\.is_super_admin\(v_caller\)/i)
  assert.match(sensitive, /quantum_private\.tonight_applicant_features/i)
  assert.match(sensitive, /public\.users/i)
  assert.match(sensitive, /phone/i)
  assert.match(sensitive, /public\.photos/i)
  assert.match(sensitive, /storage_path/i)
})

test('automatic allocator read and publish RPCs are callable by service role only', () => {
  const sql = readTonightMigrations()

  for (const signature of [
    'service_create_tonight_round\\(TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT\\[\\], TEXT\\[\\], TEXT\\[\\], TEXT\\[\\], SMALLINT\\[\\], TEXT\\)',
    'service_get_tonight_allocator_input\\(UUID\\)',
    'service_publish_tonight_allocation\\(UUID, INTEGER, JSONB, TEXT\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}\\s+FROM\\s+\\/\\* explicit role boundary \\*\\/\\s+PUBLIC, anon, authenticated, service_role`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO service_role`, 'i'),
    )
    assert.doesNotMatch(
      sql,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO authenticated`, 'i'),
    )
  }

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION quantum_private\.publish_tonight_allocation_internal\(UUID, INTEGER, JSONB, TEXT\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION quantum_private\.create_tonight_round_internal\([\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  )
})

test('role-scoped read DTOs have explicit authenticated ACLs and do not grant table reads', () => {
  const sql = readTonightMigrations()
  for (const signature of [
    'get_current_tonight_round\\(\\)',
    'partner_get_tonight_setup\\(UUID\\)',
    'admin_list_tonight_rounds\\(\\)',
    'admin_get_tonight_active_exceptions\\(UUID\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}\\s+FROM\\s+\\/\\* explicit role boundary \\*\\/\\s+PUBLIC, anon, authenticated, service_role`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO authenticated`, 'i'),
    )
  }
})

test('market eligibility mutations are explicit super-admin RPCs and unavailable to ordinary signup', () => {
  const sql = readTonightMigrations()
  for (const signature of [
    'super_admin_grant_tonight_market_membership\\(TEXT, UUID, TEXT\\)',
    'super_admin_revoke_tonight_market_membership\\(UUID, INTEGER, TEXT\\)',
    'super_admin_list_tonight_market_memberships\\(TEXT\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}\\s+FROM\\s+\\/\\* explicit role boundary \\*\\/\\s+PUBLIC, anon, authenticated, service_role`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO authenticated`, 'i'),
    )
  }
  assert.doesNotMatch(sql, /GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]*tonight_market_memberships[^;]*TO authenticated/i)
})

test('Tonight matching consent is server-validated and not projected by user read DTOs', () => {
  const sql = readTonightMigrations()
  const submit = readFunction(sql, 'submit_tonight_application')
  const current = readFunction(sql, 'get_current_tonight_round')
  const journey = readFunction(sql, 'get_my_tonight_journey')

  assert.match(submit, /COALESCE\(p_matching_consent_accepted, FALSE\) = FALSE/i)
  assert.match(submit, /COALESCE\(p_matching_consent_version, ''\) <> '2026-09-03'/i)
  assert.doesNotMatch(current, /matching_consent_version|matching_consent_accepted_at/i)
  assert.doesNotMatch(journey, /matching_consent_version|matching_consent_accepted_at/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.submit_tonight_application\(UUID, UUID\[\], BOOLEAN, TEXT, TEXT, TEXT\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  )
})

test('super-admin attendance correction has an authenticated ACL but enforces super-admin in the RPC', () => {
  const sql = readTonightMigrations()
  const fn = readFunction(sql, 'super_admin_set_tonight_attendance')

  assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.super_admin_set_tonight_attendance\(UUID, UUID, TEXT, INTEGER, TEXT\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.super_admin_set_tonight_attendance\(UUID, UUID, TEXT, INTEGER, TEXT\)\s+TO authenticated/i,
  )
})

test('partner current setup and super-admin audit reads are authenticated while refund workers are service-only', () => {
  const sql = readTonightMigrations()

  for (const signature of [
    'partner_get_current_tonight_setup\\(\\)',
    'super_admin_list_tonight_audit_events\\(UUID, INTEGER\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}\\s+FROM\\s+\\/\\* explicit role boundary \\*\\/\\s+PUBLIC, anon, authenticated, service_role`, 'i'),
    )
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO authenticated`, 'i'))
  }

  for (const signature of [
    'service_prepare_tonight_deposit\\(UUID, UUID, TEXT, INTEGER, TEXT\\)',
    'service_expire_tonight_deposit_gate\\(UUID, TEXT\\)',
    'service_claim_tonight_refund_requests\\(UUID, INTEGER, INTEGER\\)',
    'service_release_tonight_refund_request\\(UUID, UUID, TEXT, INTEGER\\)',
    'service_finalize_tonight_refund_request\\(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, INTEGER, TEXT\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}\\s+FROM\\s+\\/\\* explicit role boundary \\*\\/\\s+PUBLIC, anon, authenticated, service_role`, 'i'),
    )
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO service_role`, 'i'))
    assert.doesNotMatch(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO authenticated`, 'i'))
  }
})
