import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

test('school email enrollment surfaces are retired', () => {
  assert.equal(existsSync(join(ROOT, 'app/profile/school/page.tsx')), false)
  assert.equal(existsSync(join(ROOT, 'app/api/school-email/request/route.ts')), false)
  assert.equal(existsSync(join(ROOT, 'app/api/school-email/verify/route.ts')), false)
  assert.equal(existsSync(join(ROOT, 'lib/auth/school-email.ts')), false)

  const login = read('app/(auth)/login/page.tsx')
  const layout = read('app/layout.tsx')
  assert.doesNotMatch(login, /학교 인증|school-email/)
  assert.doesNotMatch(layout, /학교 인증/)
})

test('Campus Seven and department discovery no longer require school email verification', () => {
  const applyRoute = read('app/api/campus-seven/apply/route.ts')
  const campusSeven = read('components/matching/campus-seven/CampusSevenExperience.tsx')
  const entry = read('components/matching/campus-seven/CampusSevenMatchEntry.tsx')
  const friendRoute = read('app/api/friends/department-sync/route.ts')
  const friendPanel = read('components/matching/group-create/DepartmentAutoFriendPanel.tsx')

  for (const source of [applyRoute, campusSeven, entry, friendRoute, friendPanel]) {
    assert.doesNotMatch(source, /school_verification_required|학교 이메일 인증|학교 인증 성인/)
  }
  assert.match(applyRoute, /adult_eligibility/)
  assert.match(applyRoute, /campus-seven-v3/)
})

test('retirement migration removes school email gates while preserving consent and profile checks', () => {
  const migrationName = readdirSync(join(ROOT, 'supabase/migrations'))
    .find((name) => name.endsWith('_retire_school_email_gate.sql'))

  assert.ok(migrationName)
  const migration = read(`supabase/migrations/${migrationName}`)

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.apply_to_campus_seven/)
  assert.match(migration, /"adult_eligibility": true/)
  assert.match(migration, /complete_profile_required/)
  assert.match(migration, /profile_photo_required/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_department_friend_suggestions/)
  assert.match(migration, /department_discovery_consent_required/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.verify_school_email_code/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.school_email_verification_codes/)
  assert.doesNotMatch(migration, /school_verification_required/)
})
