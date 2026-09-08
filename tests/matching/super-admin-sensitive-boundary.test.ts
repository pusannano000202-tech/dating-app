import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const predecessor = '20260816092918'

function readMigration(): { filename: string; sql: string } {
  const filenames = readdirSync(migrationsDir).filter((entry) =>
    /^\d{14}_super_admin_sensitive_boundary\.sql$/.test(entry),
  )
  assert.equal(filenames.length, 1, 'expected one super-admin boundary migration')
  const [filename] = filenames
  assert.ok(filename.slice(0, 14) > predecessor, 'migration must follow 20260816092918')
  return { filename, sql: readFileSync(join(migrationsDir, filename), 'utf8') }
}

function readFunction(sql: string, functionName: string): string {
  const start = sql.search(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\b`, 'i'),
  )
  assert.notEqual(start, -1, `missing function public.${functionName}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1)
  assert.notEqual(end, -1)
  return sql.slice(start, end + 3)
}

test('appearance score reads and overrides preserve signatures but require super admin', () => {
  const { sql } = readMigration()

  const setFn = readFunction(sql, 'admin_set_appearance_override')
  assert.match(setFn, /p_user_id UUID,\s*p_score FLOAT,\s*p_reason TEXT DEFAULT NULL/i)
  assert.match(setFn, /RETURNS FLOAT/i)
  assert.match(setFn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(setFn, /public\.is_super_admin\(v_caller\)/i)
  assert.doesNotMatch(setFn, /public\.is_admin\(/i)

  const clearFn = readFunction(sql, 'admin_clear_appearance_override')
  assert.match(clearFn, /p_user_id UUID,\s*p_reason TEXT DEFAULT NULL/i)
  assert.match(clearFn, /RETURNS FLOAT/i)
  assert.match(clearFn, /public\.is_super_admin\(v_caller\)/i)
  assert.doesNotMatch(clearFn, /public\.is_admin\(/i)

  const profileFn = readFunction(sql, 'admin_get_user_profile')
  assert.match(profileFn, /admin_get_user_profile\(p_user_id UUID\)/i)
  assert.match(profileFn, /RETURNS TABLE/i)
  assert.match(profileFn, /public\.is_super_admin\(v_caller\)/i)
  assert.doesNotMatch(profileFn, /public\.is_admin\(/i)
  assert.match(profileFn, /ARRAY\[\]::TEXT\[\]/i)
  assert.doesNotMatch(profileFn, /FROM public\.photos/i)
})

test('match review details require super admin and the private helper is not browser executable', () => {
  const { sql } = readMigration()
  const matchFn = readFunction(sql, 'admin_get_match_review')
  const helperFn = readFunction(sql, '_admin_group_members_json')

  assert.match(matchFn, /admin_get_match_review\(p_match_id UUID\)/i)
  assert.match(matchFn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(matchFn, /public\.is_super_admin\(v_caller\)/i)
  assert.doesNotMatch(matchFn, /public\.is_admin\(/i)
  assert.match(matchFn, /public\._admin_group_members_json\(v_match\.group_a_id\)/i)
  assert.match(matchFn, /public\._admin_group_members_json\(v_match\.group_b_id\)/i)

  assert.match(helperFn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(helperFn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(helperFn, /'primary_photo_url',\s*NULL/i)
  assert.match(helperFn, /LEFT JOIN public\.private_appearance_scores AS score/i)
  assert.doesNotMatch(helperFn, /FROM public\.photos|photo\.public_url/i)

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\._admin_group_members_json\(UUID\)\s+FROM\s+\/\* explicit role boundary \*\/\s+PUBLIC, anon, authenticated, service_role/i,
  )
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\._admin_group_members_json\(UUID\)\s+TO (?:PUBLIC|anon|authenticated|service_role)/i,
  )
})

test('sensitive RPC ACL is explicit while authorization remains database-enforced', () => {
  const { sql } = readMigration()

  for (const signature of [
    'admin_set_appearance_override\\(UUID, FLOAT, TEXT\\)',
    'admin_clear_appearance_override\\(UUID, TEXT\\)',
    'admin_get_user_profile\\(UUID\\)',
    'admin_get_match_review\\(UUID\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${signature}\\s+FROM\\s+\\/\\* explicit role boundary \\*\\/\\s+PUBLIC, anon, authenticated[\\s\\S]*?GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO authenticated`,
        'i',
      ),
    )
  }
})
