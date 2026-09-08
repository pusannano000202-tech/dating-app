import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

import { middleware } from '../../middleware'
import { GET as getUnavailableApi } from '../../app/auth/unavailable/route'
import {
  getPublicLoginErrorMessage,
  getSafeServiceRecoveryDestination,
} from '../../lib/auth/service-unavailable'

const AUTH_ENV_KEYS = [
  'NEXT_PUBLIC_APP_ORIGIN',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

async function withUnavailableAuth(run: () => Promise<void>) {
  const snapshot = new Map(AUTH_ENV_KEYS.map((key) => [key, process.env[key]]))

  process.env.NEXT_PUBLIC_APP_ORIGIN = 'http://localhost:3010'
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  try {
    await run()
  } finally {
    for (const [key, value] of snapshot) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('protected browser document GET opens the public service recovery page', async () => {
  await withUnavailableAuth(async () => {
    const response = await middleware(new NextRequest('http://attacker.invalid/match?mode=weekly', {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
      },
    }))

    assert.equal(response.status, 307)
    assert.equal(
      response.headers.get('location'),
      'http://localhost:3010/auth/service-unavailable?returnTo=%2Fmatch%3Fmode%3Dweekly',
    )
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
  })
})

test('protected RSC GET opens recovery without leaking the internal _rsc query', async () => {
  await withUnavailableAuth(async () => {
    const response = await middleware(new NextRequest('http://localhost:3010/match?_rsc=internal', {
      headers: {
        accept: '*/*',
        rsc: '1',
        'next-router-state-tree': '%5B%22%22%5D',
      },
    }))

    assert.equal(response.status, 307)
    assert.equal(
      response.headers.get('location'),
      'http://localhost:3010/auth/service-unavailable?returnTo=%2Fmatch',
    )
  })
})

test('JSON clients and write requests keep the existing private JSON 503 contract', async () => {
  await withUnavailableAuth(async () => {
    const jsonResponse = await middleware(new NextRequest('http://localhost:3010/match', {
      headers: { accept: 'application/json' },
    }))
    assert.equal(jsonResponse.status, 503)
    assert.match(jsonResponse.headers.get('content-type') ?? '', /application\/json/)
    assert.equal(jsonResponse.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(await jsonResponse.json(), {
      error: '인증 서비스를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    })

    const writeResponse = await middleware(new NextRequest('http://localhost:3010/match', {
      method: 'POST',
      headers: { accept: 'text/html' },
    }))
    assert.equal(writeResponse.status, 503)
    assert.equal(writeResponse.headers.get('location'), null)
    assert.match(writeResponse.headers.get('content-type') ?? '', /application\/json/)
  })
})

test('the existing unavailable API route remains JSON 503 with retry metadata', async () => {
  const response = getUnavailableApi()

  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('retry-after'), '30')
  assert.deepEqual(await response.json(), {
    error: '인증 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  })
})

test('recovery retry accepts only same-origin page GET destinations', () => {
  assert.equal(getSafeServiceRecoveryDestination('/match?mode=weekly'), '/match?mode=weekly')
  assert.equal(getSafeServiceRecoveryDestination('https://evil.example/match'), null)
  assert.equal(getSafeServiceRecoveryDestination('//evil.example/match'), null)
  assert.equal(getSafeServiceRecoveryDestination('/login?redirect=/match'), null)
  assert.equal(getSafeServiceRecoveryDestination('/auth/continue?next=/match'), null)
  assert.equal(getSafeServiceRecoveryDestination('/api/profile/basic'), null)
  assert.equal(getSafeServiceRecoveryDestination('/%61pi/profile/basic'), null)
})

test('login query errors preserve only approved public copy', () => {
  assert.equal(getPublicLoginErrorMessage(null), null)
  assert.equal(
    getPublicLoginErrorMessage('로그인이 취소됐어요. 다시 시도해 주세요.'),
    '로그인이 취소됐어요. 다시 시도해 주세요.',
  )
  assert.equal(
    getPublicLoginErrorMessage('NEXT_PUBLIC_SUPABASE_URL missing at provider.internal'),
    '로그인을 완료하지 못했어요. 다시 시도해 주세요.',
  )
})
