import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function readSource(path: string): string {
  if (!existsSync(join(ROOT, path))) return ''
  return readFileSync(join(ROOT, path), 'utf8')
}

test('community landing renders the equal content, stories and voice entry points', () => {
  const page = readSource('app/community/page.tsx')

  assert.match(page, /CommunityPortal/)
  assert.match(page, /isCommunityFeatureEnabled/)
  const portal = readSource('components/community/CommunityPortal.tsx')
  for (const href of ['/community/content','/community/stories','/community/voice']) assert.ok(portal.includes(href))
})

test('community catalog keeps the three destination buckets without repeating them below the spotlight', () => {
  const page = readSource('app/community/page.tsx')
  const catalog = readSource('lib/community/catalog.ts')

  assert.match(page, /CommunityPortal/)
  assert.doesNotMatch(page, /communityDestinationGroups/)
  assert.doesNotMatch(page, /community-spaces-heading/)
  assert.match(catalog, /연애 이야기/)
  assert.match(catalog, /사용자 후기/)
  assert.match(catalog, /우리 주변 맛집/)
  assert.match(catalog, /'\/community\/relationship-advice'/)
  assert.match(catalog, /'\/community\/relationship-coach'/)
  assert.match(catalog, /'\/community\/feedback'/)
  assert.match(catalog, /'\/community\/meetup-review'/)
  assert.match(catalog, /'\/community\/campus-eats'/)
})

test('community spotlight links to the verified seven day hot feed and participation surfaces', () => {
  const spotlight = readSource('components/community/CommunitySpotlight.tsx')

  assert.match(spotlight, /최근 7일 핫글/)
  assert.match(spotlight, /href="\/community\/hot"/)
  assert.match(spotlight, /모임 후기/)
  assert.match(spotlight, /href="\/community\/meetup-review"/)
  assert.match(spotlight, /운영자 피드백/)
  assert.match(spotlight, /href="\/community\/feedback"/)
})

test('community spotlight gives relationship spaces a restrained pink treatment', () => {
  const spotlight = readSource('components/community/CommunitySpotlight.tsx')

  assert.match(spotlight, /연애 상담/)
  assert.match(spotlight, /연애 코치/)
  assert.match(spotlight, /bg-\[#FFF0F4\]/)
  assert.match(spotlight, /border-\[#F3C3D1\]/)
})

test('community spotlight keeps secondary destinations in a compact two-column mobile grid', () => {
  const spotlight = readSource('components/community/CommunitySpotlight.tsx')

  assert.match(spotlight, /data-layout="community-quick-grid"/)
  assert.match(spotlight, /grid-cols-2/)
  assert.doesNotMatch(spotlight, /min-h-28/)
  assert.doesNotMatch(spotlight, /min-h-24/)
})

test('community photo explorer gives each topic truthful copy and one destination', () => {
  const source = readSource('lib/community/experience-explorer.ts')
  const explorer = readSource('components/community/CommunityExperienceExplorer.tsx')
  const spotlight = readSource('components/community/CommunitySpotlight.tsx')
  assert.match(explorer, /PhotoSceneCarousel/)
  assert.match(source, /quantum-campus-group\.webp/)
  assert.match(source, /social-scenes\/content\.png/)
  assert.match(source, /social-scenes\/delivery\.png/)
  assert.match(source, /social-scenes\/boardgame\.webp/)
  assert.match(source, /내 취향의 1등/)
  assert.match(source, /음식 종류부터 고르고/)
  assert.match(source, /자기보고 통계이며 과학적인 궁합 예측이 아니에요/)
  assert.match(source, /실제 배달 업체와 무관해요/)
  assert.match(spotlight, /summary.storeCount/)
  assert.match(spotlight, /summary.cardCount/)
  assert.match(spotlight, /summary.categoryCount/)
  assert.match(spotlight, /지도에서 둘러보기/)
  assert.doesNotMatch(source, /1분 취향 분석|전체 순위 보기|부산대 학생들의 실제 비교|실시간|이번 주 \d+|참여자 \d+/)
  assert.match(source, /href:\s*'\/community\/campus-eats\?mode=choose'/)
  assert.match(spotlight, /href="\/community\/campus-eats\?mode=map&category=donkatsu&list=open"/)
  assert.doesNotMatch(explorer, /SchoolMascot/)
})

test('Campus Eats spotlight exposes all seven brackets and never merges the two coffee zones', () => {
  const spotlight = readSource('components/community/CommunitySpotlight.tsx')
  const categories = readSource('lib/campus-eats/fixtures/pnu-categories.ts')

  assert.match(spotlight, /PNU_CAMPUS_EATS_CATEGORIES/)
  assert.match(spotlight, /mode=setup&category=donkatsu/)
  assert.match(spotlight, /mode=setup&category=pizza/)
  assert.match(spotlight, /mode=setup&category=chicken/)
  assert.match(spotlight, /mode=setup&category=coffee-main/)
  assert.match(spotlight, /mode=setup&category=coffee-north/)
  assert.match(spotlight, /mode=setup&category=gukbap/)
  assert.match(spotlight, /mode=setup&category=milmyeon/)
  assert.match(categories, /'coffee-main':\s*{\s*label: '정문 커피'/)
  assert.match(categories, /'coffee-north':\s*{\s*label: '북문 커피'/)
  assert.doesNotMatch(categories, /label: '커피'/)
})
