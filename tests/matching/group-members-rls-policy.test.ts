import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const migrationSuffix = '_matching_repair_group_members_read_rls.sql'

function readRepairMigration(): string {
  const filenames = readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(migrationSuffix))

  assert.equal(
    filenames.length,
    1,
    `expected exactly one migration ending with ${migrationSuffix}`,
  )

  return readFileSync(join(migrationsDir, filenames[0]), 'utf8')
}

function readFunction(sql: string, functionName: string): string {
  const block = sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${functionName}\\b[\\s\\S]*?\\$\\$;`,
      'i',
    ),
  )

  assert.ok(block, `missing ${functionName} function definition`)
  return block[0]
}

function readPolicy(sql: string, policyName: string): string {
  const block = sql.match(
    new RegExp(`CREATE POLICY "${policyName}"[\\s\\S]*?;`, 'i'),
  )

  assert.ok(block, `missing ${policyName} policy definition`)
  return block[0]
}

test('active-membership helper bypasses recursive RLS with a fixed security boundary', () => {
  const migration = readRepairMigration()
  const helper = readFunction(migration, 'is_active_group_member')

  assert.match(helper, /\(\s*p_group_id UUID\s*\)/i)
  assert.match(helper, /LANGUAGE sql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(helper, /\(SELECT auth\.uid\(\)\) IS NOT NULL/i)
  assert.match(helper, /FROM public\.group_members AS membership/i)
  assert.match(helper, /membership\.group_id = p_group_id/i)
  assert.match(helper, /membership\.user_id = \(SELECT auth\.uid\(\)\)/i)
  assert.match(helper, /membership\.left_at IS NULL/i)
  assert.doesNotMatch(helper, /\bFROM\s+group_members\b/i)

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.is_active_group_member\(UUID\)\s+FROM PUBLIC, anon, authenticated;/i,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.is_active_group_member\(UUID\)\s+TO authenticated;/i,
  )
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.is_active_group_member\(UUID\)\s+TO (?:PUBLIC|anon|service_role)/i,
  )
})

test('group members select policy exposes only active members of the callers active group', () => {
  const migration = readRepairMigration()
  const policy = readPolicy(migration, 'group_members_self_read')

  assert.match(
    policy,
    /ON public\.group_members\s+FOR SELECT\s+TO authenticated\s+USING\s*\(\s*left_at IS NULL\s+AND public\.is_active_group_member\(group_id\)\s*\)/i,
  )
  assert.doesNotMatch(policy, /\bEXISTS\b/i)
  assert.doesNotMatch(policy, /\bFROM\s+(?:public\.)?group_members\b/i)
  assert.doesNotMatch(policy, /\bis_admin\s*\(/i)
})

test('group members read policy replacement is duplicate-safe', () => {
  const migration = readRepairMigration()
  const dropStatements = migration.match(
    /DROP POLICY IF EXISTS "group_members_self_read" ON public\.group_members;/gi,
  ) ?? []
  const createStatements = migration.match(
    /CREATE POLICY "group_members_self_read" ON public\.group_members/gi,
  ) ?? []

  assert.equal(dropStatements.length, 1)
  assert.equal(createStatements.length, 1)
  assert.ok(
    migration.indexOf(dropStatements[0]) < migration.indexOf(createStatements[0]),
    'existing policy must be dropped before it is recreated',
  )
})
