import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import ts from 'typescript'
const path = new URL('../../lib/home/my-meetups.ts', import.meta.url)
function helpers() {
  assert.ok(existsSync(path), 'dedicated own-meetup parser is required')
  const exports = {}
  new Function('exports', ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports)
  return exports
}
const room = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'activity_room', title: null, activity_key: 'team-gaming', room_number: 1, member_count: 4, capacity: 5, scheduled_at: null, place_name: null, status: 'open' }
test('valid own-room counts and href come from strict DTO, not public discovery', () => {
  const { parseMyMeetups, myMeetupHref } = helpers()
  assert.deepEqual(parseMyMeetups({ items: [room], has_more: false }), { items: [room], has_more: false })
  assert.equal(myMeetupHref(room), '/meetups/rooms/' + room.id)
  assert.equal(myMeetupHref({ ...room, kind: 'scheduled' }), '/meetups/' + room.id + '#meetup-chat')
})
test('unavailable/malformed data never turns into empty membership', () => {
  const { parseMyMeetups } = helpers()
  for (const value of [null, {}, { items: [] }, { items: [room, room], has_more: false }, { items: [{ ...room, id: '/bad' }], has_more: false }, { items: [{ ...room, member_count: 6 }], has_more: false }, { items: [{ ...room, capacity: 0 }], has_more: false }]) assert.equal(parseMyMeetups(value), null)
  assert.deepEqual(parseMyMeetups({ items: [], has_more: false }), { items: [], has_more: false })
})
test('scheduled meetup dates, titles and room variants are validated', () => {
  const { parseMyMeetups } = helpers()
  const scheduled = { ...room, kind: 'scheduled', title: '카페 모임', scheduled_at: '2026-09-09T10:00:00Z', place_name: '정문 카페', room_number: null }
  assert.ok(parseMyMeetups({ items: [scheduled], has_more: false }))
  for (const update of [{ scheduled_at: 'broken' }, { title: '' }, { kind: 'external' }, { status: 'cancelled' }]) assert.equal(parseMyMeetups({ items: [{ ...scheduled, ...update }], has_more: false }), null)
})
