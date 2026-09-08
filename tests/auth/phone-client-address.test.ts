import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePhoneClientAddress } from '../../lib/auth/phone-client-address'

const headers = (values: Record<string, string>) => ({ get: (key: string) => values[key] ?? null })
test('untrusted forwarded headers cannot rotate the OTP rate-limit identity', () => {
  const forged = headers({ 'x-forwarded-for': '203.0.113.1', 'cf-connecting-ip': '203.0.113.2', 'x-vercel-forwarded-for': '203.0.113.3' })
  assert.equal(resolvePhoneClientAddress(forged, { NODE_ENV: 'production' }), null)
  assert.equal(resolvePhoneClientAddress(forged, { NODE_ENV: 'development' }), 'local-shared')
})
test('only the platform-injected single IP is accepted on Vercel', () => {
  const env = { NODE_ENV: 'production', VERCEL: '1' }
  assert.equal(resolvePhoneClientAddress(headers({ 'x-vercel-forwarded-for': '203.0.113.3' }), env), '203.0.113.3')
  for (const value of ['', '999.1.1.1', '1.1.1.1, 2.2.2.2', '::invalid']) {
    assert.equal(resolvePhoneClientAddress(headers({ 'x-vercel-forwarded-for': value, 'x-forwarded-for': '203.0.113.1' }), env), null)
  }
  assert.equal(resolvePhoneClientAddress(headers({ 'x-vercel-forwarded-for': '2001:db8::1' }), env), '2001:db8::1')
})
