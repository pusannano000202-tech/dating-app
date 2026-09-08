import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseCommunityListLimit,
  validateCommunityPostInput,
  validateMeetupCreateInput,
} from '../../lib/community/contracts'
import {
  communityDestinationGroups,
  launchWeekConcentrationStrip,
  meetupDiscoveryGroups,
} from '../../lib/community/catalog'

const NOW = new Date('2026-08-08T10:00:00.000Z')

test('community list limits are bounded for compact home requests', () => {
  assert.equal(parseCommunityListLimit('3'), 3)
  assert.equal(parseCommunityListLimit('999'), 30)
  assert.equal(parseCommunityListLimit('nope'), 30)
  assert.equal(parseCommunityListLimit(null), 30)
})

test('activity meetup input accepts a future school activity and normalizes text', () => {
  const result = validateMeetupCreateInput({
    category: 'basketball',
    title: '  오늘 저녁 농구  ',
    description: '초보도 함께해요.',
    place_name: '부산대 농구장',
    scheduled_at: '2026-08-08T12:00:00.000Z',
    capacity: 8,
  }, NOW)

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.value.title, '오늘 저녁 농구')
    assert.equal(result.value.capacity, 8)
  }
})

test('activity meetup input rejects dating filters, invalid capacity, and immediate schedules', () => {
  assert.deepEqual(validateMeetupCreateInput({
    category: 'dating',
    title: '오늘 저녁 모임',
    place_name: '부산대 앞',
    scheduled_at: '2026-08-08T12:00:00.000Z',
    capacity: 5,
  }, NOW), { ok: false, error: 'invalid_category' })

  const capacity = validateMeetupCreateInput({
    category: 'running',
    title: '오늘 저녁 러닝',
    place_name: '온천천',
    scheduled_at: '2026-08-08T12:00:00.000Z',
    capacity: 21,
  }, NOW)
  assert.deepEqual(capacity, { ok: false, error: 'invalid_capacity' })

  const schedule = validateMeetupCreateInput({
    category: 'running',
    title: '오늘 저녁 러닝',
    place_name: '온천천',
    scheduled_at: '2026-08-08T10:10:00.000Z',
    capacity: 8,
  }, NOW)
  assert.deepEqual(schedule, { ok: false, error: 'schedule_too_soon' })
})

test('community post input only accepts the approved four discussion categories', () => {
  const valid = validateCommunityPostInput({
    category: 'relationship-advice',
    title: '이 상황에서 어떻게 말할까요?',
    body: '상대방에게 부담을 주지 않으면서 솔직하게 말하고 싶어요.',
  })
  assert.equal(valid.ok, true)

  assert.deepEqual(validateCommunityPostInput({
    category: 'campus-eats',
    title: '돈까스 추천',
    body: 'Campus Eats는 별도 기능으로 운영합니다.',
  }), { ok: false, error: 'invalid_category' })
})

test('meetup discovery keeps four non-breaking groups with existing category IDs', () => {
  const groupsById = new Map(meetupDiscoveryGroups.map((group) => [group.id, group.categories]))

  assert.equal(meetupDiscoveryGroups.length, 4)
  assert.equal(groupsById.get('exercise')?.includes('running'), true)
  assert.equal(groupsById.get('exercise')?.includes('basketball'), true)
  assert.equal(groupsById.get('games')?.includes('board_game'), true)
  assert.equal(groupsById.get('games')?.includes('gaming'), true)
  assert.equal(groupsById.get('study')?.includes('study'), true)
  assert.equal(groupsById.get('lifestyle')?.includes('dining'), true)
})

test('launch week concentration strip is preview-only and only labels each weekday', () => {
  assert.equal(launchWeekConcentrationStrip.length, 5)
  assert.deepEqual(
    launchWeekConcentrationStrip.map((item) => item.preview),
    [true, true, true, true, true],
  )
  assert.deepEqual(
    launchWeekConcentrationStrip.map((item) => item.day),
    ['월', '화', '수', '목', '금'],
  )
  assert.equal(launchWeekConcentrationStrip.some((item) => item.category === 'board_game'), true)
  assert.equal(launchWeekConcentrationStrip.some((item) => item.category === 'walking'), true)
})

test('community destinations are grouped into three destination sections', () => {
  const groupIds = communityDestinationGroups.map((group) => group.id)
  assert.deepEqual(groupIds, ['연애 이야기', '사용자 후기', '우리 주변 맛집'])
  assert.equal(
    communityDestinationGroups.some((group) => group.categories.includes('meetup-review')),
    true,
  )
  assert.equal(
    communityDestinationGroups.some((group) => group.categories.includes('campus-eats')),
    true,
  )
  assert.equal(
    communityDestinationGroups.every((group) => group.categories.length >= 1),
    true,
  )
})
