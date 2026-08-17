import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('login defaults to basic onboarding while preserving a safe explicit redirect or next', () => {
  const login = readSource('app/(auth)/login/page.tsx')

  assert.match(login, /const requestedRedirect = searchParams\.get\('redirect'\) \?\? searchParams\.get\('next'\)/)
  assert.match(login, /const redirectTo = getPostLoginDestination\(\{/)
  assert.match(login, /router\.replace\(redirectTo\)/)
  assert.match(login, /getOAuthCallbackUrl\(window\.location\.origin, redirectTo\)/)
})

test('oauth callback defaults unsafe or absent next values to the root', () => {
  const callback = readSource('app/auth/callback/route.ts')

  assert.match(
    callback,
    /const destination = isSafeLocalRedirect\(next\) \? next : '\/'/,
  )
  assert.match(callback, /NextResponse\.redirect\(new URL\(destination, requestUrl\.origin\)\)/)
})

test('root route sends incomplete profiles to their first unfinished step and completed profiles home', () => {
  const home = readSource('app/page.tsx')

  assert.match(home, /if \(!profile\?\.gender\) return '\/profile\/basic'/)
  assert.match(home, /if \(!profile\.appearance_type\) return '\/profile\/worldcup'/)
  assert.doesNotMatch(home, /return '\/profile\/survey'/)
  assert.match(home, /if \(!count \|\| count === 0\) return '\/profile\/photos'/)
  assert.match(home, /if \(onboardingRedirect\) redirect\(onboardingRedirect\)/)
  assert.match(home, /return <HomeDashboard \/>/)
})
