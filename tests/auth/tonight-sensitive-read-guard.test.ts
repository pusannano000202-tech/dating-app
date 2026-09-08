import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260903001600_tonight_sensitive_read_guard.sql',
)
const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : ''
const read = (relativePath: string) => fs.existsSync(path.join(process.cwd(), relativePath))
  ? fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
  : ''

test('sensitive Tonight reads are append-only, actor-bound, and rate limited in the database', () => {
  assert.match(sql, /CREATE TABLE quantum_private\.tonight_sensitive_read_events/i)
  assert.match(sql, /actor_user_id UUID NOT NULL/i)
  assert.match(sql, /surface TEXT NOT NULL/i)
  assert.match(sql, /occurred_at TIMESTAMPTZ NOT NULL/i)
  assert.match(sql, /prevent_tonight_immutable_mutation/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.authorize_tonight_sensitive_read/i)
  assert.match(sql, /v_caller UUID := auth\.uid\(\)/i)
  assert.match(sql, /public\.is_super_admin\(v_caller\)/i)
  assert.match(sql, /public\.is_admin\(v_caller\)/i)
  assert.match(sql, /require_recent_super_admin_auth\(v_caller\)/i)
  assert.match(sql, /pg_advisory_xact_lock/i)
  assert.match(sql, /INTERVAL '1 minute'/i)
  assert.match(sql, /INTERVAL '1 hour'/i)
  assert.match(sql, /sensitive_read_rate_limited/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.authorize_tonight_sensitive_read[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.authorize_tonight_sensitive_read[\s\S]*?TO authenticated/i)
})

test('PII readers and the super-admin directory use one atomic database reader each', () => {
  const routes = {
    directory: read('app/api/admin/super-admin/tonight/directory/route.ts'),
    profile: read('app/api/admin/super-admin/tonight/profile/route.ts'),
    diagnostics: read('app/api/admin/super-admin/tonight/diagnostics/route.ts'),
    exceptionDetail: read('app/api/admin/tonight/exceptions/detail/route.ts'),
    legacyUserProfile: read('app/api/admin/users/[id]/route.ts'),
    legacyMatchReview: read('app/api/admin/matches/[id]/route.ts'),
  }
  assert.match(routes.directory, /rpc\('super_admin_search_tonight_directory'/)
  assert.doesNotMatch(routes.directory, /authorize_tonight_sensitive_read/)
  assert.doesNotMatch(routes.directory, /createPaymentServiceClient/)

  for (const route of [
    routes.profile,
    routes.diagnostics,
    routes.exceptionDetail,
    routes.legacyUserProfile,
    routes.legacyMatchReview,
  ]) {
    assert.doesNotMatch(route, /authorize_tonight_sensitive_read/)
  }

  assert.match(routes.profile, /admin_get_user_profile/)
  assert.match(routes.legacyUserProfile, /admin_get_user_profile/)
  assert.match(routes.diagnostics, /super_admin_get_tonight_team_diagnostics/)
  assert.match(routes.exceptionDetail, /admin_get_tonight_exception_detail/)
  assert.match(routes.legacyMatchReview, /admin_get_match_review/)
})

test('every declared sensitive-read surface is constrained by the database allowlist', () => {
  for (const surface of [
    'super_admin_directory',
    'super_admin_profile',
    'super_admin_diagnostics',
    'admin_exception_detail',
    'legacy_admin_user_profile',
    'legacy_admin_match_review',
  ]) {
    const occurrences = sql.match(new RegExp(`'${surface}'`, 'g')) ?? []
    assert.ok(occurrences.length >= 2, `${surface} must appear in both schema and RPC allowlists`)
  }
})
