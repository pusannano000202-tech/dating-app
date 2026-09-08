import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function readAll(): string {
  return readdirSync(migrationsDir)
    .filter((name) => /^202609(?:0220124[3-7]|0300000[12])_.*\.sql$/.test(name))
    .sort()
    .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
    .join('\n')
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

test('recent super-admin authentication is bound to the callers exact auth session', () => {
  const sql = readAll()
  const helper = readFunction(sql, 'quantum_private', 'require_recent_super_admin_auth')
  const verifier = readFunction(sql, 'public', 'verify_recent_super_admin_session')

  assert.match(helper, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(helper, /p_user_id\s*<>\s*auth\.uid\(\)/i)
  assert.match(helper, /auth\.jwt\(\)\s*->>\s*'session_id'/i)
  assert.match(helper, /FROM auth\.sessions/i)
  assert.match(helper, /session_row\.user_id\s*=\s*p_user_id/i)
  assert.match(helper, /session_row\.id\s*=\s*v_session_id/i)
  assert.match(helper, /created_at/i)
  assert.match(helper, /INTERVAL '15 minutes'/i)
  assert.match(helper, /reauthentication_required/i)
  assert.doesNotMatch(helper, /auth\.users|last_sign_in_at/i)
  assert.match(verifier, /quantum_private\.require_recent_super_admin_auth\(auth\.uid\(\)\)/i)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION quantum_private\.require_recent_super_admin_auth\(UUID\)[\s\S]*?PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.verify_recent_super_admin_session\(\)[\s\S]*?PUBLIC, anon, service_role/i,
  )
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.verify_recent_super_admin_session\(\)\s+TO authenticated/i)
})

test('every browser-callable sensitive super-admin RPC requires recent authentication in the database', () => {
  const sql = readAll()
  for (const name of [
    'grant_venue_partner_membership',
    'revoke_venue_partner_membership',
    'list_venue_partner_memberships',
    'list_venue_partner_membership_events',
    'create_venue_snapshot',
    'admin_set_appearance_override',
    'admin_clear_appearance_override',
    'admin_get_user_profile',
    'admin_get_match_review',
    'super_admin_grant_tonight_market_membership',
    'super_admin_revoke_tonight_market_membership',
    'super_admin_list_tonight_market_memberships',
    'super_admin_create_tonight_round',
    'super_admin_publish_tonight_allocation',
    'super_admin_swap_tonight_friend_bundles',
    'super_admin_adjust_tonight_appearance_score',
    'super_admin_set_tonight_attendance',
    'super_admin_retry_tonight_refund',
    'super_admin_get_tonight_team_diagnostics',
    'super_admin_list_tonight_audit_events',
    'grant_admin_revisioned',
    'revoke_admin_revisioned',
  ]) {
    const fn = readFunction(sql, 'public', name)
    assert.match(
      fn,
      /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i,
      `${name} must enforce recent auth`,
    )
  }
})
