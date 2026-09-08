import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PUBLIC_PLACE_KEYS,
  type PublicPlaceDto,
} from '../../lib/places/contracts'
import {
  buildProviderSearchLinks,
  createProviderLink,
  isAllowedProviderUrl,
} from '../../lib/places/provider-links'
import { projectPublicPlace } from '../../lib/places/public-projection'
import { projectVenueSnapshotRow } from '../../lib/places/venue-snapshot'

function publicPlaceSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    placeRef: 'venue:restaurant-1',
    snapshotRevision: 'snapshot-2026-09-03-1',
    displayName: '수수하지만굉장해 부산대점',
    category: 'restaurant',
    areaLabel: '부산대 북문',
    address: {
      road: '부산 금정구 금강로 271-5',
      evidence: 'provider-verified',
      verifiedAt: '2026-09-03T01:00:00.000Z',
      providerRawAddress: 'must-not-leak',
    },
    coordinates: {
      latitude: 35.2321,
      longitude: 129.0842,
      evidence: 'provider-verified',
      verifiedAt: '2026-09-03T01:00:00.000Z',
      checkinRadiusMeters: 75,
    },
    providerLinks: {
      naver: {
        url: 'https://map.naver.com/p/search/%EC%88%98%EC%88%98%ED%95%98%EC%A7%80%EB%A7%8C%EA%B5%89%EC%9E%A5%ED%95%B4',
        kind: 'search',
        providerPlaceId: 'secret-provider-id',
      },
      kakao: {
        url: 'https://map.kakao.com/?q=%EC%88%98%EC%88%98%ED%95%98%EC%A7%80%EB%A7%8C%EA%B5%89%EC%9E%A5%ED%95%B4',
        kind: 'search',
      },
      rawProviderPayload: { internal: true },
    },
    phone: '010-0000-0000',
    adminNotes: 'private-note',
    capacityTeams: 8,
    settlementAmount: 50000,
    checkinRadiusMeters: 100,
    providerSecret: 'provider-secret',
    rawProviderPayload: { internal: true },
    currentLocation: { latitude: 35, longitude: 129 },
    ...overrides,
  }
}

test('public place projection emits only the exact public allowlist and freezes nested data', () => {
  const place = projectPublicPlace(publicPlaceSource())

  assert.deepEqual(Object.keys(place), PUBLIC_PLACE_KEYS)
  assert.deepEqual(Object.keys(place.address ?? {}), ['road', 'evidence', 'verifiedAt'])
  assert.deepEqual(Object.keys(place.coordinates ?? {}), ['latitude', 'longitude', 'evidence', 'verifiedAt'])
  assert.deepEqual(Object.keys(place.providerLinks), ['naver', 'kakao'])
  assert.deepEqual(Object.keys(place.providerLinks.naver ?? {}), ['url', 'kind'])
  assert.equal(Object.isFrozen(place), true)
  assert.equal(Object.isFrozen(place.address), true)
  assert.equal(Object.isFrozen(place.coordinates), true)
  assert.equal(Object.isFrozen(place.providerLinks), true)

  const serialized = JSON.stringify(place)
  for (const forbidden of [
    '010-0000-0000',
    'private-note',
    'capacityTeams',
    'settlementAmount',
    'checkinRadiusMeters',
    'provider-secret',
    'secret-provider-id',
    'rawProviderPayload',
    'currentLocation',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `public DTO leaked ${forbidden}`)
  }
})

test('public place projection accepts finite coordinate boundaries', () => {
  const southWest = projectPublicPlace(publicPlaceSource({
    coordinates: {
      latitude: -90,
      longitude: -180,
      evidence: 'operator-verified',
      verifiedAt: null,
    },
  }))
  const northEast = projectPublicPlace(publicPlaceSource({
    coordinates: {
      latitude: 90,
      longitude: 180,
      evidence: 'geocoded-address',
      verifiedAt: null,
    },
  }))

  assert.equal(southWest.coordinates?.latitude, -90)
  assert.equal(southWest.coordinates?.longitude, -180)
  assert.equal(northEast.coordinates?.latitude, 90)
  assert.equal(northEast.coordinates?.longitude, 180)
})

