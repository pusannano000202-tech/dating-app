import assert from 'node:assert/strict'
import test from 'node:test'
import { integratedLocalConfig, INTEGRATED_STACK } from '../../scripts/qa/integrated-local-config.mjs'

test('integrated stack isolates test OTP with a dummy provider and no live SMS credentials', () => {
  const config = integratedLocalConfig()
  assert.equal(INTEGRATED_STACK.projectId, 'quantum-integrated-campus-20260905')
  assert.match(config, /port = 56421/)
  assert.match(config, /site_url = "http:\/\/localhost:3010"/)
  assert.match(config, /\[auth.sms\][\s\S]*enable_confirmations = true/)
  assert.match(config, /max_frequency = "60s"/)
  assert.match(config, /\[auth.sms.test_otp\]/)
  assert.match(config, /\[auth.sms.twilio\]\nenabled = true/)
  assert.match(config, /account_sid = "AC00000000000000000000000000000000"/)
  assert.match(config, /auth_token = "local-test-only-not-a-provider-token"/)
  assert.doesNotMatch(config, /env\(/)
  assert.doesNotMatch(config, /quantum-tonight-live-local|5632[0-4]|5432[0-4]/)
})
