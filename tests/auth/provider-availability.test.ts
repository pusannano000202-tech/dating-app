import test from 'node:test'
import assert from 'node:assert/strict'

import { isOAuthProviderEnabled } from '../../lib/auth/provider-availability'

test('OAuth preflight accepts only the requested enabled Supabase provider', async () => {
  const requests: Array<{ url: string; apikey: string }> = []
  const googleEnabled = await isOAuthProviderEnabled({
    provider: 'google',
    supabaseUrl: 'https://project.supabase.co/',
    publicKey: 'publishable-key',
    fetcher: async (url, init) => {
      requests.push({ url, apikey: init.headers.apikey })
      return {
        ok: true,
        json: async () => ({ external: { google: true, kakao: false } }),
      }
    },
  })
  const kakaoEnabled = await isOAuthProviderEnabled({
    provider: 'kakao',
    supabaseUrl: 'https://project.supabase.co',
    publicKey: 'publishable-key',
    fetcher: async () => ({
      ok: true,
      json: async () => ({ external: { google: true, kakao: false } }),
    }),
  })

  assert.equal(googleEnabled, true)
  assert.equal(kakaoEnabled, false)
  assert.deepEqual(requests, [
    {
      url: 'https://project.supabase.co/auth/v1/settings',
      apikey: 'publishable-key',
    },
  ])
})

test('OAuth preflight fails closed for invalid config, malformed settings, and network errors', async () => {
  const base = {
    provider: 'google' as const,
    publicKey: 'publishable-key',
    fetcher: async () => ({ ok: true, json: async () => ({ external: { google: true } }) }),
  }

  assert.equal(await isOAuthProviderEnabled({ ...base, supabaseUrl: '' }), false)
  assert.equal(await isOAuthProviderEnabled({ ...base, supabaseUrl: 'https://project.supabase.co', publicKey: '' }), false)
  assert.equal(await isOAuthProviderEnabled({
    ...base,
    supabaseUrl: 'https://project.supabase.co',
    fetcher: async () => ({ ok: false, json: async () => ({}) }),
  }), false)
  assert.equal(await isOAuthProviderEnabled({
    ...base,
    supabaseUrl: 'https://project.supabase.co',
    fetcher: async () => ({ ok: true, json: async () => ({ external: 'invalid' }) }),
  }), false)
  assert.equal(await isOAuthProviderEnabled({
    ...base,
    supabaseUrl: 'https://project.supabase.co',
    fetcher: async () => {
      throw new Error('network unavailable')
    },
  }), false)
})
