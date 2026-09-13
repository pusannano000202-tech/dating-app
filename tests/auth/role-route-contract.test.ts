import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import ts from 'typescript'

import * as accountAccess from '../../lib/auth/account-access'
import * as redirectPolicy from '../../lib/auth/redirect'
import * as serviceRecovery from '../../lib/auth/service-unavailable'
import * as devAuth from '../../lib/dev-auth'

const ROOT = process.cwd()
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8')

function authenticatedMiddlewareFixture() {
  let accessChecks = 0
  const exports: { middleware?: (request: NextRequest) => Promise<NextResponse> } = {}
  const dependencies: Record<string, unknown> = {
    'next/server': { NextResponse },
    './lib/auth/redirect': redirectPolicy,
    './lib/auth/service-unavailable': serviceRecovery,
    './lib/dev-auth': { ...devAuth, isDevAuthBypassEnabled: () => false, shouldIssueDevAuthCookie: () => false },
    './lib/auth/account-access': {
      ...accountAccess,
      checkAccountAccess: async () => { accessChecks += 1; return 'allowed' },
    },
    './lib/supabase-request': { createSupabaseRequestClient: () => assert.fail('login must use cookie auth') },
    './lib/utils': {
      getPublicAppOrigin: () => 'https://quantum.example',
      getSupabasePublicKey: () => 'fixture-public-key',
      getSupabaseUrl: () => 'https://fixture.supabase.invalid',
      isSupabaseConfigured: () => true,
    },
    '@supabase/ssr': {
      createServerClient: (_url: string, _key: string, options: {
        cookies: { setAll: (cookies: { name: string; value: string }[]) => void }
      }) => ({ auth: { getUser: async () => {
        options.cookies.setAll([{ name: 'refreshed-session', value: 'fixture-cookie' }])
        return { data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null }
      } } }),
    },
  }
  const code = ts.transpileModule(source('middleware.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', 'require', code)(exports, (specifier: string) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected dependency: ${specifier}`)
    return dependencies[specifier]
  })
  assert.equal(typeof exports.middleware, 'function')
  return { middleware: exports.middleware!, accessChecks: () => accessChecks }
}

test('continue route resolves a live database role with private no-store responses', () => {
  assert.equal(existsSync(join(ROOT, 'app/auth/continue/route.ts')), true)
  const route = source('app/auth/continue/route.ts')
  assert.match(route, /requireServerAccess/)
  assert.match(route, /getRoleDestination/)
  assert.match(route, /PRIVATE_NO_STORE = ['"]private, no-store['"]/)
  assert.match(route, /headers\.set\(['"]Cache-Control['"], PRIVATE_NO_STORE\)/)
  assert.match(route, /status:\s*503/)
  assert.ok(
    route.indexOf('createServerClient(') > route.indexOf('try {'),
    'Supabase client creation must be inside the generalized dependency-failure boundary',
  )
  assert.doesNotMatch(route, /user_metadata|app_metadata|raw_user_meta_data/)
})

test('access-context API exposes only the caller live role DTO with private no-store caching', () => {
  assert.equal(existsSync(join(ROOT, 'app/api/access/context/route.ts')), true)
  const route = source('app/api/access/context/route.ts')
  assert.match(route, /requireRequestAccess\(request\)/)
  assert.match(route, /accessRole:\s*guarded\.access\.accessRole/)
  assert.match(route, /partnerVenueIds:\s*guarded\.access\.partnerVenueIds/)
  assert.match(route, /['"]Cache-Control['"]:\s*['"]private, no-store['"]/)
  assert.match(route, /requestGuardErrorResponse/)
  assert.doesNotMatch(route, /phone|appearance|user_metadata|app_metadata/i)
})

test('OTP and OAuth success both continue through the role resolver', () => {
  const login = source('app/(auth)/login/page.tsx')
  const callback = source('app/auth/callback/route.ts')
  assert.match(login, /getPostLoginDestination/)
  assert.match(login, /router\.replace\(continueTo\)/)
  assert.match(callback, /getPostLoginDestination/)
  assert.match(callback, /cookiesToSet/)
  assert.match(callback, /response\.cookies\.set/)
  assert.match(callback, /headers\.set\(['"]Cache-Control['"], ['"]private, no-store['"]\)/)
  assert.match(callback, /headers\.set\(['"]Vary['"], ['"]Cookie['"]\)/)
  assert.doesNotMatch(callback, /return NextResponse\.redirect\(/)
  assert.ok(
    callback.indexOf('try {') >= 0
      && callback.indexOf('try {') < callback.indexOf('createServerClient('),
    'OAuth exchange client creation must be inside a generalized dependency-failure boundary',
  )
})

test('role layouts enforce final server-side database role checks without fixture bypasses', () => {
  for (const [path, role] of [
    ['app/admin/layout.tsx', 'admin'],
    ['app/admin/super-admin/layout.tsx', 'super_admin'],
    ['app/partner/layout.tsx', 'partner'],
    ['app/tonight/(protected)/layout.tsx', 'user'],
  ] as const) {
    assert.equal(existsSync(join(ROOT, path)), true, `${path} is missing`)
    const layout = source(path)
    assert.match(layout, /requireServerAccess/)
    assert.match(layout, new RegExp(`['"]${role}['"]`))
    assert.doesNotMatch(layout, /isSupabaseConfigured\(\).*bypass|devBypass|DEV_AUTH_COOKIE/)
  }
})

test('middleware protects exact route segments and keeps dev fixture auth inside dev routes', () => {
  const middleware = source('middleware.ts')
  assert.match(middleware, /['"]\/tonight['"]/)
  assert.match(middleware, /['"]\/partner['"]/)
  assert.match(middleware, /['"]\/admin['"]/)
  assert.match(middleware, /pathname === prefix \|\| pathname\.startsWith\(`\$\{prefix\}\/`\)/)
  assert.match(middleware, /isDevRoute/)
  assert.match(middleware, /isDevRoute\s*&&\s*canBypassAuth/)
  assert.match(middleware, /function preserveResponseCookies/)
  const dependencyBoundaryIndex = middleware.indexOf('try {', middleware.indexOf('let response'))
  const clientCreationIndex = middleware.indexOf('createServerClient(', middleware.indexOf('let response'))
  assert.ok(
    dependencyBoundaryIndex >= 0 && dependencyBoundaryIndex < clientCreationIndex,
    'middleware client creation and auth lookup must be inside a dependency-failure boundary',
  )
  assert.match(
    middleware,
    /const destination = getPostLoginDestination\(\{ requestedRedirect: request\.nextUrl\.searchParams\.get\('redirect'\) \?\? request\.nextUrl\.searchParams\.get\('next'\) \}\)/,
  )
  assert.match(middleware, /preserveResponseCookies\(NextResponse\.redirect\(new URL\(destination, appOrigin\)\), response\)/)
  assert.match(middleware, /const appOrigin = getPublicAppOrigin\(\)/)
  assert.doesNotMatch(middleware, /NextResponse\.redirect\(new URL\(['"]\/(?:login|auth\/continue)['"], request\.url\)\)/)
  assert.doesNotMatch(middleware, /const isProtected = PROTECTED_PREFIXES\.some\(\(p\) => pathname\.startsWith\(p\)\)/)
})

test('actual authenticated login responses always enter the role resolver with safe next and refreshed cookies', async () => {
  const room = '/meetups/11111111-1111-4111-8111-111111111111'
  for (const [query, expectedNext] of [
    ['', null],
    [new URLSearchParams({ next: room }).toString(), room],
    [new URLSearchParams({ redirect: room, next: '/admin' }).toString(), room],
    [new URLSearchParams({ next: 'https://evil.example/path' }).toString(), null],
    [new URLSearchParams({ next: '/admin/super-admin/tonight' }).toString(), '/admin/super-admin/tonight'],
  ] as const) {
    const fixture = authenticatedMiddlewareFixture()
    const response = await fixture.middleware(new NextRequest(`https://untrusted-host.invalid/login?${query}`))
    const location = new URL(response.headers.get('location')!)
    assert.equal(response.status, 307)
    assert.equal(location.origin, 'https://quantum.example')
    assert.equal(location.pathname, '/auth/continue')
    assert.equal(location.searchParams.get('next'), expectedNext)
    assert.equal(response.cookies.get('refreshed-session')?.value, 'fixture-cookie')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('vary'), 'Cookie, Authorization')
    assert.equal(fixture.accessChecks(), 1)
    if (expectedNext?.startsWith('/admin')) {
      assert.equal(redirectPolicy.getRoleDestination('user', expectedNext), '/')
    }
  }
})

test('actual authenticated reauthentication requests stay on login for the recent-auth challenge', async () => {
  const fixture = authenticatedMiddlewareFixture()
  const response = await fixture.middleware(new NextRequest('https://quantum.example/login?reauth=1&next=%2Fadmin'))
  assert.equal(response.headers.get('location'), null)
  assert.equal(response.headers.get('x-middleware-next'), '1')
  assert.equal(response.cookies.get('refreshed-session')?.value, 'fixture-cookie')
  assert.equal(fixture.accessChecks(), 0)
})

test('authenticated super-admins can complete an explicit recent-auth challenge', () => {
  const middleware = source('middleware.ts')
  const login = source('app/(auth)/login/page.tsx')

  assert.match(middleware, /searchParams\.get\('reauth'\) === '1'/)
  assert.match(middleware, /pathname === '\/login' && user && !isReauthentication/)
  assert.match(login, /const isReauthentication = searchParams\.get\('reauth'\) === '1'/)
  assert.match(login, /민감한 운영 정보를 다시 확인해요/)
})
