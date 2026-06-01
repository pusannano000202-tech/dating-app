import test from 'node:test'
import assert from 'node:assert/strict'

import { getSupabaseConfigIssue, isSupabaseConfigured } from '../../lib/utils'

const ORIGINAL_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}

function setSupabaseEnv(url: string | undefined, anonKey: string | undefined) {
  if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = url

  if (anonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey
}

test.afterEach(() => {
  setSupabaseEnv(ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_URL, ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY)
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
  assert.match(getSupabaseConfigIssue() ?? '', /anon key/)
})

test('isSupabaseConfigured accepts real Supabase URL and anon key', () => {
  setSupabaseEnv('https://project.supabase.co', 'anon-key')

  assert.equal(isSupabaseConfigured(), true)
  assert.equal(getSupabaseConfigIssue(), null)
})
