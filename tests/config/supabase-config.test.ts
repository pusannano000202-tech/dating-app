import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getSupabaseConfigIssue,
  getPublicAppOrigin,
  getSupabasePublicKey,
  isSupabaseConfigured,
} from '../../lib/utils'

const ORIGINAL_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN,
}

function setSupabaseEnv(
  url: string | undefined,
  anonKey: string | undefined,
  publishableKey?: string | undefined,
) {
  if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = url

  if (anonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey

  if (publishableKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey
}

test.afterEach(() => {
  setSupabaseEnv(
    ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_URL,
    ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
  if (ORIGINAL_ENV.NEXT_PUBLIC_APP_ORIGIN === undefined) delete process.env.NEXT_PUBLIC_APP_ORIGIN
  else process.env.NEXT_PUBLIC_APP_ORIGIN = ORIGINAL_ENV.NEXT_PUBLIC_APP_ORIGIN
})

test('isSupabaseConfigured rejects missing Supabase URL', () => {
  setSupabaseEnv(undefined, 'anon-key')

  assert.equal(isSupabaseConfigured(), false)
  assert.match(getSupabaseConfigIssue() ?? '', /URL/)
})

test('isSupabaseConfigured rejects placeholder Supabase URL', () => {
  setSupabaseEnv('https://placeholder.supabase.co', 'anon-key')

  assert.equal(isSupabaseConfigured(), false)
  assert.match(getSupabaseConfigIssue() ?? '', /URL/)
})

test('isSupabaseConfigured rejects missing anon key', () => {
  setSupabaseEnv('https://project.supabase.co', undefined)

  assert.equal(isSupabaseConfigured(), false)
  assert.match(getSupabaseConfigIssue() ?? '', /public key/)
})

test('isSupabaseConfigured rejects placeholder public keys', () => {
  setSupabaseEnv('https://project.supabase.co', 'placeholder-anon-key')

  assert.equal(isSupabaseConfigured(), false)
  assert.match(getSupabaseConfigIssue() ?? '', /public key/)

  setSupabaseEnv('https://project.supabase.co', undefined, 'your-publishable-key')

  assert.equal(isSupabaseConfigured(), false)
  assert.match(getSupabaseConfigIssue() ?? '', /public key/)
})

test('isSupabaseConfigured accepts real Supabase URL and anon key', () => {
  setSupabaseEnv('https://project.supabase.co', 'anon-key')

  assert.equal(isSupabaseConfigured(), true)
  assert.equal(getSupabaseConfigIssue(), null)
  assert.equal(getSupabasePublicKey(), 'anon-key')
})

test('isSupabaseConfigured accepts real Supabase URL and publishable key', () => {
  setSupabaseEnv('https://project.supabase.co', undefined, 'sb_publishable_abc123')

  assert.equal(isSupabaseConfigured(), true)
  assert.equal(getSupabaseConfigIssue(), null)
  assert.equal(getSupabasePublicKey(), 'sb_publishable_abc123')
})

test('getPublicAppOrigin returns configured public app origin', () => {
  process.env.NEXT_PUBLIC_APP_ORIGIN = 'http://localhost:3003/'

  assert.equal(getPublicAppOrigin(), 'http://localhost:3003')
})

test('getPublicAppOrigin returns empty string when missing', () => {
  delete process.env.NEXT_PUBLIC_APP_ORIGIN

  assert.equal(getPublicAppOrigin(), '')
})
