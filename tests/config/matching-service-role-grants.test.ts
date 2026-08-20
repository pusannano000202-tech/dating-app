import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260814013000_matching_restore_service_role_grants.sql',
  ),
  'utf8',
)

test('matching core tables restore CRUD only to the private server role', () => {
  for (const table of ['groups', 'group_members', 'matches']) {
    assert.match(
      migration,
      new RegExp(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\\.${table} TO service_role`,
      ),
    )
  }

  assert.doesNotMatch(migration, /GRANT[^;]+TO\s+(?:PUBLIC|anon|authenticated)/i)
})
