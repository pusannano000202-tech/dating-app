import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('worldcup result updates the existing profile instead of attempting a partial insert', () => {
  const page = readSource('app/profile/worldcup/page.tsx')

  assert.match(
    page,
    /\.from\(['"]profiles['"]\)[\s\S]{0,240}\.update\(profileUpdate\)[\s\S]{0,240}\.eq\(['"]user_id['"],\s*user\.id\)/,
  )
  assert.doesNotMatch(page, /\.upsert\(profileUpdate/)
  assert.match(page, /profile_record_missing/)
})

test('worldcup result summary uses readable text colors on the light surface', () => {
  const result = readSource('components/profile/IdealWorldcupResult.tsx')

  assert.match(result, /text-boot-ink/)
  assert.match(result, /text-boot-muted/)
  assert.doesNotMatch(result, /text-xl font-black text-white/)
  assert.doesNotMatch(result, /text-sm text-gray-300/)
})
