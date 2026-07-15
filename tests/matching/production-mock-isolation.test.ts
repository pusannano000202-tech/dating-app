import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

test('production match hub ignores solo mock URL query parameters', () => {
  const matchPage = readSource('app/match/page.tsx')
  const productionFetchBranch = sliceBetween(
    matchPage,
    '    try {',
    "      const [matchRes, poolRes, groupRes] = await Promise.all([",
  )

  assert.doesNotMatch(productionFetchBranch, /explicitSoloPreview/)
  assert.doesNotMatch(productionFetchBranch, /DEV_SOLO_MATCHES/)
  assert.doesNotMatch(productionFetchBranch, /params\.get\('sampleMatches'\)/)
  assert.doesNotMatch(productionFetchBranch, /params\.get\('soloStatus'\)/)
  assert.match(productionFetchBranch, /setSoloQueueActive\(false\)/)
})

test('login screen does not prefetch the dev preview auth route', () => {
  const loginPage = readSource('app/(auth)/login/page.tsx')

  assert.match(loginPage, /href="\/dev\/preview"[\s\S]+prefetch=\{false\}/)
})

test('dev solo preview remains available only inside an explicit dev preview session', () => {
  const matchPage = readSource('app/match/page.tsx')
  const devPreviewBranch = sliceBetween(matchPage, '    if (isDevPreview) {', '    try {')

  assert.match(devPreviewBranch, /params\.get\('sampleMatches'\) === '1'/)
  assert.match(devPreviewBranch, /params\.get\('soloStatus'\) === 'in_pool'/)
  assert.match(devPreviewBranch, /setDevPreviewSoloStatus\(requestedSoloStatus\)/)
  assert.match(devPreviewBranch, /DEV_SOLO_MATCHES/)
})

test('dev preview session requires explicit auth state instead of localhost alone', () => {
  const devSetup = readSource('lib/dev-match-setup.ts')

  assert.doesNotMatch(devSetup, /if \(isLocalBrowserPreview\(\)\) return true/)
  assert.match(devSetup, /if \(!isDevAuthBypassEnabled\(\)\) return false/)
  assert.match(devSetup, /return hasDevAuthLocalStorage\(\) \|\| hasDevAuthCookie\(\)/)
})

test('production match detail and chat do not trust dev id prefixes', () => {
  const matchDetailPage = readSource('app/match/[id]/page.tsx')
  const matchChatPage = readSource('app/match/[id]/chat/page.tsx')
  const chatPage = readSource('app/chat/page.tsx')

  assert.doesNotMatch(matchDetailPage, /isDevPreviewClientSession\(\) \|\| matchId\.startsWith\('dev-match'\)/)
  assert.doesNotMatch(matchDetailPage, /isDevPreviewClientSession\(\) \|\| matchId\.startsWith\('dev-solo-'\)/)
  assert.match(matchDetailPage, /const isDevPreview = isDevPreviewClientSession\(\)/)
  assert.doesNotMatch(matchChatPage, /isDevPreviewClientSession\(\) \|\| matchId\.startsWith\('dev-match'\)/)
  assert.match(matchChatPage, /const isDevPreview = isDevPreviewClientSession\(\)/)
  assert.doesNotMatch(chatPage, /href="\/match\/dev-match-1\/chat"/)
})

test('mock solo actions are hidden from non-dev match start and pool screens', () => {
  const matchStartPage = readSource('app/match/start/page.tsx')
  const matchPage = readSource('app/match/page.tsx')
  const matchingPool = readSource('components/MatchingPool.tsx')

  assert.match(matchStartPage, /allowSoloMockActions/)
  assert.match(matchStartPage, /allowSoloMockActions \? \(/)
  assert.match(matchPage, /soloDisabled=\{!devPreviewActive \|\| soloBlockedByGroupFlow\}/)
  assert.match(matchPage, /devPreviewActive=\{devPreviewActive\}/)
  assert.match(matchingPool, /소개팅 준비 중/)
})
