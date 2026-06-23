import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGender, oppositeGenderForWorldcup } from '../../lib/gender'

test('normalizeGender accepts Korean and English male values', () => {
  assert.equal(normalizeGender('male'), 'male')
  assert.equal(normalizeGender('남자'), 'male')
  assert.equal(normalizeGender('man'), 'male')
  assert.equal(normalizeGender('m'), 'male')
})

test('normalizeGender accepts Korean and English female values', () => {
  assert.equal(normalizeGender('female'), 'female')
  assert.equal(normalizeGender('여자'), 'female')
  assert.equal(normalizeGender('woman'), 'female')
  assert.equal(normalizeGender('f'), 'female')
})

test('normalizeGender rejects unknown values', () => {
  assert.equal(normalizeGender(null), null)
  assert.equal(normalizeGender(undefined), null)
  assert.equal(normalizeGender(''), null)
  assert.equal(normalizeGender('unknown'), null)
})

test('oppositeGenderForWorldcup opens the opposite candidate pool', () => {
  assert.equal(oppositeGenderForWorldcup('male'), 'female')
  assert.equal(oppositeGenderForWorldcup('남자'), 'female')
  assert.equal(oppositeGenderForWorldcup('female'), 'male')
  assert.equal(oppositeGenderForWorldcup('여자'), 'male')
  assert.equal(oppositeGenderForWorldcup('unknown'), null)
})
