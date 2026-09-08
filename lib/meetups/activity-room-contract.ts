import { featuredMeetupIdeas, getMeetupCapacityRecommendation } from '../community/catalog'
import { isMeetupGenderMode, type MeetupGenderMode } from '../community/meetup-gender'

export type ActivityRoomSummary = {
  id: string
  room_number: number
  member_count: number
  capacity: number
  joined: boolean
  status: 'recruiting' | 'full'
  joinable: boolean
}
export type ActivityRoomLobby = {
  activity_key: string
  gender_mode: MeetupGenderMode
  capacity: number
  room_count: number
  rooms: ActivityRoomSummary[]
}
export type ActivityRoomDetail = ActivityRoomSummary & {
  activity_key: string
  gender_mode: MeetupGenderMode
  members: Array<{ alias: string; is_me: boolean }>
  messages: Array<{ id: string; sender_alias: string; message: string; created_at: string; is_me: boolean }>
}
export type ActivityRoomMessage = ActivityRoomDetail['messages'][number]
export type ActivityRoomCursor = { created_at: string; id: string }
export type ActivityRoomMessagePage = {
  room_id: string
  messages: ActivityRoomMessage[]
  has_more: boolean
  next_cursor: ActivityRoomCursor | null
}

export function isActivityRoomCursor(value: unknown): value is ActivityRoomCursor {
  return record(value) && isActivityRoomId(value.id) && typeof value.created_at === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.created_at)
    && Number.isFinite(Date.parse(value.created_at))
}

export function parseActivityRoomMessagePage(value: unknown): ActivityRoomMessagePage | null {
  if (!record(value) || !isActivityRoomId(value.room_id) || !Array.isArray(value.messages) || value.messages.length > 100 || typeof value.has_more !== 'boolean') return null
  if (!value.messages.every(item => record(item) && typeof item.sender_alias === 'string' && typeof item.message === 'string' && typeof item.is_me === 'boolean' && isActivityRoomCursor(item))) return null
  if (new Set(value.messages.map(item => item.id)).size !== value.messages.length) return null
  const first = value.messages[0]
  if (value.has_more ? !first || !isActivityRoomCursor(value.next_cursor) || value.next_cursor.id !== first.id || value.next_cursor.created_at !== first.created_at : value.next_cursor !== null) return null
  return value as ActivityRoomMessagePage
}

export function mergeActivityRoomMessages(existing: ActivityRoomMessage[], incoming: ActivityRoomMessage[]): ActivityRoomMessage[] {
  const byId = new Map(existing.map(item => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  // Date retains milliseconds only; use the remaining PostgreSQL precision for ties.
  const microseconds = (stamp: string) => Number((stamp.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6))
  return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    || microseconds(a.created_at) - microseconds(b.created_at) || a.id.localeCompare(b.id))
}

export function getActivityRoomDefinition(key: string) {
  const idea = featuredMeetupIdeas.find(item => item.id === key)
  return idea ? { ...idea, capacity: getMeetupCapacityRecommendation(idea.category) } : null
}
export function isActivityRoomId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function isRoom(value: unknown, capacity: number): boolean {
  return record(value) && isActivityRoomId(value.id) && Number.isInteger(value.room_number) && Number(value.room_number) > 0
    && value.capacity === capacity && Number.isInteger(value.member_count) && Number(value.member_count) >= 0
    && Number(value.member_count) <= capacity && typeof value.joined === 'boolean'
    && value.status === (value.member_count === capacity ? 'full' : 'recruiting')
    && typeof value.joinable === 'boolean' && !(value.joinable && (value.member_count === capacity || value.joined))
}
export function parseActivityRoomLobby(value: unknown): ActivityRoomLobby | null {
  if (!record(value) || typeof value.activity_key !== 'string' || !isMeetupGenderMode(value.gender_mode)) return null
  const definition = getActivityRoomDefinition(value.activity_key)
  if (!definition || value.capacity !== definition.capacity || !Array.isArray(value.rooms) || value.room_count !== value.rooms.length) return null
  if (!value.rooms.every(room => isRoom(room, definition.capacity))) return null
  if (new Set(value.rooms.map(room => room.id)).size !== value.rooms.length || new Set(value.rooms.map(room => room.room_number)).size !== value.rooms.length) return null
  return value as ActivityRoomLobby
}
export function parseActivityRoomDetail(value: unknown): ActivityRoomDetail | null {
  if (!record(value) || typeof value.activity_key !== 'string' || !isMeetupGenderMode(value.gender_mode)) return null
  const definition = getActivityRoomDefinition(value.activity_key)
  if (!definition || !isRoom(value, definition.capacity) || !Array.isArray(value.members) || !Array.isArray(value.messages)) return null
  if (!value.members.every(member => record(member) && typeof member.alias === 'string' && typeof member.is_me === 'boolean')) return null
  if (!value.messages.every(message => record(message) && isActivityRoomId(message.id) && typeof message.sender_alias === 'string'
    && typeof message.message === 'string' && typeof message.is_me === 'boolean' && typeof message.created_at === 'string' && Number.isFinite(Date.parse(message.created_at)))) return null
  return value as ActivityRoomDetail
}

export function activityRoomErrorMessage(code: string): string {
  if (code === 'invalid_activity_room_cursor') return '대화 목록이 바뀌었어요. 채팅을 새로고침한 뒤 다시 확인해 주세요.'
  if (/not_found/.test(code)) return '이 방은 더 이상 열려 있지 않아요. 방 목록에서 모집 중인 방을 확인해 주세요.'
  if (/rate_limited/.test(code)) return '메시지를 너무 빠르게 보내고 있어요. 잠시 뒤 다시 보내 주세요.'
  if (code === 'contact_sharing_not_allowed') return '전화번호·외부 연락처 대신 앱 안에서 대화해 주세요.'
  if (code === 'idempotency_key_reused') return '전송 상태를 다시 확인한 뒤 메시지를 보내 주세요.'
  if (code === 'Unauthorized' || code === 'not_authenticated') return '로그인하고 학교 친구들의 모임방을 확인해 주세요.'
  if (/gender_restricted/.test(code)) return '선택한 방의 참여 성별 조건에 맞지 않아요.'
  if (/gender_required|profile_required/.test(code)) return '학교와 참여 조건을 확인할 수 있도록 프로필을 먼저 완성해 주세요.'
  if (/room_full/.test(code)) return '방이 방금 가득 찼어요. 목록에서 다음 모집방을 선택해 주세요.'
  if (/already_joined/.test(code)) return '이미 참여 중인 방이 있어요. 내 방에서 이어가 주세요.'
  if (/not_joinable|blocked|forbidden|membership_required/.test(code)) return '이 방에 참여하거나 내용을 볼 수 없어요. 방 목록을 다시 확인해 주세요.'
  return '지금은 모임방 서버에 연결할 수 없어요. 실제 방 수와 인원을 확인한 뒤에만 참여할 수 있어요.'
}
