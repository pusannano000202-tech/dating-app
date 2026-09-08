import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('login routes OTP and OAuth through the live role continuation flow', () => {
  const login = readSource('app/(auth)/login/page.tsx')

  assert.match(login, /const requestedRedirect = searchParams\.get\('redirect'\) \?\? searchParams\.get\('next'\)/)
  assert.match(login, /const continueTo = getPostLoginDestination\(\{/)
  assert.match(login, /router\.replace\(continueTo\)/)
  assert.match(login, /const appOrigin = getPublicAppOrigin\(\)/)
  assert.match(login, /getOAuthCallbackUrl\(appOrigin, requestedRedirect\)/)
  assert.doesNotMatch(login, /getOAuthCallbackUrl\(window\.location\.origin/)
})

test('oauth callback preserves cookies and continues to the live role resolver', () => {
  const callback = readSource('app/auth/callback/route.ts')

  assert.match(callback, /const destination = getPostLoginDestination\(\{ requestedRedirect: next \}\)/)
  assert.match(callback, /const appOrigin = getPublicAppOrigin\(\)/)
  assert.match(callback, /NextResponse\.redirect\(new URL\(destination, appOrigin\)\)/)
  assert.doesNotMatch(callback, /new URL\([^,]+, requestUrl\.origin\)/)
  assert.match(callback, /applyCookieMutations\(response, cookiesToSet\)/)
})

test('role continuation redirects only through the configured public app origin', () => {
  const continuation = readSource('app/auth/continue/route.ts')

  assert.match(continuation, /const appOrigin = getPublicAppOrigin\(\)/)
  assert.match(continuation, /NextResponse\.redirect\(new URL\(destination, appOrigin\)\)/)
  assert.doesNotMatch(continuation, /new URL\([^,]+, requestUrl\.origin\)/)
})

test('root route requires minimum signup without forcing matching-only worldcup or photos', () => {
  const home = readSource('app/page.tsx')

  assert.match(home, /rpc\('get_my_profile_readiness'\)/)
  assert.match(home, /minimum_signup_complete !== true \? '\/profile\/basic' : null/)
  assert.doesNotMatch(home, /return '\/profile\/(worldcup|photos)'/)
  assert.doesNotMatch(home, /return '\/profile\/survey'/)
  assert.match(home, /if \(onboardingRedirect\) redirect\(onboardingRedirect\)/)
  assert.match(home, /return <HomeDashboard \/>/)
})
