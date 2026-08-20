import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { getBearerAccessToken } from '../../lib/auth/api-request-auth'

test('mobile API auth accepts one well-formed Bearer access token', () => {
  assert.equal(getBearerAccessToken('Bearer mobile.jwt.token'), 'mobile.jwt.token')
  assert.equal(getBearerAccessToken('bearer token-value'), 'token-value')
})

test('mobile API auth rejects missing, blank, and ambiguous credentials', () => {
  assert.equal(getBearerAccessToken(null), null)
  assert.equal(getBearerAccessToken(''), null)
  assert.equal(getBearerAccessToken('Basic abc'), null)
  assert.equal(getBearerAccessToken('Bearer '), null)
  assert.equal(getBearerAccessToken('Bearer first second'), null)
})

test('event participation route uses the request-aware Supabase client', () => {
  const helperPath = path.join(process.cwd(), 'lib/supabase-request.ts')
  assert.ok(fs.existsSync(helperPath), 'supabase-request.ts must exist')
  const helper = fs.readFileSync(helperPath, 'utf8')
  const route = fs.readFileSync(
    path.join(process.cwd(), 'app/api/match/event-participation/route.ts'),
    'utf8',
  )

  assert.match(helper, /getBearerAccessToken/)
  assert.match(helper, /Authorization/)
  assert.match(helper, /persistSession:\s*false/)
  assert.match(route, /createSupabaseRequestClient\(request\)/)
})
