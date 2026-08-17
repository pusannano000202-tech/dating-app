import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function readSource(path: string): string {
  if (!existsSync(join(ROOT, path))) return ''
  return readFileSync(join(ROOT, path), 'utf8')
}

test('community landing keeps horizontal categories and renders the spotlight entry points', () => {
  const page = readSource('app/community/page.tsx')

  assert.match(page, /overflow-x-auto/)
  assert.match(page, /맛집 월드컵 NEW/)
  assert.match(page, /href="\/community\/campus-eats\?mode=battle&category=donkatsu"/)
  assert.match(page, /CommunitySpotlight/)
  assert.match(page, /<CommunitySpotlight\s*\/>/)
})

test('community catalog keeps the three destination buckets without repeating them below the spotlight', () => {
  const page = readSource('app/community/page.tsx')
  const catalog = readSource('lib/community/catalog.ts')

  assert.match(page, /overflow-x-auto/)
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

test('Campus Eats spotlight leads the community with the approved food-first A design', () => {
  const spotlight = readSource('components/community/CommunitySpotlight.tsx')

  assert.match(spotlight, /next\/image/)
  assert.match(spotlight, /cutlet-katsu\.webp/)
  assert.match(spotlight, /cutlet-cheese-curry\.webp/)
  assert.match(spotlight, /맛집 월드컵 NEW/)
  assert.match(spotlight, /부산대 학생들의 실제 비교/)
  assert.match(spotlight, /학교 앞 진짜 1등/)
  assert.match(spotlight, /93곳 매장/)
  assert.match(spotlight, /94장 대진 카드/)
  assert.match(spotlight, /7개 음식 월드컵/)
  assert.match(spotlight, /1분 취향 분석 시작/)
  assert.match(spotlight, /전체 순위 보기/)
  assert.match(spotlight, /href="\/community\/campus-eats\?mode=battle&category=donkatsu"/)
  assert.match(spotlight, /href="\/community\/campus-eats\?mode=map&category=donkatsu&list=open"/)
  assert.doesNotMatch(spotlight, /SchoolMascot/)
  assert.doesNotMatch(spotlight, /실시간|이번 주 \d+|참여자 \d+/)
  assert.doesNotMatch(spotlight, /(인기\s*\d+|배달\s*\d+분|별점\s*\d|위\s*맛집)/)
})

test('Campus Eats spotlight exposes all seven brackets and never merges the two coffee zones', () => {
  const spotlight = readSource('components/community/CommunitySpotlight.tsx')
  const categories = readSource('lib/campus-eats/fixtures/pnu-categories.ts')

  assert.match(spotlight, /PNU_CAMPUS_EATS_CATEGORIES/)
  assert.match(spotlight, /category=donkatsu/)
  assert.match(spotlight, /category=pizza/)
  assert.match(spotlight, /category=chicken/)
  assert.match(spotlight, /category=coffee-main/)
  assert.match(spotlight, /category=coffee-north/)
  assert.match(spotlight, /category=gukbap/)
  assert.match(spotlight, /category=milmyeon/)
  assert.match(categories, /'coffee-main':\s*{\s*label: '정문 커피'/)
  assert.match(categories, /'coffee-north':\s*{\s*label: '북문 커피'/)
  assert.doesNotMatch(categories, /label: '커피'/)
})
