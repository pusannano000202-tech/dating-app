import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('basic profile loading always settles and offers a retry after bootstrap failure', () => {
  const page = readSource('app/profile/basic/page.tsx')

  assert.match(page, /finally\s*\{[\s\S]*setLoaded\(true\)/)
  assert.match(page, /setLoadError\(/)
  assert.match(page, /다시 불러오기/)
  assert.match(page, /PROFILE_LOAD_TIMEOUT_MS/)
})

test('dev profile preview falls back to saved draft when Supabase auth is unavailable', () => {
  const page = readSource('app/profile/basic/page.tsx')

  assert.match(page, /const isDevPreview = isDevPreviewClientSession\(\)/)
  assert.match(page, /if \(authError && !isDevPreview\) throw authError/)
  assert.match(page, /sessionStorage\.getItem\(DEV_BASIC_PROFILE_STORAGE_KEY\)/)
})
