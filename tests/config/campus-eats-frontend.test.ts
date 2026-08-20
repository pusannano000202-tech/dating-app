import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function readSource(path: string): string {
  const absolutePath = join(ROOT, path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

test('campus eats pilot isolates its route and requires both production flags', () => {
  const route = readSource('app/(campus-eats)/community/campus-eats/page.tsx')
  const envExample = readSource('.env.example')
  const localEnvExample = readSource('.env.local.example')

  assert.match(route, /CampusEatsPilot/)
  assert.match(route, /notFound/)
  assert.match(route, /process\.env\.NODE_ENV !== 'production'/)
  assert.match(route, /process\.env\.NEXT_PUBLIC_COMMUNITY_ENABLED === 'true'/)
  assert.match(route, /process\.env\.NEXT_PUBLIC_CAMPUS_EATS_ENABLED === 'true'/)
  assert.match(envExample, /NEXT_PUBLIC_CAMPUS_EATS_ENABLED=false/)
  assert.match(envExample, /NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID=/)
  assert.match(localEnvExample, /NEXT_PUBLIC_CAMPUS_EATS_ENABLED=false/)
  assert.match(localEnvExample, /NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID=/)
  assert.doesNotMatch(route, /components\/community|app\/community/)
})

test('campus eats pilot keeps the visited-candidate tournament contract and public claims honest', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')
  const fixture = readSource('lib/campus-eats/fixtures/pnu-categories.ts')
  const generatedFixture = JSON.parse(readSource('lib/campus-eats/fixtures/pnu-restaurants.generated.json')) as {
    restaurants: Array<{ canonicalStoreId: string; name: string; categories: string[]; imageSrc: string }>
  }

  assert.match(component, /TournamentSetupView/)
  assert.match(component, /selectedVisitedCandidateIds/)
  assert.match(component, /createVisitedTournamentSession/)
  assert.match(component, /getTournamentProgress/)
  assert.match(component, /both_visited_prefer_a/)
  assert.match(component, /both_visited_prefer_b/)
  assert.match(component, /CandidateVisual candidate={candidate}/)
  assert.doesNotMatch(component, /CandidateVisual candidate={candidateA}/)
  assert.doesNotMatch(component, /CandidateVisual candidate={candidateB}/)
  assert.match(component, /aria-label=/)
  assert.match(fixture, /원본 비율 유지 · 방문 전 영업 확인/)
  assert.match(component, /storageKey\(selectedSchool\.id, selectedCategory\.id\)/)
  assert.match(component, /eventSequenceRef/)
  assert.match(component, /localStorage/)
  assert.match(component, /visiblePair/)
  assert.match(component, /feedbackTimeoutRef/)
  assert.match(component, /clearTimeout/)
  assert.match(component, /tournamentStarted/)
  assert.match(component, /tournamentId/)
  assert.doesNotMatch(component, /비슷함|기억 흐림|하루 3대결/)
  assert.doesNotMatch(component, /별점|후기\s*\d+|참여자\s*\d+명|인기 맛집/)
  assert.doesNotMatch(component, /components\/community|app\/community/)
  assert.equal(generatedFixture.restaurants.length, 93)
  assert.equal(generatedFixture.restaurants.filter((restaurant) => restaurant.categories.includes('donkatsu')).length, 14)
  assert.equal(generatedFixture.restaurants.filter((restaurant) => restaurant.categories.includes('coffee-main')).length, 17)
  assert.equal(generatedFixture.restaurants.filter((restaurant) => restaurant.categories.includes('coffee-north')).length, 13)
  assert.doesNotMatch(JSON.stringify(generatedFixture), /"coffee"/)
  assert.ok(generatedFixture.restaurants.some((restaurant) => restaurant.name === '수수하지만굉장해 부산대점'))
  assert.ok(generatedFixture.restaurants.every((restaurant) => restaurant.imageSrc.startsWith('/campus-eats/restaurants/')))
  assert.doesNotMatch(JSON.stringify(generatedFixture), /알통떡강정/)
})

test('campus eats regional candidate packs keep six isolated schools with eight verified candidates each', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')
  const regionalSource = readSource('lib/campus-eats/fixtures/regional-campuses.json')
  assert.notEqual(regionalSource, '', 'regional candidate data file')
  const data = JSON.parse(regionalSource) as {
    schools: Array<{
      id: string
      name: string
      candidates: Array<{ name: string; district: string; verifyStatus: string }>
    }>
  }

  assert.equal(data.schools.length, 6)
  assert.equal(data.schools[0].candidates.length, 0, 'PNU uses the canonical category fixture only')
  assert.deepEqual(data.schools.map((school) => school.name), [
    '부산대',
    '이화여대',
    '대구가톨릭대',
    '청주대',
    '조선대',
    '강원대',
  ])
  for (const school of data.schools.slice(1)) {
    assert.equal(school.candidates.length, 8, `${school.name} 후보 수`)
    assert.ok(school.candidates.every((candidate) => candidate.verifyStatus === '조사 후보 · 출시 전 지도·영업 재확인'))
  }
  assert.ok(data.schools[1].candidates.some((candidate) => candidate.name === '사장님돈까스 이화여대점'))
  assert.ok(data.schools[2].candidates.some((candidate) => candidate.name === '카츠3.9(대구가톨릭대 푸드스퀘어 13번가)'))
  assert.ok(data.schools[5].candidates.some((candidate) => candidate.name === '온숯카츠'))
  assert.ok(data.schools.every((school) => school.candidates.every((candidate) => candidate.name !== '온찬')))
  assert.match(component, /quantum-campus-eats-\$\{schoolId\}-\$\{categoryId\}-v4/)
  assert.match(component, /storageKey\(selectedSchool\.id, selectedCategory\.id\)/)
  assert.match(component, /setSelectedSchoolId/)
})

