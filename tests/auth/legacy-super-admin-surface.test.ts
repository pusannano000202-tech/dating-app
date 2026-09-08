import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function source(relativePath: string): string {
  const absolutePath = join(ROOT, relativePath)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

test('legacy profile and match evidence APIs keep a recent super-admin application guard', () => {
  for (const path of [
    'app/api/admin/users/[id]/route.ts',
    'app/api/admin/users/[id]/appearance-override/route.ts',
    'app/api/admin/matches/[id]/route.ts',
  ]) {
    const route = source(path)
    assert.match(route, /requireRequestAccess\(request,\s*\{[\s\S]*?allowedRoles:\s*\['super_admin'\][\s\S]*?requireRecentAuth:\s*true/)
    assert.match(route, /RequestGuardError/)
    assert.match(route, /requestGuardErrorResponse/)
  }
})

test('legacy sensitive pages are nested behind the same recent super-admin boundary', () => {
  for (const path of [
    'app/admin/users/layout.tsx',
    'app/admin/matches/[id]/layout.tsx',
    'app/admin/matches/review/layout.tsx',
  ]) {
    const layout = source(path)
    assert.match(layout, /SuperAdminOnlyBoundary/)
  }

  const boundary = source('app/admin/SuperAdminOnlyBoundary.tsx')
  assert.match(boundary, /allowedRoles:\s*\['super_admin'\]/)
  assert.match(boundary, /requireRecentAuth:\s*true/)
})

test('legacy appearance override no longer asks for or forwards a manual reason', () => {
  const page = source('app/admin/users/[id]/page.tsx')
  const route = source('app/api/admin/users/[id]/appearance-override/route.ts')

  assert.doesNotMatch(page, /setReason|변경 사유|사유 \(선택\)|body:\s*JSON\.stringify\(\{[^}]*reason/)
  assert.doesNotMatch(route, /body\.reason/)
  assert.match(route, /p_reason:\s*null/)
})

test('ordinary admin navigation does not advertise sensitive match review', () => {
  const layout = source('app/admin/layout.tsx')
  assert.match(layout, /accessRole\s*===\s*'super_admin'/)
  assert.match(layout, /href="\/admin\/matches\/review"/)
})

test('legacy match and global-config mutations require recent super-admin access', () => {
  for (const path of [
    'app/api/admin/matches/create/route.ts',
    'app/api/admin/matches/[id]/review/route.ts',
    'app/api/admin/config/route.ts',
  ]) {
    const route = source(path)
    assert.match(route, /requireRequestAccess\(req(?:uest)?,\s*\{[\s\S]*?allowedRoles:\s*\['super_admin'\][\s\S]*?requireRecentAuth:\s*true/)
    assert.match(route, /RequestGuardError/)
    assert.match(route, /requestGuardErrorResponse/)
  }

  const createRoute = source('app/api/admin/matches/create/route.ts')
  const reviewRoute = source('app/api/admin/matches/[id]/review/route.ts')
  const configRoute = source('app/api/admin/config/route.ts')
  assert.match(createRoute, /hasOnlyKeys\(body, \['group_a', 'group_b', 'is_forced'\]\)/)
  assert.match(reviewRoute, /hasOnlyKeys\(body, \['decision', 'add_excluded'\]\)/)
  assert.match(reviewRoute, /p_reason:\s*null/)
  assert.match(configRoute, /new Set\(\['match_requires_approval', 'tonight_applications_open'\]\)/)
  assert.match(configRoute, /typeof body\.value\s*!==\s*'boolean'/)
})

test('pending match scores are a recent super-admin-only private response', () => {
  const route = source('app/api/admin/matches/pending/route.ts')

  assert.match(route, /requireRequestAccess\(request,\s*\{[\s\S]*?allowedRoles:\s*\['super_admin'\][\s\S]*?requireRecentAuth:\s*true/)
  assert.match(route, /RequestGuardError/)
  assert.match(route, /requestGuardErrorResponse/)
  assert.match(route, /privateJson\(\{ matches:/)

  const migration = source('supabase/migrations/20260903001100_legacy_super_admin_mutation_boundary.sql')
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_list_pending_matches\(\)/)
  assert.match(migration, /public\.is_super_admin\(v_caller\)/)
  assert.match(migration, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/)
  assert.match(migration, /LIMIT 100/)
})

test('legacy match review and latest app config RPC enforce the same database boundary', () => {
  const legacyMigration = source('supabase/migrations/20260903001100_legacy_super_admin_mutation_boundary.sql')
  const configMigration = source('supabase/migrations/20260903035000_tonight_authoritative_activation_gate.sql')

  assert.match(legacyMigration, /CREATE OR REPLACE FUNCTION public\.admin_review_match/)
  assert.match(legacyMigration, /review_reason\s*=\s*NULL/)
  assert.match(configMigration, /CREATE OR REPLACE FUNCTION public\.set_app_config/)
  assert.match(configMigration, /public\.is_super_admin\(v_caller\)/)
  assert.match(configMigration, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/)
  assert.match(configMigration, /p_key NOT IN \('match_requires_approval', 'tonight_applications_open'\)/)
  assert.match(configMigration, /pg_catalog\.jsonb_typeof\(p_value\)\s*<>\s*'boolean'/)
})
