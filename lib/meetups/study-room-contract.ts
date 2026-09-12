/** Persistent room, recommended session and personal attendance are deliberately separate. */
export const STUDY_ROOM_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type StudyRoomLevel = typeof STUDY_ROOM_LEVELS[number]
export type StudyRoomSummary = {
  id: string; course_id: string; course_name: string; level: StudyRoomLevel;
  department_label: string; room_number: number; capacity: 5; member_count: number;
  joined: boolean; current_session: number; status: 'recruiting' | 'full' | 'completed';
  admission_mode?: 'legacy_auto'|'hosted'; title?:string; is_host?:boolean; recruitment_closed?:boolean;
}
export type StudyScheduleProposal = {
  id: string; starts_at: string; place_name: string; place_note: string;
  is_sponsored: boolean; proposer_alias: string; votes: number; confirmations: number;
  my_vote: boolean; my_confirmation: boolean;
}
export type StudyRoomSession = {
  session_number: number; status: 'planning' | 'confirmed' | 'completed';
  my_attendance: 'undecided' | 'attending' | 'skipping' | 'not_member';
  attending_count: number; my_schedule_accepted: boolean; completion_confirmed: boolean;
  completed_count: number; starts_at: string | null; place_name: string | null;
  place_note: string | null; is_sponsored: boolean; proposals: StudyScheduleProposal[];
  recaps: { id: string; author_alias: string; text: string; created_at: string }[];
}
export type StudyRoomDetail = StudyRoomSummary & {
  membership_since: string; recommended_sessions: 10;
  members: { member_id: string; alias: string; is_me: boolean }[];
  sessions: StudyRoomSession[];
  messages: { id: string; sender_alias: string; message: string; created_at: string; is_me: boolean }[];
  has_older_messages: boolean;
}
export type StudyRoomAction =
  | { action: 'join' }
  | { action: 'attendance'; session_number: number; attending: boolean }
  | { action: 'message'; message: string; idempotency_key: string }
  | { action: 'propose_schedule'; session_number: number; starts_at: string; place_name: string; place_note?: string; is_sponsored?: boolean }
  | { action: 'vote_schedule' | 'confirm_schedule'; session_number: number; proposal_id: string }
  | { action: 'accept_schedule' | 'complete_session'; session_number: number }
  | { action: 'recap'; session_number: number; text: string }
export type StudyRoomLeaveResult = { left: true; report_status: 'not_requested' | 'saved' | 'failed' }
export type StudyRoomHistory = Pick<StudyRoomDetail, 'messages' | 'has_older_messages'>
export const STUDY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isStudyRoomLevel = (value: unknown): value is StudyRoomLevel => STUDY_ROOM_LEVELS.includes(value as StudyRoomLevel)
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max
export function validateStudyRoomAction(value: unknown): value is StudyRoomAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  if (input.action === 'join') return true
  if (input.action === 'message') return text(input.message, 1000) && typeof input.idempotency_key === 'string' && STUDY_UUID.test(input.idempotency_key)
  if (!Number.isInteger(input.session_number) || Number(input.session_number) < 1 || Number(input.session_number) > 10) return false
  if (input.action === 'attendance') return typeof input.attending === 'boolean'
  if (input.action === 'accept_schedule' || input.action === 'complete_session') return true
  if (input.action === 'recap') return text(input.text, 1500)
  if (input.action === 'vote_schedule' || input.action === 'confirm_schedule') return typeof input.proposal_id === 'string' && STUDY_UUID.test(input.proposal_id)
  if (input.action === 'propose_schedule') return typeof input.starts_at === 'string' && Number.isFinite(Date.parse(input.starts_at)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(input.starts_at)
    && text(input.place_name, 120) && (input.place_note === undefined || typeof input.place_note === 'string' && input.place_note.length <= 500)
    && (input.is_sponsored === undefined || typeof input.is_sponsored === 'boolean')
  return false
}
export function studyRoomErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    Unauthorized: '로그인하고 같은 과 사람들과 함께해요.', department_identity_required: '프로필에 학교와 학과를 먼저 입력해 주세요.',
    profile_required: '가입 정보를 먼저 완성해 주세요.', study_room_forbidden: '이 모임은 가입 정보가 같은 학과인 사람만 참여할 수 있어요.',
    study_room_membership_required: '모임에 참여하면 이전 대화와 다음 약속을 확인할 수 있어요.',
    admission_required:'보증금을 확인하고 참가 신청을 보내 주세요. 개설자가 승인하면 채팅이 열려요.',
    hosted_creation_required:'새 방 이름을 정하고 직접 개설해 주세요.',
    study_room_full: '그사이 다섯 명이 모였어요. 다른 방을 골라 주세요.', study_room_already_joined: '이 과목의 다른 방에 참여 중이에요. 내 방에서 먼저 나와 주세요.',
    study_session_not_current: '회차가 바뀌었어요. 새로고침 후 현재 회차에서 진행해 주세요.',
    study_session_attendance_required: '먼저 이번 회차에 참여를 선택해 주세요.', study_schedule_not_ready: '참여자 모두 같은 약속을 고르고 확인하면 확정돼요.',
    study_schedule_closed: '이미 확정된 약속이에요. 새로 들어와도 기존 약속은 바뀌지 않아요.',
    study_session_not_started: '약속 시간이 지난 뒤 이번 회차를 마칠 수 있어요.', study_schedule_acceptance_required: '이번 회차의 확정된 시간과 장소를 먼저 확인해 주세요.',
    study_room_not_found: '모임을 찾을 수 없어요.', invalid_course_id: '과목을 다시 선택해 주세요. 목록에 없다면 과목명을 직접 입력할 수 있어요.',
    study_room_closed: '이 모임은 마무리되었거나 모두 나간 이전 모임이에요. 새로 모집 중인 방을 골라 주세요.',
    community_schema_unavailable: '모임 저장 기능을 준비 중이에요. 연결이 완료되면 실제 모집을 시작할 수 있어요.', community_unavailable: '연결이 잠시 원활하지 않아요. 다시 시도해 주세요.',
    study_rate_limited: '잠시 쉬었다가 다시 보내 주세요.', study_session_participation_required: '참여한 회차에서만 학습 기록을 남길 수 있어요.',
  }
  return messages[code] ?? '요청을 처리하지 못했어요. 새로고침 후 다시 시도해 주세요.'
}

