import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const modulePath = '../../scripts/qa/integrated-runtime-environment.mjs'
const runtime = existsSync(new URL(modulePath, import.meta.url)) ? await import(modulePath) : {}
const jwt = role => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.local-test-signature`
const status = { API_URL: 'http://127.0.0.1:56421', ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt('service_role') }
const secrets = { phoneDigest: 'a'.repeat(64), profileAlias: 'b'.repeat(64) }
const authEnv = {
  GOTRUE_EXTERNAL_PHONE_ENABLED: 'true', GOTRUE_SMS_AUTOCONFIRM: 'false',
  GOTRUE_SMS_PROVIDER: 'twilio', GOTRUE_SMS_OTP_EXP: '6000',
  GOTRUE_SMS_TEST_OTP: '821000000001:100001,821000000002:100002,821000000003:100003,821000000004:100004',
  GOTRUE_SMS_TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
  GOTRUE_SMS_TWILIO_MESSAGE_SERVICE_SID: 'MG00000000000000000000000000000000',
  GOTRUE_SMS_TWILIO_AUTH_TOKEN: 'local-test-only-not-a-provider-token',
}

test('live launcher requires exact test OTP mappings and dummy-only SMS settings', () => {
  assert.equal(typeof runtime.validateIntegratedLocalAuthEnvironment, 'function')
  const list = value => Object.entries(value).map(([key, val]) => `${key}=${val}`)
  assert.equal(runtime.validateIntegratedLocalAuthEnvironment(list(authEnv)), '6000')
  for (const override of [{ GOTRUE_SMS_TEST_OTP: '' }, { GOTRUE_SMS_TEST_OTP: '821000000001:000000' }, { GOTRUE_SMS_TWILIO_AUTH_TOKEN: 'a-real-provider-key' }, { GOTRUE_EXTERNAL_PHONE_ENABLED: 'false' }, { GOTRUE_SMS_AUTOCONFIRM: 'true' }]) {
    assert.throws(() => runtime.validateIntegratedLocalAuthEnvironment(list({ ...authEnv, ...override })))
  }
})

test('runtime uses only the isolated status credentials and provider SMS TTL', () => {
  assert.equal(typeof runtime.createIntegratedRuntimeEnvironment, 'function')
  const env = runtime.createIntegratedRuntimeEnvironment(status, secrets, '60')
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, status.API_URL)
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, status.SERVICE_ROLE_KEY)
  assert.equal(env.SUPABASE_PHONE_OTP_TTL_SECONDS, '60')
  assert.equal(env.PHONE_VERIFICATION_DIGEST_SECRET, secrets.phoneDigest)
})

test('runtime rejects another DB project and wrong credential roles', () => {
  assert.equal(typeof runtime.createIntegratedRuntimeEnvironment, 'function')
  for (const override of [{ API_URL: 'https://remote.supabase.co' }, { API_URL: 'http://127.0.0.1:56321' }, { ANON_KEY: jwt('service_role') }, { SERVICE_ROLE_KEY: jwt('anon') }]) {
    assert.throws(() => runtime.createIntegratedRuntimeEnvironment({ ...status, ...override }, secrets, '60'))
  }
})

test('runtime fails closed when provider TTL or stable local secrets are unavailable', () => {
  assert.equal(typeof runtime.createIntegratedRuntimeEnvironment, 'function')
  for (const ttl of ['', 'NaN', '0', '59', '1.5', 'Infinity']) assert.throws(() => runtime.createIntegratedRuntimeEnvironment(status, secrets, ttl))
  assert.throws(() => runtime.createIntegratedRuntimeEnvironment(status, { ...secrets, phoneDigest: 'short' }, '60'))
})

test('local application challenge expires no later than the observed provider OTP', () => {
  assert.equal(runtime.createIntegratedRuntimeEnvironment(status, secrets, '6000').SUPABASE_PHONE_OTP_TTL_SECONDS, '3600')
  assert.equal(runtime.createIntegratedRuntimeEnvironment(status, secrets, '300').SUPABASE_PHONE_OTP_TTL_SECONDS, '300')
})

test('offline recovery screen explains mode and does not encourage an endless retry', () => {
  const page = readFileSync('app/auth/service-unavailable/page.tsx', 'utf8')
  assert.match(page, /process.env.NODE_ENV === 'development'[\s\S]*?process.env.QUANTUM_LOCAL_RUNTIME_MODE === 'offline-ui'/)
  assert.match(page, /공개 화면 검수 모드예요/)
  assert.match(page, /returnTo && !isOfflineUi/)
  assert.doesNotMatch(page, /계정이나 프로필 데이터를 열거나 바꾸지 않았어요/)
})

test('one-command live launcher reads dedicated status without starting or resetting a DB', () => {
  const launcher = readFileSync('scripts/qa/serve-integrated-local.mjs', 'utf8')
  assert.match(launcher, /supabase@2\.116\.0/)
  assert.match(launcher, /'status', '--workdir', INTEGRATED_STACK.runtimeDirectory/)
  assert.match(launcher, /validateIntegratedLocalAuthEnvironment\(authEnv\)/)
  assert.match(launcher, /runtime-secrets\.json/)
  assert.match(launcher, /flag: 'wx'/)
  assert.doesNotMatch(launcher, /'reset'|'stop'|--no-backup|console\.log\(status/)
})
