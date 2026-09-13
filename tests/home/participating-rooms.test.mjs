import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(relative, dependencies = {}) {
  const exports = {}
  const source = readFileSync(new URL('../../' + relative, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('exports', 'require', compiled)(exports, name => {
    if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name)
    return dependencies[name]
  })
  return exports
}
const { homeParticipatingRooms } = load('lib/home/participating-rooms.ts', { './my-meetups': load('lib/home/my-meetups.ts') })
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const room = { kind: 'meetup', id, title: '월요일 영어 대화 2번 방', affiliation: '어학', member_count: 3, writable: true, updated_at: '2026-09-14T02:00:00Z' }
const meetup = { kind: 'scheduled', id, title: '이전 제목', activity_key: 'language-exchange', room_number: null, member_count: 2, capacity: 5, scheduled_at: null, place_name: null, status: 'open', schedule_status: 'schedule_pending' }
const social = rooms => ({ owner_id: id, rooms, has_more: false, next_cursor: null })

test('scheduled enrichment joins by normalized kind and id, preserving actual social room identity', () => {
  const result = homeParticipatingRooms(social([room]), { items: [meetup], has_more: false })
  assert.equal(result.length, 1)
  assert.equal(result[0].title, room.title)
  assert.equal(result[0].member_count, 3)
  assert.equal(result[0].capacity, 5)
  assert.equal(result[0].activity_key, 'language-exchange')
  assert.equal(result[0].statusLabel, '일정 정하는 중')
  assert.equal(result[0].detail, '시간·장소는 채팅에서 함께 정하기')
})
test('study, mentoring and both league room kinds survive without the old home API', () => {
  const rooms = ['activity_room', 'study_room', 'mentoring', 'league_team', 'league_match'].map(kind => ({ ...room, kind }))
  const result = homeParticipatingRooms(social(rooms), null)
  assert.deepEqual(result.map(item => item.kind), rooms.map(item => item.kind))
  assert.ok(result.every(item => item.capacity === null))
})
test('unrelated old membership does not inject rooms or enrich a different room kind', () => {
  assert.deepEqual(homeParticipatingRooms(social([]), { items: [meetup], has_more: false }), [])
  const result = homeParticipatingRooms(social([{ ...room, kind: 'study_room' }]), { items: [meetup], has_more: false })
  assert.equal(result[0].capacity, null)
  assert.equal(result[0].activity_key, undefined)
})
test('read-only rooms stay visibly read-only and stale capacity never contradicts current membership', () => {
  const result = homeParticipatingRooms(social([{ ...room, writable: false, member_count: 6 }]), { items: [meetup], has_more: false })
  assert.equal(result[0].statusLabel, '읽기 전용')
  assert.equal(result[0].capacity, null)
})
