import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('local development and production preview default to localhost:3004', () => {
  const packageJson = read('package.json')
  const envExample = read('.env.example')
  const localEnvExample = read('.env.local.example')
  const routeChecker = read('scripts/check-local-routes.mjs')

  assert.match(packageJson, /"dev":\s*"next dev --hostname localhost --port 3004"/)
  assert.match(packageJson, /"start":\s*"next start --hostname localhost --port 3004"/)
  assert.match(envExample, /NEXT_PUBLIC_APP_ORIGIN=http:\/\/localhost:3004/)
  assert.match(localEnvExample, /NEXT_PUBLIC_APP_ORIGIN=http:\/\/localhost:3004/)
  assert.match(routeChecker, /http:\/\/localhost:3004/)
  for (const route of [
    '/community/campus-eats',
    '/tonight',
    '/partner/tonight',
    '/admin/tonight',
    '/admin/super-admin/tonight',
    '/dev/tonight-release-rehearsal',
  ]) {
    assert.match(routeChecker, new RegExp(`path: ['"]${route.replaceAll('/', '\\/')}['"]`))
  }
})

test('Naver Maps browser contract exposes only the ncpKeyId name', () => {
  for (const path of ['.env.example', '.env.local.example']) {
    const source = read(path)
    assert.match(source, /^NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID=$/m)
    assert.doesNotMatch(source, /NEXT_PUBLIC_NAVER_(?:CLIENT_SECRET|MAPS_CLIENT_SECRET)/)
  }
})

test('deployment readiness requires a non-placeholder Naver Maps ncpKeyId', () => {
  const checker = read('scripts/check-deploy-readiness.mjs')

  assert.match(checker, /classifyNaverMapsKey\(env\.NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID\)/)
  assert.match(checker, /case 'NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID'/)
  assert.doesNotMatch(checker, /env\.NAVER_CLIENT_SECRET/)
})

test('deployment readiness fails closed until minute-precision Tonight scheduling is confirmed', () => {
  const checker = read('scripts/check-deploy-readiness.mjs')
  const envExample = read('.env.example')

  assert.match(envExample, /^TONIGHT_CRON_SCHEDULER=$/m)
  assert.match(checker, /classifyTonightCronScheduler\(env\.TONIGHT_CRON_SCHEDULER\)/)
  assert.match(checker, /value === 'vercel-pro'/)
  assert.match(checker, /case 'TONIGHT_CRON_SCHEDULER'/)
})

test('deployment readiness requires the approved per-attendee partner fee', () => {
  const checker = read('scripts/check-deploy-readiness.mjs')

  for (const path of ['.env.example', '.env.local.example']) {
    assert.match(read(path), /^TONIGHT_PARTNER_FEE_PER_ATTENDEE=1000$/m)
  }
  assert.match(checker, /classifyPartnerFeePerAttendee\(env\.TONIGHT_PARTNER_FEE_PER_ATTENDEE\)/)
  assert.match(checker, /case 'TONIGHT_PARTNER_FEE_PER_ATTENDEE'/)
})
