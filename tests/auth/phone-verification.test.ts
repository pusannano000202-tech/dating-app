import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  PHONE_OTP_LIMITS,
  digestPhoneVerificationValue,
  isPhoneAllowedForRuntime,
  normalizeKoreanMobilePhone,
  parsePhoneOtpCode,
  readPhoneOtpProviderConfig,
  resolvePhoneVerificationPurpose,
  toPublicPhoneVerificationError,
  validatePhoneChallengeBinding,
  type PhoneChallengeBinding,
} from '../../lib/auth/phone-verification'

const ROOT = process.cwd()

test('Korean mobile numbers normalize to E.164 and non-010 or foreign numbers fail closed', () => {
  assert.equal(normalizeKoreanMobilePhone('010-1234-5678'), '+821012345678')
  assert.equal(normalizeKoreanMobilePhone('+82 10 1234 5678'), '+821012345678')
  assert.equal(normalizeKoreanMobilePhone('821012345678'), '+821012345678')
  assert.equal(normalizeKoreanMobilePhone('02-123-4567'), null)
  assert.equal(normalizeKoreanMobilePhone('+1 333 444 5555'), null)
})

test('OTP parser accepts only six digits and never coerces the secret', () => {
  assert.equal(parsePhoneOtpCode('012345'), '012345')
  assert.equal(parsePhoneOtpCode('12345'), null)
  assert.equal(parsePhoneOtpCode('12345a'), null)
  assert.equal(parsePhoneOtpCode(123456), null)
})

test('local application limits are fixed at the approved security floor', () => {
  assert.deepEqual(PHONE_OTP_LIMITS, {
    resendCooldownSeconds: 60,
    maxAttemptsPerChallenge: 5,
    startsPerPhonePerHour: 10,
    startsPerIpPerHour: 100,
    startsPerAccountPerHour: 10,
  })
})

test('provider OTP TTL must be explicitly configured and is never guessed', () => {
  assert.deepEqual(readPhoneOtpProviderConfig({}), { ok: false, error: 'provider_config_invalid' })
  assert.deepEqual(
    readPhoneOtpProviderConfig({ SUPABASE_PHONE_OTP_TTL_SECONDS: '3600' }),
    { ok: true, otpTtlSeconds: 3600 },
  )
  assert.deepEqual(
    readPhoneOtpProviderConfig({ SUPABASE_PHONE_OTP_TTL_SECONDS: '7200' }),
    { ok: false, error: 'provider_config_invalid' },
  )
})

