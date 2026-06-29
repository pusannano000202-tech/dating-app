import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('match setup pages continue directly to the next setup step from match start', () => {
  const redirectHelper = readSource('lib/client-redirect.ts')
  const personalityPage = readSource('app/profile/personality-preference/page.tsx')
  const schedulePage = readSource('app/profile/schedule/page.tsx')
  const preferencesPage = readSource('app/profile/preferences/page.tsx')

  assert.match(redirectHelper, /function getSequentialMatchStartRedirect/)
  assert.match(redirectHelper, /redirect !== '\/match\/start'/)
  assert.match(redirectHelper, /encodeURIComponent\('\/match\/start'\)/)
  assert.match(personalityPage, /getSequentialMatchStartRedirect\('\/profile\/schedule'/)
  assert.match(schedulePage, /getSequentialMatchStartRedirect\('\/profile\/preferences'/)
  assert.match(preferencesPage, /getSequentialMatchStartRedirect\('\/profile\/match-card'/)
})

test('dev preview queue status persists from group create to the home task card', () => {
  const devSetup = readSource('lib/dev-match-setup.ts')
  const groupCreatePage = readSource('app/group/create/page.tsx')
  const homeTaskCard = readSource('components/matching/HomeTodayTaskCard.tsx')
  const matchPage = readSource('app/match/page.tsx')

  assert.match(devSetup, /DEV_PREVIEW_GROUP_STATUS_COOKIE/)
  assert.match(devSetup, /function setDevPreviewGroupStatus/)
  assert.match(devSetup, /function getDevPreviewGroupStatusFromClient/)
  assert.match(devSetup, /function setDevPreviewGroupSize/)
  assert.match(devSetup, /function getDevPreviewGroupSizeFromClient/)

  assert.match(groupCreatePage, /setDevPreviewGroupStatus\('in_pool'\)/)
  assert.match(groupCreatePage, /setDevPreviewGroupStatus\('forming'\)/)
  assert.match(groupCreatePage, /getDevPreviewGroupStatusFromClient\(\)/)
  assert.match(groupCreatePage, /getDevPreviewGroupSizeFromClient\(requestedSize\)/)

  assert.match(homeTaskCard, /getDevPreviewGroupStatusFromClient\(\)/)
  assert.match(homeTaskCard, /getDevPreviewGroupSizeFromClient\(DEV_PREVIEW_GROUP\.size\)/)
  assert.match(homeTaskCard, /if \(loading\) \{/)
  assert.match(homeTaskCard, /href: '\/match'/)
  assert.doesNotMatch(homeTaskCard, /setGroupStatus\(null\)/)

  assert.match(matchPage, /getDevPreviewGroupStatusFromClient\(\)/)
  assert.match(matchPage, /getDevPreviewGroupSizeFromClient\(DEV_PREVIEW_GROUP\.size\)/)
  assert.match(matchPage, /status: previewGroupStatus/)
  assert.match(matchPage, /DEV_PREVIEW_GROUP_MEMBERS\.slice\(0, previewGroupSize\)/)
  assert.match(matchPage, /teamCardName = loading/)
  assert.match(matchPage, /\{loading \? \(/)
})

test('match hub renders opponent cards only after match results exist', () => {
  const matchPage = readSource('app/match/page.tsx')

  assert.match(matchPage, /const hasMatchResults = matches\.length > 0/)
  assert.match(matchPage, /const hasStartedMatching =/)
  assert.match(matchPage, /\{loading \? \(/)
  assert.match(matchPage, /: hasMatchResults \? \(/)
  assert.match(matchPage, /hasStartedMatching && !hasMatchResults/)
  assert.match(matchPage, /<MatchSearchingPrivacyCard \/>/)
  assert.match(matchPage, /상대 카드는 매칭 후에 열려요/)
  assert.match(matchPage, /!loading && !hasStartedMatching && \(/)
  assert.doesNotMatch(matchPage, /title=\{matches\.length > 0 \?/)
  assert.doesNotMatch(matchPage, /chemi=\{matches\.length > 0 \?/)
  assert.doesNotMatch(matchPage, /chemi=\{70\}/)
})

test('home routes the main matching CTA through the matching hub', () => {
  const homePage = readSource('app/page.tsx')

  assert.match(homePage, /href="\/match"/)
  assert.doesNotMatch(homePage, /href="\/match\/start"/)
  assert.doesNotMatch(homePage, /HomeLockedOpponentNotice/)
  assert.doesNotMatch(homePage, /상대팀 카드는 아직 잠겨 있어요/)
})

test('matching pool uses circular queue visuals instead of horizontal bars', () => {
  const matchingPool = readSource('components/MatchingPool.tsx')

  assert.match(matchingPool, /function QueueCircleCard/)
  assert.match(matchingPool, /buildRingGradient/)
  assert.match(matchingPool, /conic-gradient/)
  assert.match(matchingPool, /QueueDotCluster row=\{row\}/)
  assert.match(matchingPool, /function getQueueDotTone/)
  assert.match(matchingPool, /혼성팀/)
  assert.doesNotMatch(matchingPool, /maleWidth|femaleWidth|mixedWidth/)
  assert.doesNotMatch(matchingPool, /className="absolute h-2\.5 w-2\.5 rounded-full border border-white bg-boot-primary/)
  assert.doesNotMatch(matchingPool, /bg-rose-200|bg-amber-200|bg-sky-200/)
})

test('home info modal explains the whole app flow with visual cards', () => {
  const homeInfo = readSource('components/matching/HomeInfoButton.tsx')

  assert.match(homeInfo, /앱 흐름 한눈에/)
  assert.match(homeInfo, /function FlowVisualCard/)
  assert.match(homeInfo, /UserPlus/)
  assert.match(homeInfo, /Sparkles/)
  assert.match(homeInfo, /CreditCard/)
  assert.match(homeInfo, /MessageCircle/)
})

test('preference page makes age range selection visually prominent', () => {
  const preferencesPage = readSource('app/profile/preferences/page.tsx')

  assert.match(preferencesPage, /상대 나이 범위/)
  assert.match(preferencesPage, /Age range/)
  assert.match(preferencesPage, /function AgeControlCard/)
  assert.match(preferencesPage, /선호 범위/)
  assert.match(preferencesPage, /내 나이 ±3살로 다시 맞추기/)
})
