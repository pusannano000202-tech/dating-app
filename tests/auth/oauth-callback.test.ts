import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import ts from 'typescript'

import * as oauthLogin from '../../lib/auth/oauth-login'
import * as redirectPolicy from '../../lib/auth/redirect'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

function callbackFixture(exchangeFails = false) {
  let exchanges = 0
  const exports: { GET?: (request: NextRequest) => Promise<NextResponse> } = {}
  const dependencies: Record<string, unknown> = {
    'next/server': { NextRequest, NextResponse },
    '@/lib/auth/oauth-login': oauthLogin,
    '@/lib/auth/redirect': redirectPolicy,
    '@/lib/utils': {
      getPublicAppOrigin: () => 'https://quantum.example',
      getSupabaseConfigIssue: () => null,
      getSupabasePublicKey: () => 'fixture-public-key',
      getSupabaseUrl: () => 'https://fixture.supabase.invalid',
    },
    '@supabase/ssr': {
      createServerClient: (_url: string, _key: string, options: {
        cookies: { setAll: (cookies: { name: string; value: string }[]) => void }
      }) => ({ auth: { exchangeCodeForSession: async () => {
        exchanges += 1
        options.cookies.setAll([{ name: 'refreshed-session', value: 'fixture-cookie' }])
        return { error: exchangeFails ? new Error('private provider diagnostic') : null }
      } } }),
    },
  }
  const code = ts.transpileModule(readSource('app/auth/callback/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', 'require', code)(exports, (specifier: string) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected dependency: ${specifier}`)
    return dependencies[specifier]
  })
  assert.equal(typeof exports.GET, 'function')
  return { GET: exports.GET!, exchanges: () => exchanges }
}

test('oauth callback sends provider failures back to login instead of entering a protected page', () => {
  const route = readSource('app/auth/callback/route.ts')

  assert.match(route, /searchParams\.get\(['"]error['"]\)/)
  assert.match(route, /getOAuthRetryUrl\(appOrigin, next, providerError\)/)
  assert.match(route, /applyCookieMutations\(NextResponse\.redirect\(loginUrl\), \[\]\)/)
  assert.doesNotMatch(route, /auth_error['"]\s*,\s*error\.message/)
})

test('actual OAuth failure responses keep a safe retry target and hide provider details', async () => {
  const room = '/meetups/11111111-1111-4111-8111-111111111111'
  for (const [next, error, expectedNext] of [
    [room, 'access_denied', room],
    ['https://evil.example/path', 'private provider diagnostic', null],
    ['//evil.example/path', 'access_denied', null],
  ] as const) {
    const fixture = callbackFixture()
    const query = new URLSearchParams({ next, error, error_description: 'private provider diagnostic' })
    const response = await fixture.GET(new NextRequest(`https://untrusted-host.invalid/auth/callback?${query}`))
    const location = new URL(response.headers.get('location')!)
    assert.equal(response.status, 307)
    assert.equal(location.origin, 'https://quantum.example')
    assert.equal(location.pathname, '/login')
    assert.equal(location.searchParams.get('redirect'), expectedNext)
    assert.equal(location.searchParams.get('auth_error'), oauthLogin.getOAuthCallbackErrorMessage(error))
    assert.doesNotMatch(location.toString(), /private|diagnostic|error_description/)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('vary'), 'Cookie')
    assert.equal(fixture.exchanges(), 0)
  }
})

test('missing codes and rejected code exchanges return to login while preserving refreshed cookies', async () => {
  const room = '/meetups/11111111-1111-4111-8111-111111111111'
  for (const code of [null, 'fixture-code']) {
    const fixture = callbackFixture(true)
    const query = new URLSearchParams({ next: room })
    if (code) query.set('code', code)
    const response = await fixture.GET(new NextRequest(`https://quantum.example/auth/callback?${query}`))
    const location = new URL(response.headers.get('location')!)
    assert.equal(location.pathname, '/login')
    assert.equal(location.searchParams.get('redirect'), room)
    assert.equal(location.searchParams.get('auth_error'), oauthLogin.getOAuthCallbackErrorMessage())
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(fixture.exchanges(), code ? 1 : 0)
    assert.equal(response.cookies.get('refreshed-session')?.value, code ? 'fixture-cookie' : undefined)
    assert.doesNotMatch(location.toString(), /private|diagnostic|fixture-code/)
  }
})

test('oauth callback fails closed without exposing internal Supabase configuration issues', () => {
  const route = readSource('app/auth/callback/route.ts')

  assert.match(route, /if \(configIssue\) return unavailable\(\)/)
  assert.match(route, /status:\s*503/)
  assert.doesNotMatch(route, /auth_error['"]\s*,\s*configIssue/)
  assert.doesNotMatch(route, /error:\s*configIssue/)
})
