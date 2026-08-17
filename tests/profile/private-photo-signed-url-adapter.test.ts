import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function readRequiredSource(path: string) {
  const absolutePath = join(ROOT, path)
  assert.equal(existsSync(absolutePath), true, `${path} must exist`)
  return readFileSync(absolutePath, 'utf8')
}

test('private photo adapter signs only validated owner paths with a server credential', () => {
  const adapter = readRequiredSource('lib/profile/private-photo-signed-urls.ts')

  assert.match(adapter, /getSupabaseAdminKey\(\)/)
  assert.match(adapter, /getSupabaseUrl\(\)/)
  assert.match(adapter, /const SIGNED_URL_TTL_SECONDS = 5 \* 60/)
  assert.match(adapter, /\.from\(['"]photos['"]\)/)
  assert.match(adapter, /\.select\(['"]storage_path,sort_order['"]\)/)
  assert.match(adapter, /\.eq\(['"]user_id['"],\s*userId\)/)
  assert.match(adapter, /isOwnedAppearanceStoragePath\(row\.storage_path, userId\)/)
  assert.match(adapter, /createSignedUrl\(storagePath, SIGNED_URL_TTL_SECONDS\)/)
  assert.match(adapter, /urlsByUser/)
  assert.doesNotMatch(adapter, /getPublicUrl|public_url/)
  assert.doesNotMatch(adapter, /console\.(?:log|info|warn|error)/)
})

test('private photo adapter keeps lookup and signing failures generic', () => {
  const adapter = readRequiredSource('lib/profile/private-photo-signed-urls.ts')

  for (const code of [
    'invalid_request',
    'server_unavailable',
    'photo_read_failed',
    'photo_path_invalid',
    'photo_url_failed',
  ]) {
    assert.match(adapter, new RegExp(`['"]${code}['"]`))
  }
  assert.doesNotMatch(adapter, /error\.message|storagePath\s*[:,]\s*storagePath/)
})
