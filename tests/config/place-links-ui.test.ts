import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import PlaceMap from '../../components/places/PlaceMap'
import type { PublicPlaceDto } from '../../lib/places/contracts'

const ROOT = process.cwd()

function readSource(path: string): string {
  const absolutePath = join(ROOT, path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

test('place links expose accessible external Naver and Kakao anchors', () => {
  const component = readSource('components/places/PlaceLinks.tsx')

  assert.match(component, /providerLinks\.naver/)
  assert.match(component, /providerLinks\.kakao/)
  assert.match(component, /<a/)
  assert.match(component, /target="_blank"/)
  assert.match(component, /rel="noreferrer"/)
  assert.match(component, /aria-label=/)
  assert.match(component, /새 창/)
})

test('place map uses the approved Naver key and keeps honest address and link fallback content', () => {
  const component = readSource('components/places/PlaceMap.tsx')
  const sdk = readSource('lib/places/naver-maps-sdk.ts')

  assert.match(component, /NEXT_PUBLIC_NAVER_MAPS_NCP_KEY_ID/)
  assert.doesNotMatch(component, /NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID/)
  assert.match(component, /loadNaverMapsSdk/)
  assert.match(component, /subscribeNaverMapsAuthFailure/)
  assert.match(component, /authFailed/)
  assert.match(sdk, /oapi\.map\.naver\.com\/openapi\/v3\/maps\.js/)
  assert.match(sdk, /oapi\.map\.naver\.com\/openapi\/v3\/maps-geocoder\.js/)
  assert.doesNotMatch(sdk, /submodules=geocoder/)
  assert.match(component, /new maps\.Map/)
  assert.match(component, /new maps\.Marker/)
  assert.match(component, /ref=\{containerRef\}[\s\S]*className="h-\[280px\] w-full"/)
  assert.doesNotMatch(component, /ref=\{containerRef\}[\s\S]{0,120}className="absolute inset-0"/)
  assert.match(component, /place\.address\?\.road/)
  assert.match(component, /<PlaceLinks place=\{place\}/)
  assert.match(component, /지도.*불러오지 못했어요/)
  assert.match(component, /주소와 외부 지도 링크는 계속 사용할 수 있어요/)
  assert.match(component, /role="status"/)
  assert.match(component, /aria-live="polite"/)
  assert.doesNotMatch(component, /navermap_authFailure\s*=/)
})

test('opening a place map never asks for or watches the current location', () => {
  const component = readSource('components/places/PlaceMap.tsx')

  assert.match(component, /export default function PlaceMap/)
  assert.doesNotMatch(component, /navigator\.geolocation/)
  assert.doesNotMatch(component, /getCurrentPosition/)
  assert.doesNotMatch(component, /watchPosition/)
  assert.doesNotMatch(component, /currentLocation/)
})

test('place map does not promise an address or links when both are absent', () => {
  const place: PublicPlaceDto = {
    placeRef: 'venue:area-only',
    snapshotRevision: 'snapshot-area-only-1',
    displayName: '부산대 인근 모임 장소',
    category: 'public-meeting-point',
    areaLabel: '부산대 인근',
    address: null,
    coordinates: null,
    providerLinks: { naver: null, kakao: null },
  }

  const html = renderToStaticMarkup(createElement(PlaceMap, { place }))

  assert.doesNotMatch(html, /주소와 외부 지도 링크는 계속 사용할 수 있어요/)
  assert.match(html, /상세 주소와 외부 지도 링크는 아직 준비되지 않았어요/)
  assert.doesNotMatch(html, /<a\b/)
})
