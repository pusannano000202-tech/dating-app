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

test('campus eats pilot keeps the battle contract and public claims honest', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')
  const fixture = readSource('lib/campus-eats/fixtures/pnu-categories.ts')

  const choices = component.match(/choice: '(?:both_visited_prefer_[ab]|only_visited_[ab])'/g) ?? []

  assert.equal(choices.length, 4)
  assert.match(component, /이번 대결 건너뛰기/)
  assert.match(component, /SkipForward/)
  assert.match(component, /aria-label=/)
  assert.match(fixture, /시안용 이미지 · 실제 매장 메뉴 사진 아님/)
  assert.match(component, /학교 순위/)
  assert.match(component, /집계 중/)
  assert.match(component, /localStorage/)
  assert.match(component, /eventSequenceRef/)
  assert.match(component, /visiblePair/)
  assert.match(component, /feedbackTimeoutRef/)
  assert.match(component, /clearTimeout/)
  assert.match(component, /BATTLE_CANDIDATE_COUNT = 8/)
  assert.match(component, /battleCandidates/)
  assert.doesNotMatch(component, /비슷함|기억 흐림|하루 3대결/)
  assert.doesNotMatch(component, /1위|별점|후기\s*\d+|참여자\s*\d+명|인기 맛집/)
  assert.doesNotMatch(component, /components\/community|app\/community/)
  assert.equal((fixture.match(/id: 'pnu:donkatsu:/g) ?? []).length, 13)
  assert.equal((fixture.match(/id: 'pnu:coffee:/g) ?? []).length, 13)
  assert.match(fixture, /name: '톤쇼우'/)
  assert.match(fixture, /수수하지만굉장해 부산대점/)
  assert.doesNotMatch(fixture, /이태리삼촌|쑝쑝돈까스 부산대점|동경생돈까스네/)
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
  assert.match(component, /quantum-campus-eats-\$\{schoolId\}-\$\{categoryId\}-v2/)
  assert.match(component, /storageKey\(selectedSchool\.id, selectedCategory\.id\)/)
  assert.match(component, /setSelectedSchoolId/)
})

test('campus eats restores saved sessions to the map without forcing a battle screen', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')

  assert.match(component, /function normalizeStoredPilot/)
  assert.match(component, /stored\.session\.status !== 'active' && view === 'battle'/)
  assert.match(component, /view = 'result'/)
  assert.match(component, /stored\.session\.status === 'active' && view === 'result'/)
  assert.match(component, /view = 'map'/)
  assert.doesNotMatch(component, /setView\(restored\.view\)/)
  assert.match(component, /setView\('map'\)/)
  assert.match(component, /setSelectedCandidateId\(restored\.selectedCandidateId\)/)
})

test('campus eats candidate previews disclose generic images and contextualize Naver searches', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')
  const fixture = readSource('lib/campus-eats/fixtures/pnu-categories.ts')
  const candidateVisual = component.slice(component.indexOf('function CandidateVisual'), component.indexOf('function BattleView'))

  assert.match(candidateVisual, /disclosure/)
  assert.match(candidateVisual, /사진 권리 확인 중/)
  assert.match(fixture, /imageDisclosure/)
  assert.match(fixture, /map\.naver\.com\/p\/search/)
  assert.match(fixture, /seed\.name.*seed\.roadAddress/)
})

test('campus eats choice labels use the final Hangul syllable for subject particles', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')

  assert.match(component, /function subjectParticle/)
  assert.match(component, /0xac00/)
  assert.match(component, /0xd7a3/)
  assert.match(component, /\$\{candidateA\}\$\{subjectParticle\(candidateA\)\} 더 좋음/)
  assert.match(component, /\$\{candidateB\}\$\{subjectParticle\(candidateB\)\} 더 좋음/)
  assert.doesNotMatch(component, /이\/가 더 좋음/)
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
  assert.match(component, /집계 중/)
  assert.match(component, /내 기기 기준 1500/)
  assert.match(component, /네이버지도에서 장소 열기/)
  assert.match(component, /storageKey\(selectedSchool\.id, selectedCategory\.id\)/)
  assert.match(component, /setView\(resolveAutoView\(pendingDirectEntryRef\.current, selectedCategory\.id, restored\.session\)\)/)
  assert.match(component, /setSelectedCandidateId\(restored\.selectedCandidateId\)/)
  assert.doesNotMatch(component, /setView\(restored\.view\)/)
})

test('campus eats separates personal device ratings from collecting school results', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')

  assert.match(component, /applyPersonalRatingEvent/)
  assert.match(component, /ratingEligible/)
  assert.match(component, /내 기기 점수/)
  assert.match(component, /내 기기 전체 유효 비교/)
  assert.match(component, /이 기기에만 저장/)
  assert.match(component, /학교 (?:결과|순위).*집계 중/)
  assert.doesNotMatch(component, /학교 점수에 반영/)
})

test('campus eats mobile battle keeps two photos and four direct choices in 2x2 grids', () => {
  const component = readSource('components/campus-eats/CampusEatsPilot.tsx')
  const battle = component.slice(component.indexOf('function BattleView'), component.indexOf('function MapView'))

  assert.match(battle, /grid-cols-2/)
  assert.match(battle, /aspect-\[4\/5\]/)
  assert.match(battle, /candidateChoices\.map/)
  assert.doesNotMatch(battle, /md:grid-cols-2/)
})
