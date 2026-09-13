import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeStudyRoomSnapshot, isStudyRoomAccessRevoked, clearAcknowledgedDraft, formatStudyTime } from '../../lib/meetups/study-room-client-state'
import type { StudyRoomDetail } from '../../lib/meetups/study-room-contract'

const message = (id: string) => ({ id, sender_alias: '별명', message: id, created_at: `2026-09-10T00:00:${id.padStart(2,'0')}.000Z`, is_me: false })
const snapshot = (ids: string[], roomId = 'room-one') => ({ id: roomId, messages: ids.map(message), has_older_messages: true, current_session: 3 }) as StudyRoomDetail
test('loaded history survives refresh and mutations regardless of latest page length', () => {
  const previous = { ...snapshot(['01','02']), has_older_messages: false }
  const next = snapshot(['02','03','04'])
  const merged = mergeStudyRoomSnapshot(previous, next, true)
  assert.deepEqual(merged.messages.map(item => item.id), ['01','02','03','04'])
  assert.equal(merged.has_older_messages, false)
  assert.equal(mergeStudyRoomSnapshot(previous, next, false), next)
  assert.equal(mergeStudyRoomSnapshot(previous, snapshot(['05'],'other-room'), true).messages.length, 1)
})
test('authorization failures invalidate cached private room immediately', () => {
  for (const code of ['Unauthorized','not_authenticated','study_room_forbidden','study_room_membership_required','department_identity_required','account_suspended','profile_required']) assert.equal(isStudyRoomAccessRevoked(code), true)
  assert.equal(isStudyRoomAccessRevoked('community_unavailable'), false)
})
test('sending an older draft never deletes text written during the request', () => {
  assert.equal(clearAcknowledgedDraft('첫 메시지', '첫 메시지'), '')
  assert.equal(clearAcknowledgedDraft('다음 메시지', '첫 메시지'), '다음 메시지')
})
test('Korean time output is deterministic without server/browser Intl day-period differences', () => {
  assert.equal(formatStudyTime('2026-09-11T15:33:00.000Z'), '9월 12일 (토) 00:33')
  assert.equal(formatStudyTime('2026-12-31T15:00:00.000Z'), '1월 1일 (금) 00:00')
  assert.equal(formatStudyTime('invalid'), '시간 확인 필요')
})
