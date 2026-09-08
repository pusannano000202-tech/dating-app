import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function migration(): string {
  const names = readdirSync(migrationsDir).filter((name) =>
    /^20260903001300_tonight_market_membership_pagination\.sql$/.test(name),
  )
  assert.equal(names.length, 1, 'expected one 01300 market pagination migration')
  return readFileSync(join(migrationsDir, names[0]), 'utf8')
}

function readFunction(sql: string, name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing public.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  return sql.slice(start, end + 3)
}

test('market membership page is exact-searchable and bounded to fifty plus one cursor row', () => {
  const sql = migration()
  const page = readFunction(sql, 'super_admin_list_tonight_market_memberships_page')

  assert.match(sql, /^\s*--[\s\S]*?\bBEGIN;[\s\S]*?\bCOMMIT;\s*$/i)
  assert.match(page, /p_limit INTEGER DEFAULT 50/i)
  assert.match(page, /p_limit < 1 OR p_limit > 50[\s\S]*?invalid_limit/i)
  assert.match(page, /p_after_membership_id UUID DEFAULT NULL/i)
  assert.match(page, /p_user_id UUID DEFAULT NULL/i)
  assert.match(page, /membership\.user_id = p_user_id/i)
  assert.match(page, /membership\.granted_at < v_cursor_granted_at[\s\S]*?membership\.id < p_after_membership_id/i)
  assert.match(page, /ORDER BY membership\.granted_at DESC, membership\.id DESC[\s\S]*?LIMIT p_limit \+ 1/i)
  assert.match(page, /require_recent_super_admin_auth/i)
})

test('selected market membership detail is one row and the legacy unbounded list is revoked', () => {
  const sql = migration()
  const detail = readFunction(sql, 'super_admin_get_tonight_market_membership')

  assert.match(detail, /p_membership_id UUID/i)
  assert.match(detail, /membership\.id = p_membership_id/i)
  assert.match(detail, /LIMIT 1/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.super_admin_list_tonight_market_memberships\(TEXT\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.super_admin_list_tonight_market_memberships_page\(TEXT, INTEGER, UUID, UUID\)\s+TO authenticated/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.super_admin_get_tonight_market_membership\(UUID\)\s+TO authenticated/i)
})

test('venue partner membership page is exact-searchable and bounded to fifty plus one cursor row', () => {
  const sql = migration()
  const page = readFunction(sql, 'super_admin_list_venue_partner_memberships_page')

  assert.match(page, /p_limit INTEGER DEFAULT 50/i)
  assert.match(page, /p_limit < 1 OR p_limit > 50[\s\S]*?invalid_limit/i)
  assert.match(page, /p_after_membership_id UUID DEFAULT NULL/i)
  assert.match(page, /p_venue_id UUID DEFAULT NULL/i)
  assert.match(page, /p_user_id UUID DEFAULT NULL/i)
  assert.match(page, /p_include_revoked BOOLEAN DEFAULT FALSE/i)
  assert.match(page, /membership\.venue_id = p_venue_id/i)
  assert.match(page, /membership\.user_id = p_user_id/i)
  assert.match(page, /membership\.granted_at < v_cursor_granted_at[\s\S]*?membership\.id < p_after_membership_id/i)
  assert.match(page, /ORDER BY membership\.granted_at DESC, membership\.id DESC[\s\S]*?LIMIT p_limit \+ 1/i)
  assert.match(page, /require_recent_super_admin_auth/i)
})

test('selected partner membership detail is one row and the legacy unbounded list is revoked', () => {
  const sql = migration()
  const detail = readFunction(sql, 'super_admin_get_venue_partner_membership')

  assert.match(detail, /p_membership_id UUID/i)
  assert.match(detail, /membership\.id = p_membership_id/i)
  assert.match(detail, /LIMIT 1/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.list_venue_partner_memberships\(UUID, BOOLEAN\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.super_admin_list_venue_partner_memberships_page\(INTEGER, UUID, UUID, UUID, BOOLEAN\)\s+TO authenticated/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.super_admin_get_venue_partner_membership\(UUID\)\s+TO authenticated/i)
})
