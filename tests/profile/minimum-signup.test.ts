import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  calculateAgeOnDate,
  resolveProfileEligibility,
  type ProfileEligibilityInput,
} from '../../lib/profile/eligibility'
import {
  generateAliasOptions,
  issueAliasTicket,
  verifyAliasTicket,
} from '../../lib/profile/alias-options'

const ROOT = process.cwd()
const TODAY = new Date('2026-09-05T12:00:00.000Z')

function completeMinimum(overrides: Partial<ProfileEligibilityInput> = {}): ProfileEligibilityInput {
  return {
    accountAuthenticated: true,
    authPhoneE164: '+821012345678',
    authPhoneConfirmedAt: '2026-09-05T11:00:00.000Z',
    communityProfile: {
      birthDate: '2000-09-05',
      schoolScope: 'pnu_self_selected',
      department: '컴퓨터공학부',
      communityGender: 'female',
      displayName: '살구새벽',
      aliasClaimedAt: '2026-09-05T11:05:00.000Z',
    },
    worldcupCompletedAt: null,
    photoCount: 0,
    privateAppearanceReady: false,
    matchingProfileGender: 'female',
    ...overrides,
  }
}

test('age eligibility uses private date of birth and exact 19 to 35 birthday boundaries', () => {
  assert.equal(calculateAgeOnDate('2007-09-05', TODAY), 19)
  assert.equal(calculateAgeOnDate('2007-09-06', TODAY), 18)
  assert.equal(calculateAgeOnDate('1990-09-06', TODAY), 35)
  assert.equal(calculateAgeOnDate('1990-09-05', TODAY), 36)
  assert.equal(calculateAgeOnDate('2000-02-30', TODAY), null)
})

test('minimum community signup stays separate from full profile and matching readiness', () => {
  const otherGender = resolveProfileEligibility(completeMinimum({
    communityProfile: {
      ...completeMinimum().communityProfile!,
      communityGender: 'other',
    },
    worldcupCompletedAt: '2026-09-05T11:10:00.000Z',
    photoCount: 3,
    privateAppearanceReady: true,
  }), TODAY)

  assert.equal(otherGender.minimumSignupComplete, true)
  assert.equal(otherGender.profileOnboardingComplete, true)
  assert.equal(otherGender.matchingReady, false)
  assert.ok(otherGender.missingReasons.includes('matching_gender_unsupported'))

  const matching = resolveProfileEligibility(completeMinimum({
    worldcupCompletedAt: '2026-09-05T11:10:00.000Z',
    photoCount: 1,
    privateAppearanceReady: true,
  }), TODAY)
  assert.equal(matching.matchingReady, true)

  const preservedMismatch = resolveProfileEligibility(completeMinimum({
    matchingProfileGender: 'male',
    worldcupCompletedAt: '2026-09-05T11:10:00.000Z',
    photoCount: 1,
    privateAppearanceReady: true,
  }), TODAY)
  assert.equal(preservedMismatch.matchingReady, false)
  assert.ok(preservedMismatch.missingReasons.includes('matching_gender_unsupported'))
})

test('a photo or legacy completion boolean cannot bypass verified phone and minimum signup', () => {
  const result = resolveProfileEligibility({
    ...completeMinimum(),
    authPhoneE164: null,
    authPhoneConfirmedAt: null,
    communityProfile: null,
    worldcupCompletedAt: '2026-09-05T11:10:00.000Z',
    photoCount: 3,
    privateAppearanceReady: true,
    legacyIsProfileComplete: true,
  }, TODAY)

  assert.equal(result.minimumSignupComplete, false)
  assert.equal(result.profileOnboardingComplete, false)
  assert.equal(result.matchingReady, false)
  assert.ok(result.missingReasons.includes('phone_unverified'))
  assert.ok(result.missingReasons.includes('minimum_profile_missing'))
})