test('campus eats restores saved sessions to the map without forcing a battle screen', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')

  assert.match(component, /function normalizeStoredPilot/)
  assert.match(component, /stored\.session\.status !== 'active' && view === 'battle'/)
  assert.match(component, /stored\.session\.status !== 'active' && view === 'setup'/)
  assert.match(component, /view = 'result'/)
  assert.match(component, /stored\.session\.status === 'active' && view === 'result'/)
  assert.match(component, /view = 'map'/)
  assert.doesNotMatch(component, /setView\(restored\.view\)/)
  assert.match(component, /setView\('map'\)/)
  assert.match(component, /restored\.selectedCandidateId/)
  assert.match(component, /requestedCandidateId/)
})

test('campus eats candidate previews keep images unobstructed and contextualize Naver searches', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')
  const fixture = readSource('lib/campus-eats/fixtures/pnu-categories.ts')
  const candidateVisual = component.slice(component.indexOf('function CandidateVisual'), component.indexOf('function BattleView'))
  const battle = component.slice(component.indexOf('function BattleView'), component.indexOf('function MapView'))

  assert.doesNotMatch(candidateVisual, /disclosure/)
  assert.doesNotMatch(candidateVisual, /absolute inset-x-0 bottom-0/)
  assert.match(candidateVisual, /candidate\.imageSrc/)
  assert.match(candidateVisual, /object-contain/)
  assert.doesNotMatch(battle, /absolute right-3 top-3/)
  assert.doesNotMatch(battle, /absolute inset-x-2 bottom-10/)
  assert.match(battle, /data-ui="battle-action-strip"/)
  assert.match(battle, /category\.imageDisclosure/)
  assert.match(fixture, /imageDisclosure/)
  assert.match(fixture, /map\.naver\.com\/p\/search/)
  assert.match(fixture, /restaurant\.name.*restaurant\.roadAddress/)
})

