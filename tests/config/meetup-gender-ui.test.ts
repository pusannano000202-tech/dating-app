import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

import { isMeetupGenderMode, MEETUP_GENDER_LABELS } from '../../lib/community/meetup-gender'

const createForm = readComponent('CreateMeetupForm.tsx')
const meetupHub = readComponent('MeetupHub.tsx')

test('meetup creation presents all three gender conditions and submits the selected contract value', () => {
  assert.match(createForm, /MEETUP_GENDER_MODES/)
  assert.match(createForm, /MeetupGenderMode/)
  assert.match(createForm, /const requestedGender = searchParams\.get\('gender_mode'\)/)
  const initialGender = createForm.match(/useState<MeetupGenderMode>\(([^\r\n]+)\)/)?.[1]
  assert.ok(initialGender, 'the form initializes a validated gender condition from discovery')
  const resolveGender = new Function('requestedGender', 'isMeetupGenderMode', `return ${initialGender}`) as (value: unknown, validate: typeof isMeetupGenderMode) => unknown
  for (const value of ['all', 'male_only', 'female_only']) assert.equal(resolveGender(value, isMeetupGenderMode), value)
  for (const value of [null, undefined, '', 'male', 'admin', '<script>']) assert.equal(resolveGender(value, isMeetupGenderMode), 'all')
  assert.match(createForm, /<legend[^>]*>\{t\('참여 성별 조건'\)\}<\/legend>/)
  assert.deepEqual(MEETUP_GENDER_LABELS, { all: '성별 무관', male_only: '남자끼리', female_only: '여자끼리' })
  assert.match(createForm, /MEETUP_GENDER_MODES\.map\(value\s*=>\s*<button[\s\S]*?aria-pressed=\{genderMode===value\}[\s\S]*?onClick=\{\(\)=>setGenderMode\(value\)\}[\s\S]*?\{t\(MEETUP_GENDER_LABELS\[value\]\)\}/)
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

test('one cancellation synchronously locks membership mutations while new joins enter admission', async () => {
  assert.match(meetupHub, /membershipRequestInFlight\.current/)
  assert.match(meetupHub, /if \(meetup\.is_host \|\| !meetup\.joined \|\| membershipRequestInFlight\.current\) return/)
  assert.match(meetupHub, /membershipRequestInFlight\.current = true/)
  assert.match(meetupHub, /membershipRequestInFlight\.current = false/)
  assert.match(meetupHub, /disabled=\{busyId !== null \|\| meetup\.is_host/)
  assert.match(meetupHub, /!meetup\.is_host && !meetup\.joined && meetup\.status !== 'full' && genderEligibility === 'eligible' \? <Link href=\{`\/meetups\/\$\{encodeURIComponent\(meetup\.id\)\}\/apply`\}/)
  const action = meetupHub.match(/async function toggleMembership\(meetup: MeetupRecord\) \{[\s\S]*?(?=\r?\n  function chooseSocialLane)/)?.[0]
  assert.ok(action, 'the real membership cancellation caller remains testable')
  assert.match(action, /method: 'DELETE'/)
  assert.doesNotMatch(action, /method: 'POST'/)
  const code = ts.transpileModule(`${action}\nreturn toggleMembership`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const inFlight = { current: false }
  const requests: { path: string; init: { method: string } }[] = []
  const busyIds: (string | null)[] = []
  let finish: ((value: null) => void) | undefined
  const mutate = new Function('membershipRequestInFlight', 'setBusyId', 'setNotice', 'fetch', 'getMembershipError', 'setMeetups', 'setLoadState', 'setReloadToken', code)(
    inFlight, (value: string | null) => busyIds.push(value), () => {},
    (path: string, init: { method: string }) => { requests.push({ path, init }); return new Promise<null>((resolve) => { finish = resolve }) },
    () => 'request failed', () => {}, () => {}, () => {},
  ) as (meetup: { id: string; is_host: boolean; joined: boolean }) => Promise<void>
  const room = { id: 'fixture-room', is_host: false, joined: true }
  await mutate({ ...room, is_host: true })
  await mutate({ ...room, joined: false })
  assert.equal(requests.length, 0, 'hosts and prospective joiners cannot issue the legacy membership mutation')
  const pending = mutate(room)
  assert.equal(inFlight.current, true)
  await mutate(room)
  assert.deepEqual(requests, [{ path: '/api/meetups/fixture-room/join', init: { method: 'DELETE' } }])
  assert.ok(finish)
  finish(null)
  await pending
  assert.equal(inFlight.current, false, 'a failed request releases the synchronous lock')
  assert.deepEqual(busyIds, ['fixture-room', null])
})

function readComponent(file: string) {
  return readFileSync(join(process.cwd(), 'components', 'meetups', file), 'utf8')
}