test('profile eligibility accepts both GoTrue raw and E.164 Korean mobile storage without accepting other formats', () => {
  for (const authPhoneE164 of ['821012345678', '+821012345678']) {
    const eligibility = resolveProfileEligibility(completeMinimum({ authPhoneE164 }), TODAY)
    assert.equal(eligibility.minimumSignupComplete, true)
    assert.equal(eligibility.missingReasons.includes('phone_unverified'), false)
  }

  for (const authPhoneE164 of ['+82101234567', '0821012345678', '821112345678', 'not-a-phone']) {
    const eligibility = resolveProfileEligibility(completeMinimum({ authPhoneE164 }), TODAY)
    assert.equal(eligibility.minimumSignupComplete, false)
    assert.equal(eligibility.missingReasons.includes('phone_unverified'), true)
  }
})

test('alias choices are server-issued, unique, user-bound, selection-bound and expiring', () => {
  const options = generateAliasOptions(() => 0.314159)
  assert.equal(options.length, 3)
  assert.equal(new Set(options).size, 3)
  assert.ok(options.every((option) => option.length >= 2 && option.length <= 20))

  const issuedAt = new Date('2026-09-05T11:00:00.000Z')
  const ticket = issueAliasTicket({
    userId: '11111111-1111-4111-8111-111111111111',
    options,
    now: issuedAt,
    secret: 'test-secret-that-is-long-enough',
  })

  assert.equal(verifyAliasTicket({
    ticket,
    selectedAlias: options[0],
    userId: '11111111-1111-4111-8111-111111111111',
    now: new Date('2026-09-05T11:09:59.000Z'),
    secret: 'test-secret-that-is-long-enough',
  }).ok, true)
  assert.equal(verifyAliasTicket({
    ticket,
    selectedAlias: '직접입력한이름',
    userId: '11111111-1111-4111-8111-111111111111',
    now: new Date('2026-09-05T11:01:00.000Z'),
    secret: 'test-secret-that-is-long-enough',
  }).ok, false)
  assert.equal(verifyAliasTicket({
    ticket,
    selectedAlias: options[0],
    userId: '22222222-2222-4222-8222-222222222222',
    now: new Date('2026-09-05T11:01:00.000Z'),
    secret: 'test-secret-that-is-long-enough',
  }).ok, false)
  assert.equal(verifyAliasTicket({
    ticket: `${ticket.slice(0, -1)}x`,
    selectedAlias: options[0],
    userId: '11111111-1111-4111-8111-111111111111',
    now: new Date('2026-09-05T11:01:00.000Z'),
    secret: 'test-secret-that-is-long-enough',
  }).ok, false)
  assert.equal(verifyAliasTicket({
    ticket,
    selectedAlias: options[0],
    userId: '11111111-1111-4111-8111-111111111111',
    now: new Date('2026-09-05T11:10:01.000Z'),
    secret: 'test-secret-that-is-long-enough',
  }).ok, false)
})

test('minimum signup migration keeps DOB and OTP state private and saves alias plus profile atomically', () => {
  const path = join(ROOT, 'supabase/migrations/20260905100000_minimum_community_signup.sql')
  let source = ''
  try { source = readFileSync(path, 'utf8') } catch {}

  assert.match(source, /CREATE TABLE quantum_private\.community_member_profiles/i)
  assert.match(source, /birth_date DATE NOT NULL/i)
  assert.match(source, /p_birth_date IS NULL THEN RAISE EXCEPTION 'invalid_birth_date'/i)
  assert.match(source, /school_scope TEXT NOT NULL/i)
  assert.match(source, /community_gender TEXT NOT NULL/i)
  assert.match(source, /CREATE TABLE quantum_private\.phone_otp_challenges/i)
  assert.doesNotMatch(source, /otp_(?:code|token)\s+TEXT/i)
  assert.doesNotMatch(source, /phone_e164\s+TEXT/i)
  assert.match(source, /complete_minimum_signup/i)
  assert.match(source, /profile_display_name_claims[\s\S]*community_member_profiles[\s\S]*profiles/i)
  assert.match(source, /is_profile_matching_ready/i)
  assert.match(source, /private_appearance_scores/i)
  assert.match(source, /ENABLE ROW LEVEL SECURITY/i)
  assert.match(source, /REVOKE ALL ON TABLE quantum_private\.community_member_profiles/i)
  assert.doesNotMatch(source, /INSERT INTO quantum_private\.community_member_profiles[\s\S]{0,500}profiles\.age/i)
})