test('campus eats setup selects every visited restaurant before the bracket begins', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')

  assert.match(component, /function TournamentSetupView/)
  assert.match(component, /aria-pressed=\{selected\}/)
  assert.match(component, /먹어본 곳을 먼저 모두 골라주세요/)
  assert.match(component, /\$\{selectedCount\}곳으로 \$\{category\.label\} 월드컵 시작/)
  assert.match(component, /선택한 \{selectedCount\}곳/)
  assert.match(component, /총 \{Math\.max\(0, selectedCount - 1\)\}번 승부/)
  assert.match(component, /data-visit-state=\{selected \? 'visited' : 'unvisited'\}/)
  assert.match(component, /bg-\[#fff1ed\]/)
  assert.match(component, /최소 2곳/)
})

test('campus eats explains its visit-first battle with a replayable comic guide', () => {
  const pilot = readSource('components/campus-eats/CampusEatsPilot.tsx')
  const guide = readSource('components/campus-eats/CampusEatsBattleGuide.tsx')
  const scenes = readSource('lib/campus-eats/battle-guide.ts')

  assert.match(pilot, /CampusEatsBattleGuide/)
  assert.match(pilot, /battleGuideStorageKey/)
  assert.match(pilot, /function battleGuideStorageKey\(schoolId: string\)/)
  assert.doesNotMatch(pilot, /function battleGuideStorageKey\(schoolId: string, categoryId/)
  assert.match(pilot, /quantum-campus-eats-battle-guide-\$\{schoolId\}-v4/)
  assert.doesNotMatch(pilot, /completedLegacyGuide/)
  assert.doesNotMatch(pilot, /legacyBattleGuideStorageKey/)
  assert.match(pilot, /진짜 1등을 뽑는 방식이에요/)
  assert.match(pilot, /진행 방법/)
  assert.match(guide, /campus-eats-battle-guide-v1\.png/)
  assert.match(guide, /onClose\?: \(\) => void/)
  assert.match(guide, /aria-label="안내 닫기"/)
  assert.match(pilot, /onClose=\{!battleGuideRequired \? \(\) => setBattleGuideOpen\(false\) : undefined\}/)
  assert.match(guide, /data-layout="campus-eats-comic-guide"/)
  assert.match(guide, /data-bubble="comic"/)
  assert.match(guide, /안내 확인 완료/)
  assert.match(pilot, /battleGuideRequired/)
  assert.match(pilot, /if \(requiresBattleGuide\) \{/)
  assert.match(pilot, /setView\(requiresBattleGuide \? 'map' : requestedView\)/)
  assert.match(pilot, /!battleGuideRequired/)
  assert.match(pilot, /setBattleGuideRequired\(true\)/)
  assert.match(pilot, /setBattleGuideRequired\(false\)/)
  assert.match(scenes, /먹어본 곳을 먼저 모아요/)
  assert.match(scenes, /승자를 다음 라운드로/)
  assert.match(scenes, /마지막 한 곳이 내 챔피언/)
  assert.equal(existsSync(join(ROOT, 'public/campus-eats/campus-eats-battle-guide-v1.png')), true)
})

test('campus eats uses semantic food icons across community discovery and battle navigation', () => {
  const icons = readSource('components/campus-eats/CampusEatsCategoryIcon.tsx')
  const spotlight = readSource('components/community/CommunitySpotlight.tsx')
  const pilot = readSource('components/campus-eats/CampusEatsPilot.tsx')

  assert.match(icons, /donkatsu: Beef/)
  assert.match(icons, /pizza: Pizza/)
  assert.match(icons, /chicken: Drumstick/)
  assert.match(icons, /'coffee-main': Coffee/)
  assert.match(icons, /'coffee-north': Coffee/)
  assert.match(icons, /gukbap: Soup/)
  assert.match(icons, /milmyeon: Wheat/)
  assert.match(spotlight, /CampusEatsCategoryIcon/)
  assert.match(pilot, /CampusEatsCategoryIcon/)
  assert.match(pilot, /CampusEatsCategoryIcon categoryId=\{candidate\.categoryId\}/)
  assert.doesNotMatch(spotlight, /<Utensils/)
  assert.doesNotMatch(pilot, /function CategoryIcon/)
  assert.doesNotMatch(pilot, /<Coffee size=\{36\}/)
})

test('campus eats uses the official Naver map adapter with an honest missing-key state', () => {
  const map = readSource('components/campus-eats/NaverCampusMap.tsx')

  assert.match(map, /NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID/)
  assert.match(map, /oapi\.map\.naver\.com\/openapi\/v3\/maps\.js/)
  assert.match(map, /submodules=geocoder/)
  assert.match(map, /zoomControl:\s*true/)
  assert.match(map, /new window\.naver\.maps\.Marker/)
  assert.match(map, /fitBounds/)
  assert.match(map, /네이버 지도 연결이 필요해요/)
  assert.doesNotMatch(map, /leaflet|openstreetmap/i)
})

test('campus eats map flow connects category tabs, a collapsible ranking rail, and collecting scores', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')

  assert.match(component, /selectedCategoryId/)
  assert.match(component, /category\.label/)
  assert.match(component, /NaverCampusMap/)
  assert.match(component, /rankingOpen/)
  assert.match(component, /1500/)
  assert.match(component, /categoryDataStatus/)
  assert.match(component, /storageKey\(selectedSchool\.id, selectedCategory\.id\)/)
  assert.match(component, /const restoredView = resolveAutoView\([\s\S]*?restored\.tournamentStarted,[\s\S]*?restored\.view/)
  assert.match(component, /setView\(restoredRequiresBattleGuide \? 'map' : restoredView\)/)
  assert.match(component, /restored\.selectedCandidateId/)
  assert.match(component, /requestedCandidateId/)
  assert.doesNotMatch(component, /setView\(restored\.view\)/)
})

test('campus eats hydrates category candidates through its API and synchronizes map state in the URL', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')

  assert.match(component, /fetch\(.*\/api\/campus-eats\?category=/)
  assert.match(component, /readCampusEatsUrlState/)
  assert.match(component, /writeCampusEatsUrlState/)
  assert.match(component, /window\.history\.replaceState/)
  assert.match(component, /restaurant_id/)
  assert.match(component, /categoryDataStatus/)
})

test('campus eats separates personal device ratings from collecting school results', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')

  assert.match(component, /applyPersonalRatingEvent/)
  assert.match(component, /ratingEligible/)
  assert.match(component, /ratingTransition/)
  assert.match(component, /personalRating/)
  assert.doesNotMatch(component, /school score|school leaderboard/i)
})

test('campus eats battle advances a real bracket and separates champion from cumulative Elo ranking', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')
  const battle = component.slice(component.indexOf('function BattleView'), component.indexOf('function MapView'))
  const result = component.slice(component.indexOf('function ResultView'))

  assert.match(battle, /getTournamentProgress\(session\)/)
  assert.match(battle, /progress\.roundLabel/)
  assert.match(battle, /progress\.currentRoundMatchNumber/)
  assert.match(battle, /progress\.totalComparisonCount/)
  assert.match(battle, /더 맛있어요/)
  assert.match(battle, /both_visited_prefer_a/)
  assert.match(battle, /both_visited_prefer_b/)
  assert.doesNotMatch(battle, /only_visited_a|only_visited_b|neutral_skip/)
  assert.match(battle, /CandidateVisual/)
  assert.match(battle, /aspect-\[4\/5\]/)
  assert.match(battle, /sm:grid-cols-2/)
  assert.match(result, /이번 월드컵 챔피언/)
  assert.match(result, /결승 승자가 이번 1위/)
  assert.match(result, /Elo는 모든 맞대결을 누적한 내 장기 순위/)
  assert.match(result, /session\.candidateIds/)
  assert.match(result, /const ratingDelta/)
  assert.doesNotMatch(result, /if \(winner && candidate[AB]\.id === winner\.id\)/)
})
