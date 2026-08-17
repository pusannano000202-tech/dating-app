import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function readSource(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

test('profile hub separates profile photos and memories and keeps deposit actions explicit', () => {
  const page = readSource('app/profile/edit/page.tsx')

  assert.match(page, /내 프로필 사진/)
  assert.match(page, /만남 사진첩/)
  assert.match(page, /if \(summary\.status === 'ready'\) return '준비 완료'/)
  assert.match(page, /if \(summary\.status === 'missing'\) return '미등록'/)
  assert.match(page, /'\/friends'/)
  assert.match(page, /'\/chat'/)
  assert.match(page, /'\/notifications'/)
  assert.match(page, /href="\/profile\/basic"/)
  assert.match(page, /fetch\('\/api\/profile\/photos'/)
  assert.match(page, /fetch\('\/api\/friend-requests'/)
  assert.match(page, /fetch\('\/api\/groups'/)
  assert.match(page, /\/api\/deposits\/summary/)
  assert.match(page, /loadDepositSummary\(/)
})

test('friend pending counts are sourced from existing payload fields only', () => {
  const page = readSource('app/profile/edit/page.tsx')

  assert.match(page, /sentPending|receivedPending/)
  assert.doesNotMatch(page, /Math\.random\(\)/)
})

test('profile reset path goes to profile basic', () => {
  const page = readSource('app/profile/edit/page.tsx')

  assert.match(page, /router\.push\('\/profile\/basic'\)/)
})

test('friend summaries expose only short lived signed profile photos', () => {
  const route = readSource('app/api/friend-requests/route.ts')

  assert.match(route, /signPrivateProfilePhotos/)
  assert.match(route, /photo_url/)
  assert.doesNotMatch(route, /public_url/)
})
