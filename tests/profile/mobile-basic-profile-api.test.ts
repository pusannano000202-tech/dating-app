import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseBasicProfileInput } from '../../lib/profile/basic-profile-input'

const validInput = {
  display_name: '  새벽여우  ',
  alias_ticket: 'signed-server-option-ticket',
  gender: 'female',
  birth_date: '2003-09-05',
  height: 165,
  body_type: 'average',
  hair_density: 'full',
  school_scope: 'pnu_self_selected',
  department: ' 디자인학과 ',
  year: 3,
}

test('minimum signup input accepts only server alias, private DOB, PNU self-selection and all community genders', () => {
  const parsed = parseBasicProfileInput(validInput, new Date('2026-09-05T00:00:00.000Z'))

  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(parsed.value, {
    displayName: '새벽여우',
    aliasTicket: 'signed-server-option-ticket',
    gender: 'female',
    birthDate: '2003-09-05',
    age: 23,
    height: 165,
    bodyType: 'average',
    hairDensity: null,
    schoolScope: 'pnu_self_selected',
    department: '디자인학과',
    year: 3,
  })
})

test('mobile basic profile rejects invalid required and bounded values', () => {
  const cases = [
    [{ ...validInput, display_name: 'a' }, 'invalid_alias'],
    [{ ...validInput, alias_ticket: '' }, 'invalid_alias_ticket'],
    [{ ...validInput, gender: 'unsupported' }, 'invalid_gender'],
    [{ ...validInput, birth_date: '2008-09-06' }, 'invalid_age'],
    [{ ...validInput, birth_date: '1990-09-04' }, 'invalid_age'],
    [{ ...validInput, birth_date: '2003-02-30' }, 'invalid_birth_date'],
    [{ ...validInput, height: 99 }, 'invalid_height'],
    [{ ...validInput, school_scope: 'another_school' }, 'invalid_school_scope'],
    [{ ...validInput, department: ' ' }, 'invalid_department'],
    [{ ...validInput, year: 7 }, 'invalid_year'],
  ] as const

  for (const [input, expectedError] of cases) {
    const parsed = parseBasicProfileInput(input, new Date('2026-09-05T00:00:00.000Z'))
    assert.equal(parsed.ok, false)
    if (!parsed.ok) assert.equal(parsed.error, expectedError)
  }
})

test('minimum signup accepts every approved community gender without exposing DOB as public age input', () => {
  const parsed = parseBasicProfileInput({ ...validInput, gender: 'prefer_not_to_say' }, new Date('2026-09-05T00:00:00.000Z'))
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.equal(parsed.value.gender, 'prefer_not_to_say')
})

test('mobile basic profile route verifies the server alias ticket and saves all minimum fields atomically', () => {
  const source = readFileSync(join(process.cwd(), 'app/api/profile/basic/route.ts'), 'utf8')

  assert.match(source, /createSupabaseRequestClient\(request\)/)
  assert.match(source, /assertTrustedMutationOrigin/)
  assert.match(source, /parseBasicProfileInput/)
  assert.match(source, /verifyAliasTicket/)
  assert.match(source, /user\.phone_confirmed_at/)
  assert.match(source, /phone_verification_required/)
  assert.match(source, /admin\.rpc\('complete_minimum_signup'/)
  assert.doesNotMatch(source, /claim_profile_display_name/)
  assert.doesNotMatch(source, /\.from\('profiles'\)\.upsert/)
})

test('existing profiles keep valid legacy fields while the user supplies only missing private signup data', () => {
  const source = readFileSync(join(process.cwd(), 'app/api/profile/basic/route.ts'), 'utf8')
  const aliasRoute = readFileSync(join(process.cwd(), 'app/api/profile/alias-options/route.ts'), 'utf8')

  assert.match(source, /select\('display_name, gender, department, height, body_type, hair_density, year'\)/)
  assert.match(source, /profile\?\.gender === 'male' \|\| profile\?\.gender === 'female'/)
  assert.match(source, /validLegacyText\(profile\?\.display_name, 2, 20\)/)
  assert.match(source, /validLegacyText\(profile\?\.department, 1, 120\)/)
  assert.doesNotMatch(source, /profile\?\.school === '부산대학교'/)
  assert.match(aliasRoute, /profile_display_name_claims/)
  assert.match(aliasRoute, /eq\('user_id', user\.id\)/)
  assert.match(aliasRoute, /companionAlias[\s\S]*claimResult\.data\?\.display_name/)
})