test('live-local runtime permits only the declared local phone test accounts', () => {
  const liveLocalEnv = {
    NODE_ENV: 'development',
    QUANTUM_LOCAL_RUNTIME_MODE: 'live-local',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56421',
  }

  for (const phone of ['+821000000001', '+821000000002', '+821000000003', '+821000000004']) {
    assert.equal(isPhoneAllowedForRuntime(phone, liveLocalEnv), true)
  }
  assert.equal(isPhoneAllowedForRuntime('+821012345678', liveLocalEnv), false)
  assert.equal(isPhoneAllowedForRuntime('+821000000001', { ...liveLocalEnv, NODE_ENV: 'production' }), false)
  assert.equal(isPhoneAllowedForRuntime('+821000000001', { ...liveLocalEnv, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:56421' }), false)
})

test('non-live-local runtime does not restrict the existing phone verification flow', () => {
  assert.equal(
    isPhoneAllowedForRuntime('+821012345678', { QUANTUM_LOCAL_RUNTIME_MODE: 'offline-ui' }),
    true,
  )
  assert.equal(isPhoneAllowedForRuntime('+821012345678', { NODE_ENV: 'production' }), true)
})

test('challenge binding rejects reuse, expiry, attempts, another session, phone, purpose or account', () => {
  const binding: PhoneChallengeBinding = {
    expiresAt: '2026-09-05T11:10:00.000Z',
    consumedAt: null,
    attemptCount: 0,
    sessionBindingHash: 'session-a',
    phoneHash: 'phone-a',
    purpose: 'link_existing_account',
    accountUserId: '11111111-1111-4111-8111-111111111111',
  }
  const valid = {
    challenge: binding,
    now: new Date('2026-09-05T11:09:59.000Z'),
    sessionBindingHash: 'session-a',
    phoneHash: 'phone-a',
    purpose: 'link_existing_account' as const,
    accountUserId: '11111111-1111-4111-8111-111111111111',
  }

  assert.equal(validatePhoneChallengeBinding(valid), null)
  assert.equal(validatePhoneChallengeBinding({ ...valid, challenge: { ...binding, consumedAt: '2026-09-05T11:02:00.000Z' } }), 'challenge_invalid')
  assert.equal(validatePhoneChallengeBinding({ ...valid, now: new Date('2026-09-05T11:10:00.000Z') }), 'challenge_invalid')
  assert.equal(validatePhoneChallengeBinding({ ...valid, challenge: { ...binding, attemptCount: 5 } }), 'challenge_invalid')
  assert.equal(validatePhoneChallengeBinding({ ...valid, sessionBindingHash: 'session-b' }), 'challenge_invalid')
  assert.equal(validatePhoneChallengeBinding({ ...valid, phoneHash: 'phone-b' }), 'challenge_invalid')
  assert.equal(validatePhoneChallengeBinding({ ...valid, purpose: 'signup_or_signin' }), 'challenge_invalid')
  assert.equal(validatePhoneChallengeBinding({ ...valid, accountUserId: '22222222-2222-4222-8222-222222222222' }), 'challenge_invalid')
})

test('purpose comes only from current authentication and digests are domain separated', () => {
  assert.equal(resolvePhoneVerificationPurpose(null), 'signup_or_signin')
  assert.equal(resolvePhoneVerificationPurpose('11111111-1111-4111-8111-111111111111'), 'link_existing_account')
  assert.notEqual(
    digestPhoneVerificationValue('same', 'secret-that-is-long-enough', 'phone'),
    digestPhoneVerificationValue('same', 'secret-that-is-long-enough', 'session'),
  )
})

test('public failures never reveal account existence or provider detail', () => {
  const failures = [
    'phone_already_registered',
    'user_not_found',
    'invalid_otp',
    'provider_timeout',
    'challenge_invalid',
  ]
  assert.deepEqual(new Set(failures.map(toPublicPhoneVerificationError)), new Set(['phone_verification_failed']))
})

test('phone routes use real Supabase OTP, bind the challenge, persist auth cookies and never log OTP or phone', () => {
  const start = readFileSync(join(ROOT, 'app/api/auth/phone/start/route.ts'), 'utf8')
  const verify = readFileSync(join(ROOT, 'app/api/auth/phone/verify/route.ts'), 'utf8')
  const login = readFileSync(join(ROOT, 'app/(auth)/login/page.tsx'), 'utf8')

  assert.match(start, /reserve_phone_otp_challenge/)
  assert.match(start, /isPhoneAllowedForRuntime\(normalizedPhone, process\.env\)/)
  assert.match(start, /error: 'local_test_phone_only'/)
  assert.match(start, /local_test_phone_only' \}, 400/)
  assert.match(start, /assertTrustedMutationOrigin/)
  assert.match(start, /signInWithOtp/)
  assert.match(start, /updateUser\(\{ phone:/)
  assert.match(start, /shouldCreateUser:\s*true/)
  assert.ok(
    start.indexOf('isPhoneAllowedForRuntime(normalizedPhone, process.env)') < start.indexOf('readOptionalUser'),
  )
  assert.ok(
    start.indexOf('isPhoneAllowedForRuntime(normalizedPhone, process.env)') < start.indexOf('reserve_phone_otp_challenge'),
  )
  assert.ok(
    start.indexOf('isPhoneAllowedForRuntime(normalizedPhone, process.env)') < start.indexOf('signInWithOtp'),
  )
  assert.match(verify, /reserve_phone_otp_attempt/)
  assert.match(verify, /assertTrustedMutationOrigin/)
  assert.match(verify, /type:\s*purpose === 'link_existing_account' \? 'phone_change' : 'sms'/)
  assert.match(verify, /complete_phone_otp_challenge/)
  assert.match(verify, /response\.cookies\.set/)
  assert.match(start, /Cache-Control['"],\s*['"]private, no-store/)
  assert.match(verify, /Cache-Control['"],\s*['"]private, no-store/)
  assert.doesNotMatch(`${start}\n${verify}`, /console\.(?:log|info|warn|error)/)
  assert.doesNotMatch(`${start}\n${verify}`, /otp:\s*otp|phone:\s*phone[^A-Za-z]/)
  assert.match(login, /PhoneVerificationPanel/)
  assert.match(login, /router\.replace\(continueTo\)/)
})

test('phone challenge migration applies cooldown, attempt and hourly limits without raw phone or OTP storage', () => {
  const source = readFileSync(
    join(ROOT, 'supabase/migrations/20260905100000_minimum_community_signup.sql'),
    'utf8',
  )

  assert.match(source, /INTERVAL '60 seconds'/)
  assert.match(source, /attempt_count\s*>=\s*5/)
  assert.match(source, /phone_hash[\s\S]*>=\s*10/)
  assert.match(source, /ip_hash[\s\S]*>=\s*100/)
  assert.match(source, /account_user_id[\s\S]*>=\s*10/)
  assert.match(source, /session_binding_hash/)
  assert.match(source, /purpose/)
  assert.match(source, /consumed_at/)
  assert.doesNotMatch(source, /otp_(?:code|token)\s+TEXT/i)
  assert.doesNotMatch(source, /phone_e164\s+TEXT/i)
})
