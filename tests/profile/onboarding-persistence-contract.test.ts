import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('Big5 survey updates the existing required profile row', () => {
  const page = readSource('app/profile/survey/page.tsx')

  assert.match(
    page,
    /\.from\(['"]profiles['"]\)[\s\S]{0,260}\.update\(profileUpdate\)[\s\S]{0,260}\.eq\(['"]user_id['"],\s*user\.id\)[\s\S]{0,160}\.select\(['"]user_id['"]\)[\s\S]{0,120}\.maybeSingle\(\)/,
  )
  assert.doesNotMatch(page, /\.from\(['"]profiles['"]\)[\s\S]{0,120}\.upsert\(/)
  assert.match(page, /profile_record_missing/)
})

test('photo completion is performed by the authenticated server photo API', () => {
  const page = readSource('app/profile/photos/page.tsx')
  const route = readSource('app/api/profile/photos/route.ts')

  assert.doesNotMatch(page, /\.from\(['"]profiles['"]\)[\s\S]{0,220}\.update\(/)
  assert.match(page, /fetch\(['"]\/api\/profile\/photos['"],\s*\{[\s\S]{0,120}method:\s*['"]POST['"]/)
  assert.match(route, /export async function POST\(request: NextRequest\)/)
  assert.match(route, /createSupabaseAdminClient\(\)/)
  assert.match(route, /\.from\(['"]profiles['"]\)[\s\S]{0,180}\.update\(\{\s*is_profile_complete:\s*true\s*\}\)/)
  assert.match(route, /profile_record_missing/)
})

test('photo storage migration creates the bucket and all owner policies required by upsert', () => {
  const migration = readSource(
    'supabase/migrations/20260730120000_create_profile_photo_storage.sql',
  )

  assert.match(migration, /INSERT INTO storage\.buckets/)
  assert.match(migration, /VALUES\s*\(\s*'photos'/)
  assert.match(migration, /FOR SELECT TO authenticated/)
  assert.match(migration, /FOR INSERT TO authenticated/)
  assert.match(migration, /FOR UPDATE TO authenticated/)
  assert.match(migration, /FOR DELETE TO authenticated/)
  assert.match(migration, /storage\.foldername\(name\)/)
  assert.match(migration, /auth\.uid\(\)/)
})
