import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

test('school email request uses the shared Supabase admin-key resolver', () => {
  const route = readFileSync(
    join(ROOT, 'app/api/school-email/request/route.ts'),
    'utf8',
  ).replace(/\r\n/g, '\n')

  assert.match(route, /getSupabaseAdminKey/)
  assert.match(route, /const adminKey = getSupabaseAdminKey\(\)/)
  assert.doesNotMatch(route, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
})
