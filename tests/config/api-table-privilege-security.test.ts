import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260816092918_revoke_unsafe_api_table_privileges.sql'
)

test('API roles cannot truncate tables, create triggers, or create foreign-key references', () => {
  const migration = readFileSync(migrationPath, 'utf8')

  assert.match(
    migration,
    /REVOKE\s+TRUNCATE,\s*REFERENCES,\s*TRIGGER\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+anon,\s*authenticated/i
  )
  assert.match(
    migration,
    /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+TRUNCATE,\s*REFERENCES,\s*TRIGGER\s+ON\s+TABLES\s+FROM\s+anon,\s*authenticated/i
  )
})
