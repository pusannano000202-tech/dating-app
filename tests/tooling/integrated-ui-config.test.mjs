import assert from 'node:assert/strict'
import test from 'node:test'
import { integratedUiEnvironment, integratedUiLaunchInfo } from '../../scripts/qa/integrated-ui-config.mjs'

test('offline UI uses the real application without Auth bypass, remote DB or payment keys', () => {
  const env = integratedUiEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'https://remote.supabase.co', TOSS_SECRET_KEY: 'do-not-use', NEXT_PUBLIC_APP_ORIGIN: 'https://remote.example' }, '--offline-ui')
  assert.equal(env.NEXT_PUBLIC_APP_ORIGIN, 'http://localhost:3010')
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, '')
  assert.equal(env.TOSS_SECRET_KEY, '')
  assert.equal(env.NEXT_PUBLIC_DEV_AUTH_BYPASS, 'false')
  assert.equal(env.NEXT_DIST_DIR, '.next-integrated-qa')
  assert.equal(env.QUANTUM_LOCAL_RUNTIME_MODE, 'offline-ui')
})
test('live local mode rejects other projects and does not inherit payment authority', () => {
  assert.throws(() => integratedUiEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56321' }, '--live-local'))
  const env = integratedUiEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56421', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-test', SUPABASE_SERVICE_ROLE_KEY: 'local-test', PHONE_VERIFICATION_DIGEST_SECRET: 'local-test', PROFILE_ALIAS_SIGNING_SECRET: 'local-test', SUPABASE_PHONE_OTP_TTL_SECONDS: '60', TOSS_SECRET_KEY: 'do-not-use' }, '--live-local')
  assert.equal(env.TOSS_SECRET_KEY, '')
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:56421')
  assert.equal(env.NEXT_DIST_DIR, '.next-integrated-live')
  assert.equal(env.QUANTUM_LOCAL_RUNTIME_MODE, 'live-local')
})

test('launch information distinguishes offline review from a preflighted live-local login', () => {
  const offline = integratedUiEnvironment({}, '--offline-ui')
  assert.deepEqual(integratedUiLaunchInfo(offline, '--offline-ui'), {
    origin: 'http://localhost:3010', entryUrl: '/community', mode: '--offline-ui', authBypass: false, databaseStartedByLauncher: false, realPayments: false,
  })
  const live = integratedUiEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56421', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-test', SUPABASE_SERVICE_ROLE_KEY: 'local-test', PHONE_VERIFICATION_DIGEST_SECRET: 'local-test', PROFILE_ALIAS_SIGNING_SECRET: 'local-test', SUPABASE_PHONE_OTP_TTL_SECONDS: '60' }, '--live-local')
  assert.deepEqual(integratedUiLaunchInfo(live, '--live-local', 'passed'), {
    origin: 'http://localhost:3010', entryUrl: '/login', mode: '--live-local', authBypass: false, databaseStartedByLauncher: false, realPayments: false, authPreflight: 'passed',
  })
})
