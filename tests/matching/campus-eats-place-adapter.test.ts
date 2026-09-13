import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CAMPUS_EATS_PLACE_FIXTURE_REVISION,
  classifyCampusEatsMapResolution,
  toCampusEatsPublicPlace,
} from '../../lib/campus-eats/place-adapter'
import {
  PNU_CAMPUS_EATS_CATEGORIES,
  type CampusEatsCandidate,
} from '../../lib/campus-eats/fixtures/pnu-categories'
import { CAMPUS_EATS_SCHOOLS } from '../../lib/campus-eats/fixtures/regional'

function findCandidate(canonicalStoreId: string, categoryId: string): CampusEatsCandidate {
  const category = PNU_CAMPUS_EATS_CATEGORIES.find((item) => item.id === categoryId)
  const candidate = category?.candidates.find((item) => item.canonicalStoreId === canonicalStoreId)
  assert.ok(candidate, `${canonicalStoreId} must exist in ${categoryId}`)
  return candidate
}

test('the same store in different categories keeps one stable public place reference', () => {
  const pizzaCandidate = findCandidate('pnu:store:070', 'pizza')
  const chickenCandidate = findCandidate('pnu:store:070', 'chicken')

  const pizzaPlace = toCampusEatsPublicPlace(pizzaCandidate)
  const chickenPlace = toCampusEatsPublicPlace(chickenCandidate)

  assert.notEqual(pizzaCandidate.id, chickenCandidate.id)
  assert.equal(pizzaPlace.placeRef, pizzaCandidate.canonicalStoreId)
  assert.equal(chickenPlace.placeRef, chickenCandidate.canonicalStoreId)
  assert.equal(pizzaPlace.placeRef, chickenPlace.placeRef)
  assert.equal(pizzaPlace.snapshotRevision, CAMPUS_EATS_PLACE_FIXTURE_REVISION)
  assert.equal(chickenPlace.snapshotRevision, CAMPUS_EATS_PLACE_FIXTURE_REVISION)
  assert.notEqual(pizzaPlace.snapshotRevision, pizzaCandidate.sourceSha256)
})

test('a search-verified Campus Eats address never becomes provider coordinates', () => {
  const candidate = findCandidate('pnu:store:001', 'donkatsu')
  assert.equal(candidate.coordinateStatus, 'search_verified')

  const place = toCampusEatsPublicPlace(candidate)

  assert.deepEqual(place.address, {
    road: candidate.roadAddress,
    evidence: 'search-verified',
    verifiedAt: null,
  })
  assert.equal(place.coordinates, null)
  assert.equal(place.providerLinks.naver?.kind, 'place')
  assert.equal(place.providerLinks.naver?.url, 'https://map.naver.com/p/entry/place/2035526670')
  assert.equal(place.providerLinks.kakao?.kind, 'search')
  assert.equal(new URL(place.providerLinks.naver!.url).hostname, 'map.naver.com')
  assert.equal(new URL(place.providerLinks.kakao!.url).hostname, 'map.kakao.com')
})

test('missing address stays null while honest provider search links remain available', () => {
  const source = findCandidate('pnu:store:001', 'donkatsu')
  const candidate: CampusEatsCandidate = {
    ...source,
    roadAddress: '',
    coordinateStatus: 'not_collected',
    imageSourceUrl: '',
  }

  const place = toCampusEatsPublicPlace(candidate)

  assert.equal(place.address, null)
  assert.equal(place.coordinates, null)
  assert.equal(place.providerLinks.naver?.kind, 'search')
  assert.equal(place.providerLinks.kakao?.kind, 'search')
  assert.match(decodeURIComponent(place.providerLinks.naver!.url), new RegExp(candidate.name))
  assert.doesNotMatch(decodeURIComponent(place.providerLinks.naver!.url), /undefined|null/)
})

