import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('basic profile keeps contact inside the app and saves through the validated profile API', () => {
  const page = readSource('app/profile/basic/page.tsx')

  assert.match(page, /fetch\(['"]\/api\/profile\/basic['"]/) ;
  assert.match(page, /JSON\.stringify\(\{ \.\.\.data, phone: '' \}\)/)
  assert.doesNotMatch(page, /fetch\(['"]\/api\/profiles\/phone['"]/) ;
  assert.doesNotMatch(page, /\.from\(['"]users['"]\)[\s\S]{0,160}\.upsert\(/)
})

test('profile phone route accepts only the phone verified by Supabase Auth', () => {
  const route = readSource('app/api/profiles/phone/route.ts')

  assert.match(route, /createSupabaseRequestClient\(request\)/)
  assert.match(route, /supabase\.auth\.getUser\(\)/)
  assert.match(route, /createSupabaseAdminClient\(\)/)
  assert.match(route, /normalizeProfilePhone/)
  assert.match(route, /normalizeProfilePhone\(user\.phone \?\? ''\)/)
  assert.match(route, /phone_verification_required/)
  assert.match(
    route,
    /\.from\(['"]users['"]\)[\s\S]*\.update\(\{\s*phone:\s*verifiedPhone\s*\}\)[\s\S]*\.eq\(['"]id['"],\s*user\.id\)/,
  )
  assert.doesNotMatch(route, /\.upsert\(/)
})
