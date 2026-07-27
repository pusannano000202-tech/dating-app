import test from 'node:test'
import assert from 'node:assert/strict'

import { isGoogleOAuthProviderEnabled } from '../../lib/auth/provider-availability'

test('Google OAuth preflight accepts only an enabled Supabase provider', async () => {
  const requests: Array<{ url: string; apikey: string }> = []
  const enabled = await isGoogleOAuthProviderEnabled({
    supabaseUrl: 'https://project.supabase.co',
    publicKey: 'publishable-key',
    fetcher: async (url, init) => {
      requests.push({ url, apikey: init.headers.apikey })
      return {
        ok: true,
        json: async () => ({ external: { google: true } }),
      }
    },
  })

  assert.equal(enabled, true)
  assert.deepEqual(requests, [
    {
      url: 'https://project.supabase.co/auth/v1/settings',
      apikey: 'publishable-key',
    },
  ])
})

test('Google OAuth preflight rejects disabled or unavailable providers', async () => {
  const disabled = await isGoogleOAuthProviderEnabled({
    supabaseUrl: 'https://project.supabase.co',
    publicKey: 'publishable-key',
    fetcher: async () => ({
      ok: true,
      json: async () => ({ external: { google: false } }),
    }),
  })
  const unavailable = await isGoogleOAuthProviderEnabled({
    supabaseUrl: 'https://project.supabase.co',
    publicKey: 'publishable-key',
    fetcher: async () => {
      throw new Error('network unavailable')
    },
  })

  assert.equal(disabled, false)
  assert.equal(unavailable, false)
})