const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
const integer = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && Number(v) >= min && Number(v) <= max
const date = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v))
const bounded = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const uuid = (v: unknown): v is string => typeof v === 'string' && STUDY_UUID.test(v)

function summary(value: unknown): StudyRoomSummary | null {
  const v = record(value)
  if (!v || !uuid(v.id) || !text(v.course_id, 100) || !text(v.course_name, 80) || !isStudyRoomLevel(v.level)
    || !text(v.department_label, 120) || !integer(v.room_number, 1, 1000000) || v.capacity !== 5 || !integer(v.member_count, 0, 5)
    || typeof v.joined !== 'boolean' || !integer(v.current_session, 1, 10) || !['recruiting', 'full', 'completed'].includes(v.status as string)) return null
  if ((v.status === 'full' && v.member_count !== 5) || (v.status === 'recruiting' && v.member_count === 5)) return null
  if(v.admission_mode!==undefined&&(!['legacy_auto','hosted'].includes(String(v.admission_mode))||!text(v.title,120)||typeof v.is_host!=='boolean'))return null
  if(v.recruitment_closed!==undefined&&typeof v.recruitment_closed!=='boolean')return null
  return { id: v.id, course_id: v.course_id as string, course_name: v.course_name as string, level: v.level,
    department_label: v.department_label as string, room_number: v.room_number, capacity: 5, member_count: v.member_count,
    joined: v.joined, current_session: v.current_session, status: v.status as StudyRoomSummary['status'],
    ...(v.admission_mode===undefined?{}:{admission_mode:v.admission_mode as 'legacy_auto'|'hosted',title:v.title as string,is_host:v.is_host as boolean}),
    ...(v.recruitment_closed===undefined?{}:{recruitment_closed:v.recruitment_closed as boolean}) }
}
export function parseStudyRoomList(value: unknown): { rooms: StudyRoomSummary[] } | null {
  const v = record(value)
  if (!v || !Array.isArray(v.rooms) || v.rooms.length > 500) return null
  const rooms: StudyRoomSummary[] = []
  for (const item of v.rooms) { const parsed = summary(item); if (!parsed || rooms.some(r => r.id === parsed.id)) return null; rooms.push(parsed) }
  return { rooms }
}
export function parseStudyRoomHistory(value: unknown): StudyRoomHistory | null {
  const v = record(value)
  if (!v || !Array.isArray(v.messages) || v.messages.length > 100 || typeof v.has_older_messages !== 'boolean') return null
  const messages: StudyRoomHistory['messages'] = []
  for (const item of v.messages) {
    const m = record(item)
    if (!m || !uuid(m.id) || !text(m.sender_alias, 100) || !text(m.message, 1000) || !date(m.created_at) || typeof m.is_me !== 'boolean'
      || messages.some(previous => previous.id === m.id)) return null
    messages.push({ id: m.id, sender_alias: m.sender_alias as string, message: m.message as string, created_at: m.created_at, is_me: m.is_me })
  }
  return { messages, has_older_messages: v.has_older_messages }
}
function proposal(value: unknown): StudyScheduleProposal | null {
  const v = record(value)
  if (!v || !uuid(v.id) || !date(v.starts_at) || !text(v.place_name, 120) || !bounded(v.place_note, 500)
    || typeof v.is_sponsored !== 'boolean' || !text(v.proposer_alias, 100) || !integer(v.votes, 0, 5)
    || !integer(v.confirmations, 0, v.votes) || typeof v.my_vote !== 'boolean' || typeof v.my_confirmation !== 'boolean') return null
  return { id: v.id, starts_at: v.starts_at, place_name: v.place_name as string, place_note: v.place_note,
    is_sponsored: v.is_sponsored, proposer_alias: v.proposer_alias as string, votes: v.votes, confirmations: v.confirmations,
    my_vote: v.my_vote, my_confirmation: v.my_confirmation }
}
function session(value: unknown): StudyRoomSession | null {
  const v = record(value)
  if (!v || !integer(v.session_number, 1, 10) || !['planning', 'confirmed', 'completed'].includes(v.status as string)
    || !['undecided', 'attending', 'skipping', 'not_member'].includes(v.my_attendance as string)
    || !integer(v.attending_count, 0, 5) || !integer(v.completed_count, 0, 5)
    || typeof v.my_schedule_accepted !== 'boolean' || typeof v.completion_confirmed !== 'boolean' || typeof v.is_sponsored !== 'boolean'
    || !(v.starts_at === null || date(v.starts_at)) || !(v.place_name === null || text(v.place_name, 120))
    || !(v.place_note === null || bounded(v.place_note, 500)) || !Array.isArray(v.proposals) || v.proposals.length > 8 || !Array.isArray(v.recaps) || v.recaps.length > 100) return null
  if (v.status !== 'planning' && (v.starts_at === null || v.place_name === null)) return null
  const proposals: StudyScheduleProposal[] = []
  for (const item of v.proposals) { const parsed = proposal(item); if (!parsed || proposals.some(p => p.id === parsed.id)) return null; proposals.push(parsed) }
  const recaps: StudyRoomSession['recaps'] = []
  for (const item of v.recaps) {
    const r = record(item)
    if (!r || !uuid(r.id) || !text(r.author_alias, 100) || !text(r.text, 1500) || !date(r.created_at)) return null
    recaps.push({ id: r.id, author_alias: r.author_alias as string, text: r.text as string, created_at: r.created_at })
  }
  return { session_number: v.session_number, status: v.status as StudyRoomSession['status'], my_attendance: v.my_attendance as StudyRoomSession['my_attendance'],
    attending_count: v.attending_count, my_schedule_accepted: v.my_schedule_accepted, completion_confirmed: v.completion_confirmed,
    completed_count: v.completed_count, starts_at: v.starts_at as string | null, place_name: v.place_name as string | null, place_note: v.place_note as string | null,
    is_sponsored: v.is_sponsored, proposals, recaps }
}
export function parseStudyRoomDetail(value: unknown): StudyRoomDetail | null {
  const v = record(value); const base = summary(value); const history = parseStudyRoomHistory(value)
  if (!v || !base || !history || !base.joined || v.recommended_sessions !== 10 || !date(v.membership_since)
    || !Array.isArray(v.members) || v.members.length !== base.member_count || !Array.isArray(v.sessions) || v.sessions.length !== 10) return null
  const members: StudyRoomDetail['members'] = []
  for (const item of v.members) {
    const m = record(item)
    if (!m || !uuid(m.member_id) || !text(m.alias, 100) || typeof m.is_me !== 'boolean' || members.some(p => p.member_id === m.member_id)) return null
    members.push({ member_id: m.member_id, alias: m.alias as string, is_me: m.is_me })
  }
  if (members.filter(m => m.is_me).length !== 1) return null
  const sessions: StudyRoomSession[] = []
  for (const item of v.sessions) { const parsed = session(item); if (!parsed || parsed.session_number !== sessions.length + 1) return null; sessions.push(parsed) }
  return { ...base, ...history, membership_since: v.membership_since, recommended_sessions: 10, members, sessions }
}
export function isStudyRoomDetail(value: unknown): value is StudyRoomDetail { return parseStudyRoomDetail(value) !== null }

/** Provider errors are normalized without exposing SQL, schema names or auth diagnostics. */
export function classifyStudyRoomError(error: { message: string; code?: string }): { error: string; status: number } {
  const message = error.message.toLowerCase()
  if (/does not exist|schema cache|42p01|42883/.test(message) || ['42P01', '42883', 'PGRST202'].includes(error.code ?? '')) return { error: 'community_schema_unavailable', status: 503 }
  if (message === 'activity_room_forbidden') return { error: 'study_room_forbidden', status: 403 }
  const match = message.match(/^(study_[a-z_]+|invalid_[a-z_]+|department_identity_required|profile_required|not_authenticated|account_[a-z_]+|idempotency_key_reused|admission_required|hosted_creation_required|contact_sharing_not_allowed)$/)
  const code = match?.[1] ?? 'community_unavailable'
  const status = /rate_limited/.test(code) ? 429 : code === 'not_authenticated' ? 401
    : /forbidden|membership_required|account_/.test(code) ? 403 : /not_found/.test(code) ? 404
    : /^invalid_|contact_sharing/.test(code) ? 400 : code === 'community_unavailable' ? 503 : 409
  return { error: code, status }
}
