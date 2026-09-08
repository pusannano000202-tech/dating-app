import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const migrationsDir = join(root, 'supabase', 'migrations')

function atomicMigration(): { filename: string; sql: string } {
  const names = readdirSync(migrationsDir).filter((name) =>
    /^\d{14}_tonight_sensitive_read_atomic_enforcement\.sql$/.test(name),
  )
  assert.equal(names.length, 1, 'expected one atomic sensitive-read enforcement migration')
  const [filename] = names
  assert.ok(filename.slice(0, 14) > '20260903042000')
  return { filename, sql: readFileSync(join(migrationsDir, filename), 'utf8') }
}

function atomicDirectoryMigration(): string {
  const path = join(
    migrationsDir,
    '20260903105000_tonight_atomic_super_admin_directory.sql',
  )
  return readFileSync(path, 'utf8')
}

function readFunction(sql: string, schema: string, name: string): string {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\b`, 'i'))
  assert.notEqual(start, -1, `missing ${schema}.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1)
  assert.notEqual(end, -1)
  return sql.slice(start, end + 3)
}

test('all four browser-callable PII readers are wrappers around non-browser private cores', () => {
  const { sql } = atomicMigration()
  const signatures = [
    ['admin_get_user_profile', 'UUID'],
    ['admin_get_match_review', 'UUID'],
    ['super_admin_get_tonight_team_diagnostics', 'UUID'],
    ['admin_get_tonight_exception_detail', 'UUID, TEXT'],
  ] as const

  for (const [name, args] of signatures) {
    assert.match(
      sql,
      new RegExp(`ALTER FUNCTION public\\.${name}\\(${args.replace('[]', '\\\\[\\\\]')}\\) SET SCHEMA quantum_private`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION quantum_private\\.${name}\\(${args.replace('[]', '\\\\[\\\\]')}\\)[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(${args.replace('[]', '\\\\[\\\\]')}\\)\\s+TO authenticated`, 'i'),
    )
  }
})

test('direct Data API calls atomically audit and throttle fixed surface and entity keys', () => {
  const { sql } = atomicMigration()
  const cases = [
    ['admin_get_user_profile', 'super_admin_profile', 'p_user_id::TEXT', true],
    ['admin_get_match_review', 'legacy_admin_match_review', 'p_match_id::TEXT', true],
    ['super_admin_get_tonight_team_diagnostics', 'super_admin_diagnostics', 'p_team_id::TEXT', true],
    ['admin_get_tonight_exception_detail', 'admin_exception_detail', 'p_exception_key', false],
  ] as const

  for (const [name, surface, subject, recentAuth] of cases) {
    const fn = readFunction(sql, 'public', name)
    const authorize = fn.indexOf('public.authorize_tonight_sensitive_read(')
    const privateRead = fn.indexOf(`quantum_private.${name}(`)

    assert.match(fn, /VOLATILE[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
    assert.ok(authorize >= 0 && authorize < privateRead, `${name} must authorize before its PII core`)
    assert.match(
      fn,
      new RegExp(`public\\.authorize_tonight_sensitive_read\\(\\s*'${surface}',\\s*${subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\)`, 'i'),
    )
    if (recentAuth) {
      assert.match(fn, /public\.is_super_admin\(v_caller\)/i)
      assert.match(fn, /quantum_private\.require_recent_super_admin_auth\(v_caller\)/i)
    } else {
      assert.match(fn, /public\.is_admin\(v_caller\)/i)
      assert.doesNotMatch(fn, /require_recent_super_admin_auth/i)
    }
  }

  assert.match(sql, /legacy admin profile route uses the canonical super_admin_profile surface/i)
})

test('routes call each protected reader once without separately consuming the audit throttle', () => {
  const protectedRoutes = [
    ['app/api/admin/users/[id]/route.ts', 'admin_get_user_profile'],
    ['app/api/admin/super-admin/tonight/profile/route.ts', 'admin_get_user_profile'],
    ['app/api/admin/matches/[id]/route.ts', 'admin_get_match_review'],
    ['app/api/admin/super-admin/tonight/diagnostics/route.ts', 'super_admin_get_tonight_team_diagnostics'],
    ['app/api/admin/tonight/exceptions/detail/route.ts', 'admin_get_tonight_exception_detail'],
  ] as const

  for (const [relativePath, rpc] of protectedRoutes) {
    const source = readFileSync(join(root, relativePath), 'utf8')
    assert.match(source, new RegExp(`rpc\\('${rpc}'`, 'i'))
    assert.doesNotMatch(source, /authorize_tonight_sensitive_read/i)
  }

  const directory = readFileSync(
    join(root, 'app/api/admin/super-admin/tonight/directory/route.ts'),
    'utf8',
  )
  assert.match(directory, /rpc\('super_admin_search_tonight_directory'/)
  assert.doesNotMatch(directory, /authorize_tonight_sensitive_read/)
  assert.doesNotMatch(directory, /createPaymentServiceClient/)
})

test('directory searches share the same role-mutation lock that grants and revokes hold exclusively', () => {
  const directorySql = atomicDirectoryMigration()
  const directoryFn = readFunction(
    directorySql,
    'public',
    'super_admin_search_tonight_directory',
  )
  const adminRoleSql = readFileSync(
    join(migrationsDir, '20260903000001_admin_role_history_hardening.sql'),
    'utf8',
  )
  const sharedLock = directoryFn.indexOf('pg_advisory_xact_lock_shared(')
  const authorize = directoryFn.indexOf('public.authorize_tonight_sensitive_read(')

  assert.match(
    directoryFn,
    /pg_advisory_xact_lock_shared\(\s*pg_catalog\.hashtextextended\('quantum:admin-role-mutation',\s*0\)\s*\)/i,
  )
  assert.doesNotMatch(directoryFn, /pg_catalog\.pg_advisory_xact_lock\(/i)
  assert.ok(sharedLock >= 0 && sharedLock < authorize)
  assert.equal(
    (adminRoleSql.match(
      /pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\('quantum:admin-role-mutation',\s*0\)\s*\)/gi,
    ) ?? []).length,
    2,
  )
})
