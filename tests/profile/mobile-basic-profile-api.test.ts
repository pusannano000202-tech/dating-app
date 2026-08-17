import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseBasicProfileInput } from '../../lib/profile/basic-profile-input'

const validInput = {
  display_name: '  새벽  ',
  phone: '01012345678',
  gender: 'female',
  age: 22,
  height: 165,
  body_type: 'average',
  hair_density: 'full',
  school: ' 부산대학교 ',
  department: ' 디자인학과 ',
  year: 3,
}

test('mobile basic profile input normalizes public fields and removes female hair metadata', () => {
  const parsed = parseBasicProfileInput(validInput)

  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(parsed.value, {
    displayName: '새벽',
    phone: '010-1234-5678',
    gender: 'female',
    age: 22,
    height: 165,
    bodyType: 'average',
    hairDensity: null,
    school: '부산대학교',
    department: '디자인학과',
    year: 3,
  })
})

test('mobile basic profile rejects invalid required and bounded values', () => {
  const cases = [
    [{ ...validInput, display_name: 'a' }, 'invalid_nickname'],
    [{ ...validInput, phone: '010-12' }, 'invalid_phone'],
    [{ ...validInput, gender: 'unknown' }, 'invalid_gender'],
    [{ ...validInput, age: 17 }, 'invalid_age'],
    [{ ...validInput, height: 99 }, 'invalid_height'],
    [{ ...validInput, school: ' ' }, 'invalid_school'],
    [{ ...validInput, year: 7 }, 'invalid_year'],
  ] as const

  for (const [input, expectedError] of cases) {
    const parsed = parseBasicProfileInput(input)
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.error, expectedError)
  }
})

test('basic profile accepts no phone because contact stays inside the app', () => {
  const parsed = parseBasicProfileInput({ ...validInput, phone: '' })
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.equal(parsed.value.phone, '')
})

test('mobile basic profile route authenticates Bearer requests and keeps admin use phone-only', () => {
  const source = readFileSync(join(process.cwd(), 'app/api/profile/basic/route.ts'), 'utf8')

  assert.match(source, /createSupabaseRequestClient\(request\)/)
  assert.match(source, /parseBasicProfileInput/)
  assert.match(source, /admin\.from\('profiles'\)\.upsert/)
  assert.match(source, /value\.phone && value\.phone !== verifiedPhone/)
  assert.match(source, /phone_verification_required/)
  assert.match(source, /admin[\s\S]*\.from\('users'\)[\s\S]*\.update\(\{ phone: verifiedPhone \}\)/)
})
