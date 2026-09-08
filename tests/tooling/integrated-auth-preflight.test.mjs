import assert from 'node:assert/strict'
import test from 'node:test'
import { preflightIntegratedLocalAuth } from '../../scripts/qa/integrated-auth-preflight.mjs'

const localAuth = 'http://127.0.0.1:56421'
const settings = { external: { email: true, phone: true }, disable_signup: false, phone_autoconfirm: false }

test('local Auth preflight requests only the isolated settings endpoint with the public key', async () => {
  let request
  const result = await preflightIntegratedLocalAuth({
    url: localAuth,
    publicKey: 'public-test-key',
    fetchImpl: async (url, init) => {
      request = { url, init }
      return new Response(JSON.stringify(settings), { status: 200 })
    },
  })
  assert.equal(result, 'passed')
  assert.equal(request.url, `${localAuth}/auth/v1/settings`)
  assert.equal(request.init.headers.apikey, 'public-test-key')
  assert.equal(request.init.method, 'GET')
})

test('local Auth preflight fails closed for unavailable Auth without exposing the response body', async () => {
  await assert.rejects(
    () => preflightIntegratedLocalAuth({
      url: localAuth,
      publicKey: 'public-test-key',
      fetchImpl: async () => new Response('sensitive body', { status: 503 }),
    }),
    /local_auth_unavailable/,
  )
})

test('local Auth preflight rejects a local Auth service with phone OTP disabled', async () => {
  await assert.rejects(
    () => preflightIntegratedLocalAuth({
      url: localAuth,
      publicKey: 'public-test-key',
      fetchImpl: async () => new Response(JSON.stringify({ ...settings, external: { email: true, phone: false } }), { status: 200 }),
    }),
    /local_auth_phone_unavailable/,
  )
})

test('local Auth preflight rejects malformed settings and every non-isolated URL', async () => {
  await assert.rejects(
    () => preflightIntegratedLocalAuth({
      url: localAuth,
      publicKey: 'public-test-key',
      fetchImpl: async () => new Response(JSON.stringify({ external: {} }), { status: 200 }),
    }),
    /local_auth_invalid_settings/,
  )
  await assert.rejects(
    () => preflightIntegratedLocalAuth({
      url: 'http://localhost:56421',
      publicKey: 'public-test-key',
      fetchImpl: async () => new Response(JSON.stringify(settings), { status: 200 }),
    }),
    /isolated_local_auth_required/,
  )
})
