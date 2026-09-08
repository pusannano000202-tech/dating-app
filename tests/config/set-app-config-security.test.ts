import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function hardeningMigration(): string {
  const name = readdirSync(join(ROOT, 'supabase', 'migrations'))
    .find((entry) => entry.endsWith('_harden_set_app_config_search_path.sql'))
  assert.ok(name, 'set_app_config hardening migration is required')
  return readFileSync(join(ROOT, 'supabase', 'migrations', name), 'utf8')
}

test('set_app_config uses a fixed empty search path and schema-qualified objects', () => {
  const sql = hardeningMigration()

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.set_app_config\(p_key TEXT, p_value JSONB\)/i)
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(sql, /auth\.uid\(\)/i)
  assert.match(sql, /public\.is_admin\(/i)
  assert.match(sql, /pg_catalog\.set_config/i)
  assert.match(sql, /INSERT INTO public\.app_config/i)
  assert.match(sql, /CURRENT_TIMESTAMP/i)
})

test('set_app_config remains an authenticated admin RPC without public grants', () => {
  const sql = hardeningMigration()

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.set_app_config\(TEXT, JSONB\)\s+FROM PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.set_app_config\(TEXT, JSONB\) TO authenticated/i,
  )
  assert.doesNotMatch(sql, /GRANT EXECUTE[\s\S]*TO anon/i)
})
