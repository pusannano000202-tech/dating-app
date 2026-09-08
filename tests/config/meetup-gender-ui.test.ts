import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { MEETUP_GENDER_LABELS } from '../../lib/community/meetup-gender'

const createForm = readComponent('CreateMeetupForm.tsx')
const meetupHub = readComponent('MeetupHub.tsx')

test('meetup creation presents all three gender conditions and submits the selected contract value', () => {
  assert.match(createForm, /MEETUP_GENDER_MODES/)
  assert.match(createForm, /MeetupGenderMode/)
  assert.match(createForm, /useState<MeetupGenderMode>\('all'\)/)
  assert.match(createForm, /<legend[^>]*>참여 성별 조건<\/legend>/)
  assert.deepEqual(MEETUP_GENDER_LABELS, { all: '성별 무관', male_only: '남자끼리', female_only: '여자끼리' })
  assert.match(createForm, /MEETUP_GENDER_LABELS\[mode\]/)
  assert.match(createForm, /등록 프로필 성별로 개설·참가 조건을 확인해요/)
  assert.match(createForm, /gender_mode:\s*genderMode/)
})

test('meetup creation explains server-authoritative missing and restricted gender cases', () => {
  assert.match(createForm, /meetup_gender_required/)
  assert.match(createForm, /meetup_gender_restricted/)
})

test('meetup hub preserves the gender filter in its URL and uses the API gender query', () => {
  assert.match(meetupHub, /gender_mode/)
  assert.match(meetupHub, /isMeetupGenderMode/)
  assert.match(meetupHub, /참여 성별 조건 필터/)
  assert.match(meetupHub, /MEETUP_GENDER_LABELS\[mode\]/)
  assert.match(meetupHub, /params\.set\('gender_mode', genderFilter\)/)
  assert.match(meetupHub, /nextGenderFilter/)
  assert.match(meetupHub, /rememberFilters\(discoveryScope, category, studyTopic, mode\)/)
})

test('meetup cards use DTO eligibility without exposing raw gender and only block a new join', () => {
  assert.match(meetupHub, /gender_eligibility/)
  assert.match(meetupHub, /gender_mode/)
  assert.match(meetupHub, /성별 조건을 확인할 수 없어 참여할 수 없어요/)
  assert.match(meetupHub, /!meetup\.joined && .*genderEligibility !== 'eligible'/)
  assert.match(meetupHub, /meetup_gender_required/)
  assert.match(meetupHub, /meetup_gender_restricted/)
  assert.doesNotMatch(meetupHub, /raw_gender|profile_gender|user_gender/)
})

test('one membership request synchronously locks every meetup action until it settles', () => {
  assert.match(meetupHub, /membershipRequestInFlight\.current/)
  assert.match(meetupHub, /if \(meetup\.is_host \|\| membershipRequestInFlight\.current\) return/)
  assert.match(meetupHub, /membershipRequestInFlight\.current = true/)
  assert.match(meetupHub, /membershipRequestInFlight\.current = false/)
  assert.match(meetupHub, /disabled=\{busyId !== null \|\| meetup\.is_host/)
})

function readComponent(file: string) {
  return readFileSync(join(process.cwd(), 'components', 'meetups', file), 'utf8')
}
