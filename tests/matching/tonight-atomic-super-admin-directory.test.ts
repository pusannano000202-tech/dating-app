import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()
const MIGRATION_NAME = '20260903105000_tonight_atomic_super_admin_directory.sql'
const MIGRATION_PATH = join(ROOT, 'supabase', 'migrations', MIGRATION_NAME)

function migrationSql(): string {
  return existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : ''
}

function directoryFunction(sql: string): string {
  const start = sql.search(
    /CREATE OR REPLACE FUNCTION public\.super_admin_search_tonight_directory\b/i,
  )
  assert.notEqual(start, -1, 'missing atomic super-admin directory RPC')
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1)
  assert.notEqual(end, -1)
  return sql.slice(start, end + 3)
}

test('directory migration follows account onboarding and exposes only authenticated execution', () => {
  const sql = migrationSql()
  assert.ok(sql, `${MIGRATION_NAME} must exist`)
  assert.ok(MIGRATION_NAME.slice(0, 14) > '20260903104000')
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.super_admin_search_tonight_directory\(TEXT\)\s+FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.super_admin_search_tonight_directory\(TEXT\)\s+TO authenticated/i,
  )
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.super_admin_search_tonight_directory\(TEXT\)\s+TO (?:PUBLIC|anon|service_role)/i,
  )
})

test('directory RPC validates the query and authorizes the sensitive read in its transaction', () => {
  const fn = directoryFunction(migrationSql())
  const authorization = fn.indexOf('public.authorize_tonight_sensitive_read(')
  const accountRead = fn.indexOf('FROM public.users')
  const venueRead = fn.indexOf('FROM public.venues')

  assert.match(fn, /RETURNS JSONB[\s\S]*?LANGUAGE plpgsql[\s\S]*?VOLATILE/i)
  assert.match(fn, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
  assert.match(fn, /v_caller UUID := auth\.uid\(\)/i)
  assert.match(fn, /IF v_caller IS NULL[\s\S]*?RAISE EXCEPTION 'not_authenticated'/i)
  assert.match(fn, /char_length\(v_query\) NOT BETWEEN 2 AND 80/i)
  assert.match(fn, /RAISE EXCEPTION 'invalid_directory_query'/i)
  assert.match(
    fn,
    /public\.authorize_tonight_sensitive_read\(\s*'super_admin_directory',\s*NULL\s*\)/i,
  )
  assert.ok(authorization >= 0 && authorization < accountRead)
  assert.ok(authorization < venueRead)
})

test('directory migration adds B-tree prefix indexes for every searched text field', () => {
  const sql = migrationSql()
  const indexes = [
    ['tonight_directory_users_email_prefix_idx', 'users', 'email', true],
    ['tonight_directory_users_school_email_prefix_idx', 'users', 'school_email', true],
    ['tonight_directory_profiles_display_name_prefix_idx', 'profiles', 'display_name', true],
    ['tonight_directory_venues_name_prefix_idx', 'venues', 'name', false],
    ['tonight_directory_venues_address_prefix_idx', 'venues', 'address', false],
    ['tonight_directory_venues_area_prefix_idx', 'venues', 'area', true],
  ] as const

  for (const [indexName, table, column, partial] of indexes) {
    const where = partial ? `\\s+WHERE ${column} IS NOT NULL` : ''
    assert.match(
      sql,
      new RegExp(
        `CREATE INDEX IF NOT EXISTS ${indexName}\\s+ON public\\.${table} \\(\\(pg_catalog\\.lower\\(${column}\\)\\) pg_catalog\\.text_pattern_ops\\)${where}`,
        'i',
      ),
    )
  }
  assert.doesNotMatch(sql, /pg_trgm|gin_trgm_ops/i)
})

test('directory RPC uses escaped-safe case-insensitive prefix predicates without leading wildcards', () => {
  const fn = directoryFunction(migrationSql())

  assert.match(fn, /v_prefix_pattern TEXT/i)
  assert.match(
    fn,
    /v_prefix_pattern := pg_catalog\.lower\(v_query\) \|\| '%'/i,
  )
  assert.doesNotMatch(fn, /\bILIKE\b/i)
  assert.doesNotMatch(fn, /'% '\s*\|\||'%\s*'\s*\|\||'% '|'%'\s*\|\|\s*v_query/i)
  for (const expression of [
    'pg_catalog.lower(user_row.email) LIKE v_prefix_pattern',
    'pg_catalog.lower(user_row.school_email) LIKE v_prefix_pattern',
    'pg_catalog.lower(profile.display_name) LIKE v_prefix_pattern',
    'pg_catalog.lower(venue_row.name) LIKE v_prefix_pattern',
    'pg_catalog.lower(venue_row.address) LIKE v_prefix_pattern',
    'pg_catalog.lower(venue_row.area) LIKE v_prefix_pattern',
  ]) {
    assert.match(fn, new RegExp(expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
})

test('directory RPC returns the existing bounded safe account and venue envelope', () => {
  const fn = directoryFunction(migrationSql())
  const limits = fn.match(/LIMIT 20/gi) ?? []

  assert.equal(limits.length, 2, 'account and venue results must each be bounded to 20')
  assert.match(
    fn,
    /\) AS venue_candidates\s+ORDER BY venue_candidates\.name, venue_candidates\.id\s+LIMIT 20\s+\) AS venue/i,
  )
  assert.match(fn, /'users'/i)
  assert.match(fn, /'venues'/i)
  for (const key of ['user_id', 'display_name', 'school', 'department', 'email_hint']) {
    assert.match(fn, new RegExp(`'${key}'`, 'i'))
  }
  for (const key of ['id', 'name', 'category', 'address', 'area', 'status']) {
    assert.match(fn, new RegExp(`'${key}'`, 'i'))
  }
  assert.match(fn, /LEFT\([^,]+,\s*2\)\s*\|\|\s*'\*\*\*@'/i)
  assert.doesNotMatch(fn, /'phone'|'phone_hint'|\.phone\b/i)
  assert.doesNotMatch(fn, /'email'\s*,|'school_email'\s*,/i)
  assert.doesNotMatch(fn, /createPaymentServiceClient|service_role/i)
})
