import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getCampusEatsSummary } from '../../lib/campus-eats/discovery'

test('catalog summary uses distinct stores and actual category cards', () => {
  assert.deepEqual(getCampusEatsSummary([
    { candidates: [{ canonicalStoreId: 'a' }, { canonicalStoreId: 'b' }] },
    { candidates: [{ canonicalStoreId: 'a' }] },
  ]), { storeCount: 2, cardCount: 3, categoryCount: 2 })
  assert.deepEqual(getCampusEatsSummary([]), { storeCount: 0, cardCount: 0, categoryCount: 0 })
})

test('live meetups precede the optional ideas area and have an honest empty state', () => {
  const source = readFileSync('components/meetups/MeetupHub.tsx', 'utf8')
  assert.ok(source.indexOf('id="open-meetups-heading"') < source.indexOf('id="meetup-ideas-heading"'))
  assert.match(source, /visibleMeetups.length === 0/)
  assert.match(source, /아직 모집 중인 모임이 없어요/)
  assert.match(source, /window.history.replaceState/)
  assert.match(source, /setReloadToken/)
  assert.doesNotMatch(source, /member_count: Math.max/)
})

test('community entry preserves personal ranking and survey data while delivery is paused', () => {
  const source = readFileSync('lib/community/experience-explorer.ts', 'utf8')
  assert.doesNotMatch(source, /1분 취향|전체 순위 보기|93곳|94장|한 곳만 고르면/)
  assert.match(source, /먹어본 곳 2곳/)
  assert.match(readFileSync('components/community/CommunitySpotlight.tsx', 'utf8'), /getCampusEatsSummary/)
  assert.match(source, /\/community\/mbti/)
  assert.doesNotMatch(source, /\/community\/campus-eats\/delivery/)
  assert.match(source, /\/community\/places/)
})