test('public place projection rejects non-finite and out-of-range coordinates', () => {
  const invalidCoordinates = [
    { latitude: Number.NaN, longitude: 129 },
    { latitude: Number.POSITIVE_INFINITY, longitude: 129 },
    { latitude: 91, longitude: 129 },
    { latitude: -91, longitude: 129 },
    { latitude: 35, longitude: 181 },
    { latitude: 35, longitude: -181 },
  ]

  for (const coordinate of invalidCoordinates) {
    assert.throws(() => projectPublicPlace(publicPlaceSource({
      coordinates: {
        ...coordinate,
        evidence: 'provider-verified',
        verifiedAt: null,
      },
    })), /invalid_place_coordinates/)
  }
})

test('provider links require https and an exact provider hostname', () => {
  assert.equal(isAllowedProviderUrl('naver', 'https://map.naver.com/p/search/test'), true)
  assert.equal(isAllowedProviderUrl('kakao', 'https://map.kakao.com/?q=test'), true)
  assert.equal(isAllowedProviderUrl('naver', 'http://map.naver.com/p/search/test'), false)
  assert.equal(isAllowedProviderUrl('naver', 'https://map.naver.com.evil.example/p/search/test'), false)
  assert.equal(isAllowedProviderUrl('kakao', 'https://evil.example/?next=https://map.kakao.com'), false)
  assert.equal(isAllowedProviderUrl('kakao', 'https://map.naver.com/p/search/test'), false)

  assert.throws(
    () => createProviderLink('naver', 'javascript:alert(1)', 'place'),
    /invalid_provider_url/,
  )
  assert.throws(
    () => createProviderLink('kakao', 'https://map.kakao.com.evil.example/place/1', 'place'),
    /invalid_provider_url/,
  )
})

test('provider search links are validated and honestly marked as searches', () => {
  const links = buildProviderSearchLinks('  부산대 수수하지만굉장해  ')

  assert.equal(links.naver?.kind, 'search')
  assert.equal(links.kakao?.kind, 'search')
  assert.equal(isAllowedProviderUrl('naver', links.naver?.url ?? ''), true)
  assert.equal(isAllowedProviderUrl('kakao', links.kakao?.url ?? ''), true)
  assert.match(decodeURIComponent(links.naver?.url ?? ''), /부산대 수수하지만굉장해/)
  assert.equal(new URL(links.kakao?.url ?? '').searchParams.get('q'), '부산대 수수하지만굉장해')
})

test('public projection rejects a provider link assigned to the wrong provider', () => {
  const source = publicPlaceSource()
  const providerLinks = source.providerLinks as Record<string, unknown>

  assert.throws(() => projectPublicPlace({
    ...source,
    providerLinks: {
      ...providerLinks,
      naver: { url: 'https://map.kakao.com/?q=wrong-provider', kind: 'search' },
    },
  }), /invalid_provider_url/)
})

test('public place DTO supports address and coordinate absence without inventing precision', () => {
  const place: PublicPlaceDto = projectPublicPlace(publicPlaceSource({
    address: null,
    coordinates: null,
    providerLinks: { naver: null, kakao: null },
  }))

  assert.equal(place.address, null)
  assert.equal(place.coordinates, null)
  assert.deepEqual(place.providerLinks, { naver: null, kakao: null })
})

test('venue snapshot rows become the same public place contract without private columns', () => {
  const place = projectVenueSnapshotRow({
    id: 'snapshot-row-id',
    venue_id: 'venue-id',
    snapshot_revision: 'snapshot-revision',
    display_name: '장전 보드라운지',
    venue_category: 'activity',
    area_label: '부산대역 생활권',
    address: '부산 금정구 장전동 1-2',
    address_evidence: 'operator-verified',
    address_verified_at: '2026-09-03T09:00:00+09:00',
    latitude: 35.2301,
    longitude: 129.0845,
    coordinate_evidence: 'operator-verified',
    coordinates_verified_at: '2026-09-03T09:00:00+09:00',
    naver_url: 'https://map.naver.com/p/search/%EC%9E%A5%EC%A0%84%20%EB%B3%B4%EB%93%9C%EB%9D%BC%EC%9A%B4%EC%A7%80',
    naver_link_kind: 'search',
    kakao_url: null,
    kakao_link_kind: null,
    phone: '051-000-0000',
    capacity_teams: 9,
  })

  assert.equal(place.placeRef, 'venue:venue-id')
  assert.equal(place.snapshotRevision, 'snapshot-revision')
  assert.equal(place.address?.road, '부산 금정구 장전동 1-2')
  assert.equal(place.coordinates?.latitude, 35.2301)
  assert.equal(place.providerLinks.naver?.kind, 'search')
  assert.equal(JSON.stringify(place).includes('051-000-0000'), false)
  assert.equal(JSON.stringify(place).includes('capacity_teams'), false)
})
