import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function paginationMigration(): string {
  const names = readdirSync(migrationsDir).filter((name) =>
    /^20260903001200_tonight_exception_pagination\.sql$/.test(name),
  )
  assert.equal(names.length, 1, 'expected one 01200 exception pagination migration')
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

test('exception index unifies all operational sources without joining contact PII', () => {
  const sql = paginationMigration()
  const fn = readFunction(sql, 'quantum_private', 'list_tonight_exception_index')

  assert.match(sql, /^\s*--[\s\S]*?\bBEGIN;[\s\S]*?\bCOMMIT;\s*$/i)
  for (const source of [
    'tonight_attendance',
    'tonight_incident_reports',
    'tonight_deposit_refund_requests',
    'tonight_partner_service_confirmations',
    'tonight_deposit_terminal_events',
    'tonight_deposit_reconciliation_jobs',
    'tonight_partner_service_confirmation_attempts',
  ]) {
    assert.match(fn, new RegExp(source, 'i'))
  }
  assert.doesNotMatch(fn, /public\.users|public\.profiles/i)
  assert.match(fn, /service_confirmation_missing|headcount_mismatch/i)
})

test('exception page and counts are bounded, cursor based, and contain no contact fields', () => {
  const sql = paginationMigration()
  const page = readFunction(sql, 'public', 'admin_get_tonight_exception_page')
  const counts = readFunction(sql, 'public', 'admin_get_tonight_exception_counts')

  assert.match(page, /p_limit INTEGER DEFAULT 50/i)
  assert.match(page, /p_limit < 1 OR p_limit > 50[\s\S]*?invalid_limit/i)
  assert.match(page, /exception_key > p_after_exception_key/i)
  assert.match(page, /ORDER BY exception_row\.exception_key[\s\S]*?LIMIT p_limit \+ 1/i)
  assert.doesNotMatch(page, /subject_phone|reporter_phone|display_name|public\.users|public\.profiles/i)
  assert.match(counts, /COUNT\(\*\)/i)
  assert.doesNotMatch(counts, /public\.users|public\.profiles/i)
})

test('one selected exception detail is the only RPC that resolves names and phone numbers', () => {
  const sql = paginationMigration()
  const detail = readFunction(sql, 'public', 'admin_get_tonight_exception_detail')

  assert.match(detail, /p_exception_key TEXT/i)
  assert.match(detail, /exception_row\.exception_key = p_exception_key/i)
  assert.match(detail, /LEFT JOIN public\.users AS subject_user/i)
  assert.match(detail, /LEFT JOIN public\.profiles AS subject_profile/i)
  assert.match(detail, /LEFT JOIN public\.users AS reporter_user/i)
  assert.match(detail, /LIMIT 1/i)
})

test('legacy unbounded exception RPCs lose browser execution after paged replacements exist', () => {
  const sql = paginationMigration()

  for (const signature of [
    'admin_get_tonight_active_exceptions\\(UUID\\)',
    'admin_get_tonight_settlement_exceptions\\(UUID\\)',
    'admin_get_tonight_deposit_terminal_exceptions\\(UUID\\)',
    'admin_get_tonight_reconciliation_exceptions\\(UUID\\)',
    'admin_get_tonight_service_exceptions\\(UUID\\)',
  ]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]*?PUBLIC, anon, authenticated, service_role`, 'i'))
  }
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_get_tonight_exception_page\(UUID, INTEGER, TEXT\)\s+TO authenticated/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_get_tonight_exception_counts\(UUID\)\s+TO authenticated/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_get_tonight_exception_detail\(UUID, TEXT\)\s+TO authenticated/i)
})
