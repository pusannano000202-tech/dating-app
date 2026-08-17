import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

test('profile API does not let an authenticated client switch community school scope', () => {
  const route = read('app/api/profile/basic/route.ts')

  assert.match(route, /\.from\(['"]profiles['"]\)[\s\S]*\.select\(['"]school['"]\)/)
  assert.match(route, /school_change_requires_support/)
  assert.match(route, /existingProfile\?\.school/)
})

test('profile security cutover preserves server role profile maintenance', () => {
  const migration = read('supabase/migrations/20260814012000_profile_restore_service_role_grants.sql')

  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.profiles TO service_role/,
  )
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.users TO service_role/,
  )
})

test('database locks an established profile school while allowing trusted service updates', () => {
  const migration = read('supabase/migrations/20260813221500_profile_school_scope_lock.sql')

  assert.match(migration, /CREATE FUNCTION private\.guard_profile_school_scope/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.current_request_role/)
  assert.match(migration, /private\.profile_school_scopes/)
  assert.match(migration, /current_setting\('request\.jwt\.claims', TRUE\)/)
  assert.match(migration, /auth\.role\(\)/)
  assert.match(migration, /EXCEPTION\s+WHEN invalid_text_representation THEN/)
  assert.doesNotMatch(migration, /request\.jwt\.claim\.role/)
  assert.match(migration, /v_request_role IS DISTINCT FROM 'service_role'/)
  assert.match(migration, /school_scope_locked/)
  assert.match(migration, /BEFORE INSERT OR UPDATE OF school ON public\.profiles/)
  assert.match(migration, /REVOKE INSERT, DELETE ON TABLE public\.profiles FROM authenticated/)
  assert.match(migration, /SET search_path = ''/)
})

test('sensitive profile identity and appearance fields are server-only', () => {
  const migration = read('supabase/migrations/20260813222500_profile_sensitive_field_server_only.sql')

  assert.match(migration, /CREATE FUNCTION private\.guard_profile_sensitive_fields/)
  assert.match(migration, /profile_sensitive_fields_server_only/)
  assert.match(migration, /private\.current_request_role\(\)/)
  assert.doesNotMatch(migration, /request\.jwt\.claim\.role/)
  assert.match(migration, /v_request_role IS DISTINCT FROM 'service_role'/)
  assert.match(migration, /NEW\.is_profile_complete IS DISTINCT FROM OLD\.is_profile_complete/)
  assert.match(migration, /NEW\.appearance_score_normalized IS DISTINCT FROM OLD\.appearance_score_normalized/)
  assert.match(migration, /REVOKE INSERT, DELETE ON TABLE public\.profiles FROM authenticated/)
  assert.match(migration, /GRANT UPDATE ON TABLE public\.profiles TO authenticated/)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.users FROM authenticated/)
})
