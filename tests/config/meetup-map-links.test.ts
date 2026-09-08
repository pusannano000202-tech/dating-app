import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { projectLegacyMeetupPlace } from '../../lib/community/meetup-place'

test('legacy meetup place names become honest search-only public places', () => {
  const place = projectLegacyMeetupPlace({
    meetupId: 'meetup-123',
    placeName: '부산대 정문',
    category: 'walking',
  })

  assert.equal(place.placeRef, 'meetup:meetup-123')
  assert.equal(place.snapshotRevision, 'legacy-place-name:meetup-123')
  assert.equal(place.displayName, '부산대 정문')
  assert.equal(place.category, 'public-meeting-point')
  assert.equal(place.address, null)
  assert.equal(place.coordinates, null)
  assert.equal(place.providerLinks.naver?.kind, 'search')
  assert.equal(place.providerLinks.kakao?.kind, 'search')
  assert.match(place.providerLinks.naver?.url ?? '', /map\.naver\.com\/p\/search/)
  assert.match(place.providerLinks.kakao?.url ?? '', /map\.kakao\.com/)
})

test('meetup place adapter rejects missing identity or a blank place instead of inventing a map point', () => {
  assert.throws(
    () => projectLegacyMeetupPlace({ meetupId: '', placeName: '부산대 정문', category: 'walking' }),
    /invalid_meetup_place_identity/,
  )
  assert.throws(
    () => projectLegacyMeetupPlace({ meetupId: 'meetup-123', placeName: '   ', category: 'walking' }),
    /invalid_meetup_place_name/,
  )
})

test('meetup cards expose accessible Naver and Kakao search links without claiming exact coordinates', () => {
  const source = readFileSync(
    join(process.cwd(), 'components', 'meetups', 'MeetupHub.tsx'),
    'utf8',
  )

  assert.match(source, /projectLegacyMeetupPlace/)
  assert.match(source, /<PlaceLinks\s+place=\{projectLegacyMeetupPlace/)
  assert.doesNotMatch(source, /navigator\.geolocation|watchPosition|getCurrentPosition/)
})
