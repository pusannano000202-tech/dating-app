import { mergeActivityRoomMessages } from './activity-room-contract'
import type { StudyRoomDetail } from './study-room-contract'

/** A new server snapshot owns membership/session state, not the already paged-back history. */
export function mergeStudyRoomSnapshot(previous: StudyRoomDetail | null, incoming: StudyRoomDetail, historyLoaded: boolean): StudyRoomDetail {
  if (!historyLoaded || previous?.id !== incoming.id) return incoming
  return { ...incoming, messages: mergeActivityRoomMessages(previous.messages, incoming.messages), has_older_messages: previous.has_older_messages }
}
export function isStudyRoomAccessRevoked(code: string): boolean {
  return ['Unauthorized', 'not_authenticated', 'study_room_forbidden', 'study_room_membership_required', 'department_identity_required', 'profile_required', 'study_room_not_found'].includes(code) || code.startsWith('account_')
}
export function clearAcknowledgedDraft(current: string, sent: string): string {
  return current.trim() === sent.trim() ? '' : current
}
/** Fixed Korean calendar copy prevents ICU/locale differences during SSR hydration. */
export function formatStudyTime(value: string): string {
  const stamp = Date.parse(value)
  if (!Number.isFinite(stamp)) return '시간 확인 필요'
  const kst = new Date(stamp + 9 * 60 * 60 * 1000)
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 (${['일','월','화','수','목','금','토'][kst.getUTCDay()]}) ${String(kst.getUTCHours()).padStart(2,'0')}:${String(kst.getUTCMinutes()).padStart(2,'0')}`
}
