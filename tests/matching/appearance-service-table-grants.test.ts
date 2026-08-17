import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260810220000_appearance_service_read_dependencies.sql',
  ),
  'utf8',
)

test('appearance service receives only the legacy reads needed before private scoring', () => {
  assert.match(
    migration,
    /GRANT SELECT ON TABLE public\.photos, public\.profiles TO service_role/i,
  )
  assert.doesNotMatch(migration, /TO\s+(?:PUBLIC|anon|authenticated)/i)
  assert.doesNotMatch(migration, /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)/i)
})
