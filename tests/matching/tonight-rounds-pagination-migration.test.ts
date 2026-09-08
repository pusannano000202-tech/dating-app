import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function paginationMigration(): string {
  const names = readdirSync(migrationsDir).filter((name) =>
    /^20260903015847_tonight_rounds_pagination\.sql$/.test(name),
  )
  assert.equal(names.length, 1, 'expected one rounds pagination migration')
  return readFileSync(join(migrationsDir, names[0]), 'utf8')
}

function readFunction(sql: string, name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing public.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1)
  assert.notEqual(end, -1)
  return sql.slice(start, end + 3)
}

test('round page uses a descending composite keyset and rejects unbounded input', () => {
  const sql = paginationMigration()
  const fn = readFunction(sql, 'admin_list_tonight_rounds')

  assert.match(sql, /^\s*--[\s\S]*?\bBEGIN;[\s\S]*?\bCOMMIT;\s*$/i)
  assert.match(fn, /p_limit INTEGER DEFAULT 50/i)
  assert.match(fn, /p_before_starts_at TIMESTAMPTZ DEFAULT NULL/i)
  assert.match(fn, /p_before_id UUID DEFAULT NULL/i)
  assert.match(fn, /p_limit < 1 OR p_limit > 50[\s\S]*?invalid_limit/i)
  assert.match(fn, /\(p_before_starts_at IS NULL\) <> \(p_before_id IS NULL\)[\s\S]*?invalid_round_cursor/i)
  assert.match(fn, /\(round_row\.starts_at, round_row\.id\) < \(p_before_starts_at, p_before_id\)/i)
  assert.match(fn, /ORDER BY round_row\.starts_at DESC, round_row\.id DESC[\s\S]*?LIMIT p_limit \+ 1/i)
  assert.match(fn, /public\.is_admin\(v_caller\)/i)
})

test('round aggregates are restricted to the at-most-51-row page before counting children', () => {
  const fn = readFunction(paginationMigration(), 'admin_list_tonight_rounds')

  assert.match(fn, /page_rounds AS MATERIALIZED/i)
  assert.match(fn, /application_stats AS MATERIALIZED[\s\S]*?JOIN page_rounds/i)
  assert.match(fn, /gender_stats AS MATERIALIZED[\s\S]*?JOIN page_rounds/i)
  assert.match(fn, /exception_events AS MATERIALIZED[\s\S]*?JOIN page_rounds/i)
  assert.match(fn, /COUNT\(\*\) FILTER \(WHERE application_row\.status = 'waitlisted'\)/i)
  assert.match(fn, /feature\.gender_code = 'male'/i)
  assert.match(fn, /feature\.gender_code = 'female'/i)
  assert.match(fn, /deposit\.status = 'reconciliation_required'/i)
  assert.match(fn, /settlement\.status = 'disputed'/i)
  assert.match(fn, /refund_request\.settlement_attempt_count >= 10/i)
  assert.match(fn, /confirmation\.confirmed_attendee_count <> arrived\.arrived_count/i)
  assert.doesNotMatch(fn, /SELECT COUNT\(\*\)[\s\S]*?WHERE application_row\.round_id = round_row\.id/i)
})

test('round pagination installs the supporting index and removes browser access to the legacy zero-arg scan', () => {
  const sql = paginationMigration()

  assert.match(sql, /CREATE INDEX IF NOT EXISTS tonight_rounds_admin_recent_idx\s+ON public\.tonight_rounds \(starts_at DESC, id DESC\)/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_list_tonight_rounds\(\)\s+FROM PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /DROP FUNCTION public\.admin_list_tonight_rounds\(\)/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_list_tonight_rounds\(INTEGER, TIMESTAMPTZ, UUID\)\s+FROM PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_list_tonight_rounds\(INTEGER, TIMESTAMPTZ, UUID\)\s+TO authenticated/i)
})
