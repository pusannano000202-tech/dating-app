import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8')

function securityMigration(): { filename: string; sql: string } {
  const names = readdirSync(MIGRATIONS).filter((name) =>
    /^\d{14}_admin_mfa_privacy_boundary\.sql$/.test(name),
  )
  assert.equal(names.length, 1, 'expected one forward-only admin MFA/privacy migration')
  return { filename: names[0], sql: readFileSync(join(MIGRATIONS, names[0]), 'utf8') }
}

test('admin database authorization is live-role, AAL2 and active-session bound', () => {
  const { filename, sql } = securityMigration()
  assert.ok(filename.slice(0, 14) > '20260907190000')
  assert.match(sql, /CREATE OR REPLACE FUNCTION quantum_private\.admin_session_has_aal2/i)
  assert.match(sql, /p_user_id\s+IS DISTINCT FROM\s+auth\.uid\(\)/i)
  assert.match(sql, /auth\.jwt\(\)\s*->>\s*'aal'\)\s+IS DISTINCT FROM\s+'aal2'/i)
  assert.match(sql, /auth\.jwt\(\)\s*->>\s*'session_id'/i)
  assert.match(sql, /FROM auth\.sessions/i)
  assert.match(sql, /JOIN auth\.users/i)
  assert.match(sql, /session_row\.not_after IS NULL OR session_row\.not_after > CURRENT_TIMESTAMP/i)
  assert.match(sql, /auth_user\.deleted_at IS NULL/i)
  assert.match(sql, /auth_user\.banned_until IS NULL OR auth_user\.banned_until <= CURRENT_TIMESTAMP/i)
  assert.match(sql, /session_row\.user_id\s*=\s*p_user_id/i)
  assert.match(sql, /FROM public\.admins/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_admin/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_super_admin/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.verify_admin_aal2_session/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_server_access_context\(\)/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_access_context\(\)/i)
  assert.match(sql, /v_has_admin_aal2\s*:=\s*quantum_private\.admin_session_has_aal2\(v_caller\)/i)
  assert.match(sql, /WHEN v_admin_role='super_admin'\s+AND v_has_admin_aal2/i)
  assert.match(sql, /WHEN v_admin_role='admin'\s+AND v_has_admin_aal2/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_server_access_context\(\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_server_access_context\(\)\s+TO authenticated/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION quantum_private\.admin_session_has_aal2[\s\S]*?PUBLIC, anon, authenticated, service_role/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.verify_admin_aal2_session\(\)\s+TO authenticated/i)
  assert.doesNotMatch(sql, /user_metadata|raw_user_meta_data/i)
})

test('legacy voice and sports direct RPC role checks consume the AAL2-effective context', () => {
  const { sql } = securityMigration()
  const integrated = source('supabase/migrations/20260906181225_community_social_integrated.sql')
  assert.match(integrated, /community_voice_command[\s\S]*?select access_role into role_name from public\.get_access_context\(\)/i)
  assert.match(integrated, /community_sports_event_command[\s\S]*?select access_role into role_name from public\.get_access_context\(\)/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_access_context\(\)[\s\S]*?admin_session_has_aal2/i)
})

test('exception detail returns one masked business contact and no raw bilateral PII', () => {
  const { sql } = securityMigration()
  assert.match(sql, /contact_user_id UUID/i)
  assert.match(sql, /contact_role TEXT/i)
  assert.match(sql, /contact_phone_masked TEXT/i)
  assert.match(sql, /pg_catalog\.regexp_replace\(p_phone, '\[\^0-9\]'/i)
  assert.doesNotMatch(sql, /subject_display_name TEXT|subject_phone TEXT|reporter_display_name TEXT|reporter_phone TEXT/i)

  const route = source('app/api/admin/tonight/exceptions/detail/route.ts')
  assert.match(route, /toAdminExceptionDetailDto\(detail\)/)
  assert.doesNotMatch(route, /privateJson\(\{ exception: detail \}\)/)

  const adapter = source('components/tonight/live-adapters.ts')
  assert.match(adapter, /businessContactPhoneMasked:\s*contactException/)
  assert.doesNotMatch(adapter, /nullableString\(row\.(?:subject_phone|reporter_phone|subject_display_name|reporter_display_name)\)/)
})

test('MFA enrollment and challenge live outside admin layout with a loop-safe recovery exit', () => {
  for (const path of ['app/auth/mfa/page.tsx', 'app/auth/mfa/AdminMfaPanel.tsx']) {
    assert.equal(existsSync(join(ROOT, path)), true, `${path} is missing`)
  }

  const page = source('app/auth/mfa/page.tsx')
  const panel = source('app/auth/mfa/AdminMfaPanel.tsx')
  const adminLayout = source('app/admin/layout.tsx')

  assert.match(page, /requireServerAccess/)
  assert.match(page, /resolvedAccessRole !== 'admin'[\s\S]*resolvedAccessRole !== 'super_admin'/)
  assert.match(page, /getRoleDestination/)
  assert.match(page, /getAuthenticatorAssuranceLevel/)
  assert.match(page, /listFactors/)
  assert.match(panel, /factorType:\s*'totp'/)
  assert.match(panel, /useRef\(false\)/)
  assert.match(panel, /(?:factor|item)\.status === 'unverified'/)
  assert.match(panel, /supabase\.auth\.mfa\.unenroll/)
  assert.match(panel, /challengeAndVerify/)
  assert.match(panel, /supabase\.auth\.signOut\(\)/)
  assert.match(panel, /동료 최고관리자|시스템 운영 담당자/)
  assert.doesNotMatch(panel, /user_metadata|app_metadata|raw_user_meta_data/)
  assert.match(adminLayout, /mfa_required/)
  assert.match(adminLayout, /\/auth\/mfa\?returnTo=/)
})