test('forward-only GoTrue phone storage patch accepts only raw or E.164 Korean mobiles and canonicalizes the public copy', () => {
  const source = readFileSync(
    join(ROOT, 'supabase/migrations/20260906081607_accept_gotrue_phone_storage.sql'),
    'utf8',
  )
  const databaseRegression = readFileSync(
    join(ROOT, 'tests/auth/phone-auth-storage-format.sql'),
    'utf8',
  )

  assert.match(source, /CREATE OR REPLACE FUNCTION quantum_private\.resolve_profile_readiness/i)
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.get_my_minimum_signup/i)
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.complete_minimum_signup/i)
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.complete_phone_otp_challenge/i)
  assert.match(source, /\^\(\\\+\)\?8210\[0-9\]\{8\}\$/)
  assert.match(source, /CASE WHEN v_phone ~ '\^8210\[0-9\]\{8\}\$' THEN '\+' \|\| v_phone ELSE v_phone END/)
  assert.match(source, /CASE WHEN v_auth_phone ~ '\^8210\[0-9\]\{8\}\$' THEN '\+' \|\| v_auth_phone ELSE v_auth_phone END/)
  assert.doesNotMatch(source, /\^\\\+8210\[0-9\]\{8\}\$/)
  assert.match(source, /SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
  assert.match(source, /REVOKE ALL ON FUNCTION quantum_private\.resolve_profile_readiness\(UUID\)/i)
  assert.match(source, /GRANT EXECUTE ON FUNCTION public\.get_my_minimum_signup\(\) TO authenticated/i)
  assert.match(source, /GRANT EXECUTE ON FUNCTION public\.complete_minimum_signup[\s\S]*?TO service_role/i)
  assert.match(source, /GRANT EXECUTE ON FUNCTION public\.complete_phone_otp_challenge[\s\S]*?TO service_role/i)
  assert.doesNotMatch(source, /pg_proc/i)
  assert.match(databaseRegression, /^BEGIN;/m)
  assert.match(databaseRegression, /'821012345678'/)
  assert.match(databaseRegression, /'\+821012345678'/)
  assert.match(databaseRegression, /complete_phone_otp_challenge/)
  assert.match(databaseRegression, /complete_minimum_signup/)
  assert.match(databaseRegression, /resolve_profile_readiness/)
  assert.match(databaseRegression, /get_my_minimum_signup/)
  assert.match(databaseRegression, /ROLLBACK;\s*$/m)
})

test('signup UI uses phone verification, button aliases, private DOB, PNU selection and companion gender', () => {
  const form = readFileSync(join(ROOT, 'components/profile/BasicInfoForm.tsx'), 'utf8')
  const phonePanel = readFileSync(join(ROOT, 'components/profile/PhoneVerificationPanel.tsx'), 'utf8')
  const page = readFileSync(join(ROOT, 'app/profile/basic/page.tsx'), 'utf8')
  const basicRoute = readFileSync(join(ROOT, 'app/api/profile/basic/route.ts'), 'utf8')

  assert.match(phonePanel, /인증된 휴대폰/)
  assert.match(form, /birth_date/)
  assert.match(form, /type="button"[\s\S]{0,240}별칭/)
  assert.doesNotMatch(form, /placeholder="예: 충현"/)
  assert.match(form, /기타/)
  assert.match(form, /응답 안 함/)
  assert.match(form, /모름/)
  assert.match(page, /\/api\/profile\/basic/)
  assert.match(basicRoute, /complete_minimum_signup/)
  assert.doesNotMatch(basicRoute, /claim_profile_display_name/)
  assert.doesNotMatch(basicRoute, /admin\.from\('profiles'\)\.upsert/)
})
