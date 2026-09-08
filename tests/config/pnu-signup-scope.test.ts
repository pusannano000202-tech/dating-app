import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  PILOT_SIGNUP_SCHOOL_THEMES,
  SCHOOL_THEMES,
} from '../../lib/school-theme'

test('pilot signup keeps the future school catalog but exposes only PNU', () => {
  assert.ok(SCHOOL_THEMES.length > 1)
  assert.deepEqual(PILOT_SIGNUP_SCHOOL_THEMES.map((school) => school.id), ['pnu'])
})

test('basic profile school step is locked to the pilot selector in production UI', () => {
  const source = readFileSync('components/profile/BasicInfoForm.tsx', 'utf8')

  assert.match(source, /resolveSchoolTheme\(PILOT_SIGNUP_SCHOOL_THEMES\[0\]\.id\)/)
  assert.match(source, /setSchoolSelected\(\(value\) => !value\)/)
  assert.match(source, /본인이 부산대 구성원이라면 눌러서 선택/)
  assert.match(source, /학교 인증 마크가 아니라 본인의 직접 선택이에요/)
  assert.match(source, /school_scope:\s*'pnu_self_selected'/)
  assert.doesNotMatch(source, /SORTED_SCHOOL_THEMES\.map/)
})
