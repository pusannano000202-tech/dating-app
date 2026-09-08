import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('home requires minimum signup, while appearance/photos remain matching-only gates', () => {
  const source = readFileSync('app/page.tsx', 'utf8')
  assert.match(source, /rpc\('get_my_profile_readiness'\)/)
  assert.match(source, /minimum_signup_complete !== true/)
  assert.doesNotMatch(source, /redirect\('\/profile\/(worldcup|photos)'\)|return '\/profile\/(worldcup|photos)'/)
})
