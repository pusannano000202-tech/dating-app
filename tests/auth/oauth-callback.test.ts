import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('oauth callback sends provider failures back to login instead of entering a protected page', () => {
  const route = readSource('app/auth/callback/route.ts')

  assert.match(route, /searchParams\.get\(['"]error['"]\)/)
  assert.match(route, /getOAuthCallbackErrorMessage/)
  assert.match(route, /loginUrl\.searchParams\.set\(['"]auth_error['"]\s*,/)
  assert.doesNotMatch(route, /auth_error['"]\s*,\s*error\.message/)
})

test('oauth callback fails closed without exposing internal Supabase configuration issues', () => {
  const route = readSource('app/auth/callback/route.ts')

  assert.match(route, /if \(configIssue\) return unavailable\(\)/)
  assert.match(route, /status:\s*503/)
  assert.doesNotMatch(route, /auth_error['"]\s*,\s*configIssue/)
  assert.doesNotMatch(route, /error:\s*configIssue/)
})
