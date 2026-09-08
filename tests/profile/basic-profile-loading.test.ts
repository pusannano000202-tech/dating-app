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

test('basic profile loading uses the authenticated server contract without a login bypass', () => {
  const page = readSource('app/profile/basic/page.tsx')

  assert.match(page, /fetch\(['"]\/api\/profile\/basic['"]/)
  assert.match(page, /response\.status === 401/)
  assert.doesNotMatch(page, /isDevPreviewClientSession/)
  assert.doesNotMatch(page, /sessionStorage/)
})
