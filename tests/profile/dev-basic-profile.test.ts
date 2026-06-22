import test from 'node:test'
import assert from 'node:assert/strict'

import { readDevBasicProfileGender } from '../../lib/profile/dev-basic-profile'

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

test('readDevBasicProfileGender falls back to female when no basic profile was saved', () => {
  assert.equal(readDevBasicProfileGender(() => null), 'female')
})

test('readDevBasicProfileGender ignores malformed stored profile data', () => {
  assert.equal(readDevBasicProfileGender(() => '{broken'), 'female')
  assert.equal(readDevBasicProfileGender(() => JSON.stringify({ gender: 'unknown' })), 'female')
})
