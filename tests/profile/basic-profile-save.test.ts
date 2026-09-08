import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function readSource(path: string) {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('basic profile verifies phone by OTP and saves through the atomic minimum-signup API', () => {
  const page = readSource('app/profile/basic/page.tsx')

  assert.match(page, /fetch\(['"]\/api\/profile\/basic['"]/) ;
  assert.match(page, /JSON\.stringify\(data\)/)
  assert.match(readSource('components/profile/PhoneVerificationPanel.tsx'), /\/api\/auth\/phone\/start/)
  assert.match(readSource('components/profile/PhoneVerificationPanel.tsx'), /\/api\/auth\/phone\/verify/)
  assert.doesNotMatch(page, /\.from\(['"]users['"]\)[\s\S]{0,160}\.upsert\(/)
})

test('legacy profile phone route refuses direct phone mutation and points to OTP', () => {
  const route = readSource('app/api/profiles/phone/route.ts')

  assert.match(route, /phone_otp_required/)
  assert.match(route, /phone_verification_required/)
  assert.doesNotMatch(route, /\.from\(['"]users['"]\)[\s\S]*\.update\(/)
  assert.doesNotMatch(route, /\.upsert\(/)
})
