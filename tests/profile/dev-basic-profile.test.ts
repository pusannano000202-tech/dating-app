import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  DEV_BASIC_PROFILE_STORAGE_KEY,
  readDevBasicProfileGender,
} from '../../lib/profile/dev-basic-profile'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('readDevBasicProfileGender reads the saved male gender for dev worldcup routing', () => {
  assert.equal(
    readDevBasicProfileGender(() => JSON.stringify({ gender: 'male' })),
    'male',
  )
})

test('readDevBasicProfileGender reads the saved female gender for dev worldcup routing', () => {
  assert.equal(
    readDevBasicProfileGender(() => JSON.stringify({ gender: 'female' })),
    'female',
  )
})

test('readDevBasicProfileGender returns null when no basic profile was saved', () => {
  assert.equal(readDevBasicProfileGender(() => null), null)
})

test('readDevBasicProfileGender ignores malformed stored profile data', () => {
  assert.equal(readDevBasicProfileGender(() => '{broken'), null)
  assert.equal(readDevBasicProfileGender(() => JSON.stringify({ gender: 'unknown' })), null)
})

test('dev basic profile stores gender under the key worldcup reads', () => {
  const basicPage = readSource('app/profile/basic/page.tsx')
  const worldcupPage = readSource('app/profile/worldcup/page.tsx')

  assert.match(basicPage, /DEV_BASIC_PROFILE_STORAGE_KEY/)
  assert.match(basicPage, /sessionStorage\.setItem\(DEV_BASIC_PROFILE_STORAGE_KEY, JSON\.stringify\(data\)\)/)
  assert.match(worldcupPage, /readDevBasicProfileGender\(\)/)
  assert.equal(DEV_BASIC_PROFILE_STORAGE_KEY, 'booting_dev_basic_profile')
})

test('worldcup page passes the opposite candidate gender into IdealWorldcup', () => {
  const worldcupPage = readSource('app/profile/worldcup/page.tsx')

  assert.match(worldcupPage, /import \{ normalizeGender, oppositeGenderForWorldcup \}/)
  assert.match(worldcupPage, /const oppositeGender = oppositeGenderForWorldcup\(gender\)/)
  assert.match(worldcupPage, /gender=\{oppositeGender\}/)
  assert.doesNotMatch(worldcupPage, /gender=\{gender\}/)
})
