import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

test('campus eats map distinguishes complete and partial coverage with a checkable equation', () => {
  const map = readSource('components/campus-eats/NaverCampusMap.tsx')
  const pilot = readSource('components/campus-eats/CampusEatsPilot.tsx')

  assert.match(map, /summarizeCampusEatsMapCoverage/)
  assert.match(map, /status === 'complete'/)
  assert.match(map, /status === 'partial'/)
  assert.match(map, /위치 확인 \{coverage\.markerCount\}/)
  assert.match(map, /위치 미확인 \{coverage\.unresolvedCount\}/)
  assert.match(map, /후보 \{coverage\.totalCandidateCount\}/)
  assert.match(map, /전체 위치 표시 완료/)
  assert.match(map, /일부 위치 표시 실패/)
  assert.doesNotMatch(map, /일부 위치 확인 중/)
  assert.match(map, /실패 \{coverage\.unresolvedCount\}곳/)
  assert.match(map, /data-ui="campus-eats-map-retry"/)
  assert.match(map, /onCoverageChange/)
  assert.match(pilot, /resolvedCandidateIdSet\.has\(candidate\.id\)/)
  assert.match(pilot, /지도 핀 표시/)
  assert.match(pilot, /mapStatus === 'loading'/)
  assert.match(pilot, /지도 핀 미표시/)
})

test('campus eats separates overlapping pins without inventing missing-candidate coordinates', () => {
  const map = readSource('components/campus-eats/NaverCampusMap.tsx')

  assert.match(map, /createCampusEatsMarkerClusters/)
  assert.match(map, /activeClusterCandidateIds/)
  assert.match(map, /가까이 붙은 후보/)
  assert.match(map, /후보를 정확히 골라 주세요/)
  assert.match(map, /가까운 위치는 한 핀으로 묶고/)
  assert.match(map, /위치가 확인되지 않은 후보는 지도 핀으로 만들지 않습니다/)
  assert.doesNotMatch(map, /35\.2336,\s*129\.0796/)
  assert.match(map, /replaceChildren\(\)/)
})

test('the PNU fixture gives Jasmine Coffee one branch and one geocodable road address', () => {
  const fixture = JSON.parse(readSource('lib/campus-eats/fixtures/pnu-restaurants.generated.json')) as {
    restaurants: Array<{ canonicalStoreId: string; name: string; roadAddress: string }>
  }
  const jasmine = fixture.restaurants.find((restaurant) => restaurant.canonicalStoreId === 'pnu:store:062')

  assert.ok(jasmine)
  assert.equal(jasmine.name, '자스민커피 본점')
  assert.equal(jasmine.roadAddress, '부산광역시 금정구 부산대학로64번길 10')
  assert.doesNotMatch(jasmine.roadAddress, /\//)
})

test('campus eats geocoding is bounded-concurrent and reports visible progress', () => {
  const map = readSource('components/campus-eats/NaverCampusMap.tsx')
  const runtime = readSource('lib/campus-eats/map-runtime.ts')

  assert.match(map, /resolveCampusEatsGeocodeQueue/)
  assert.match(map, /CAMPUS_EATS_GEOCODE_CONCURRENCY/)
  assert.match(map, /주소 확인 \$\{geocodeProgress\.settled\}\/\$\{geocodeProgress\.total\}/)
  assert.match(runtime, /concurrency/)
  assert.match(runtime, /onProgress/)
  assert.match(runtime, /shouldCancel/)
  assert.match(runtime, /createCampusEatsSharedPromiseCache/)
})

test('a map pin selection shows its exact place name outside the map canvas', () => {
  const map = readSource('components/campus-eats/NaverCampusMap.tsx')

  assert.match(map, /data-ui="campus-eats-map-selection-caption"/)
  assert.match(map, /recentSelectedCandidate/)
  assert.match(map, /후보 \{String\(recentSelectedCandidate\.candidateNumber\)/)
  assert.match(map, /\{recentSelectedCandidate\.name\}/)
  assert.match(map, /className="[^\"]*shrink-0[^\"]*border-t/)
})

test('each battle candidate and the champion expose location actions without replacing battle state', () => {
  const pilot = readSource('components/campus-eats/CampusEatsPilot.tsx')
  const battle = pilot.slice(pilot.indexOf('function BattleView'), pilot.indexOf('function MapView'))
  const mapView = pilot.slice(pilot.indexOf('function MapView'), pilot.indexOf('function ResultView'))
  const result = pilot.slice(pilot.indexOf('function ResultView'))

  assert.match(battle, /toCampusEatsPublicPlace\(candidate,\s*\{\s*schoolName:\s*school\.name\s*\}\)/)
  assert.match(battle, /exactLocation \? '위치 확인' : '장소 검색'/)
  assert.match(battle, /정확한 장소 링크 미확인/)
  assert.match(battle, /target="_blank"/)
  assert.match(battle, /data-preserves-battle-state="true"/)
  assert.doesNotMatch(battle, /setView\(/)
  assert.match(result, /우승 장소 위치 확인/)
  assert.match(result, /<PlaceLinks place=\{winnerPlace\}/)
  assert.match(mapView, /data-ui="selected-place-panel"/)
  assert.doesNotMatch(mapView, /data-ui="selected-place-panel"[\s\S]{0,250}className="[^"]*fixed/)
})
