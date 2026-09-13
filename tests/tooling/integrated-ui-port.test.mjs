import assert from 'node:assert/strict'
import test from 'node:test'
import * as runtime from '../../scripts/qa/integrated-ui-config.mjs'

const local = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56421',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-test',
  SUPABASE_SERVICE_ROLE_KEY: 'local-test',
  PHONE_VERIFICATION_DIGEST_SECRET: 'local-test',
  PROFILE_ALIAS_SIGNING_SECRET: 'local-test',
  SUPABASE_PHONE_OTP_TTL_SECONDS: '60',
}

test('port selection defaults to 3010 and accepts only explicit 3004 or 3010', () => {
  assert.equal(typeof runtime.resolveIntegratedUiPort, 'function')
  assert.equal(runtime.resolveIntegratedUiPort([]), '3010')
  for (const port of ['3004', '3010']) assert.equal(runtime.resolveIntegratedUiPort(['--port', port]), port)
  for (const args of [['3004'], ['--port'], ['--port', '3000'], ['--port', '03004'], ['--port', '3004', '--live'], ['--port', '3004;echo']]) {
    assert.throws(() => runtime.resolveIntegratedUiPort(args), /port/)
  }
})

test('parallel ports use separate Next outputs while preserving local Auth and payment guards', () => {
  for (const mode of ['--live-local', '--offline-ui']) {
    const existing = runtime.integratedUiEnvironment(local, mode)
    const moved = runtime.integratedUiEnvironment(local, mode, '3004')
    assert.equal(existing.NEXT_PUBLIC_APP_ORIGIN, 'http://localhost:3010')
    assert.equal(moved.NEXT_PUBLIC_APP_ORIGIN, 'http://localhost:3004')
    assert.equal(moved.NEXT_DIST_DIR, `${existing.NEXT_DIST_DIR}-3004`)
    assert.equal(moved.NEXT_PUBLIC_DEV_AUTH_BYPASS, 'false')
    assert.equal(moved.TOSS_SECRET_KEY, '')
    assert.equal(moved.NEXT_PUBLIC_SUPABASE_URL, mode === '--live-local' ? local.NEXT_PUBLIC_SUPABASE_URL : '')
  }
})

test('direct environment calls reject unsupported ports and remote databases', () => {
  assert.throws(() => runtime.integratedUiEnvironment(local, '--live-local', '3000'), /port/)
  assert.throws(() => runtime.integratedUiEnvironment({ ...local, NEXT_PUBLIC_SUPABASE_URL: 'https://remote.supabase.co' }, '--live-local', '3004'), /isolated/)
})