test('location links preserve each restaurant source ID without turning another provider or a search into an exact place', () => {
  const source = findCandidate('pnu:store:001', 'donkatsu')
  for (const category of PNU_CAMPUS_EATS_CATEGORIES.filter(item => item.id === 'donkatsu' || item.id === 'pizza')) {
    for (const candidate of category.candidates) {
      const place = toCampusEatsPublicPlace(candidate)
      const sourceUrl = new URL(candidate.imageSourceUrl)
      const placeId = sourceUrl.hostname === 'pcmap.place.naver.com' ? sourceUrl.pathname.match(/^\/(?:restaurant|place|cafe)\/(\d+)(?:\/|$)/)?.[1] : null
      assert.equal(place.providerLinks.naver?.kind, placeId ? 'place' : 'search', candidate.name)
      if (placeId) assert.equal(place.providerLinks.naver?.url, `https://map.naver.com/p/entry/place/${placeId}`, candidate.name)
      assert.equal(place.coordinates, null, 'an ID is not coordinate evidence')
    }
  }
  for (const imageSourceUrl of [
    'https://pcmap.place.naver.com.evil.example/restaurant/2035526670/photo',
    'https://pcmap.place.naver.com@evil.example/restaurant/2035526670',
    'http://pcmap.place.naver.com/restaurant/2035526670',
    'https://pcmap.place.naver.com:8443/restaurant/2035526670',
    'https://map.naver.com/p/search/무쿠',
    'https://pcmap.place.naver.com/restaurant/not-a-place-id/photo',
    '',
  ]) {
    const place = toCampusEatsPublicPlace({ ...source, imageSourceUrl })
    assert.equal(place.providerLinks.naver?.kind, 'search', imageSourceUrl)
    assert.match(decodeURIComponent(place.providerLinks.naver!.url), new RegExp(source.name))
    assert.match(decodeURIComponent(place.providerLinks.naver!.url), new RegExp(source.roadAddress))
  }
})

test('a real non-PNU candidate keeps its school name in provider searches when its address is missing', () => {
  const school = CAMPUS_EATS_SCHOOLS.find((item) => item.id === 'ewha')
  const candidate = school?.categories[0]?.candidates[0]
  assert.ok(school)
  assert.ok(candidate)
  assert.equal(candidate.roadAddress, '')

  const place = toCampusEatsPublicPlace(candidate, { schoolName: school.name })
  const naverSearch = decodeURIComponent(place.providerLinks.naver!.url)
  const kakaoSearch = new URL(place.providerLinks.kakao!.url).searchParams.get('q')

  assert.match(naverSearch, new RegExp(school.name))
  assert.match(naverSearch, new RegExp(candidate.name))
  assert.match(kakaoSearch ?? '', new RegExp(school.name))
  assert.match(kakaoSearch ?? '', new RegExp(candidate.name))
  assert.equal(place.address, null)
  assert.equal(place.coordinates, null)
})

test('a real non-PNU fixture with zero addresses cannot become a ready campus map', () => {
  const school = CAMPUS_EATS_SCHOOLS.find((item) => item.id === 'ewha')
  assert.ok(school)
  const places = school.categories[0].candidates.map((candidate) => (
    toCampusEatsPublicPlace(candidate, { schoolName: school.name })
  ))
  const addressCount = places.filter((place) => place.address !== null).length

  assert.equal(addressCount, 0)
  assert.equal(classifyCampusEatsMapResolution(addressCount, 0), 'missing-addresses')
  assert.equal(classifyCampusEatsMapResolution(4, 0), 'unresolved-addresses')
  assert.equal(classifyCampusEatsMapResolution(4, 1), 'ready')
})

test('coffee candidates project to cafe while meal candidates project to restaurant', () => {
  const coffee = PNU_CAMPUS_EATS_CATEGORIES.find((item) => item.id === 'coffee-main')?.candidates[0]
  const meal = PNU_CAMPUS_EATS_CATEGORIES.find((item) => item.id === 'milmyeon')?.candidates[0]
  assert.ok(coffee)
  assert.ok(meal)

  assert.equal(toCampusEatsPublicPlace(coffee).category, 'cafe')
  assert.equal(toCampusEatsPublicPlace(meal).category, 'restaurant')
})
