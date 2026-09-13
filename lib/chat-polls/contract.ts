export const CHAT_POLL_PURPOSES = ['schedule', 'place', 'role', 'general'] as const
export const CHAT_POLL_SELECTION_MODES = ['single', 'multiple'] as const
export const CHAT_POLL_ROOM_KINDS = {
  meetups: 'meetup',
  friends: 'friend',
  'department-challenges': 'department_challenge',
  'league-teams': 'league_team',
  'study-rooms': 'study_room',
  'mentoring-rooms': 'mentoring',
} as const

export function resolveChatPollRoomKind(value: string) {
  return Object.hasOwn(CHAT_POLL_ROOM_KINDS, value)
    ? CHAT_POLL_ROOM_KINDS[value as keyof typeof CHAT_POLL_ROOM_KINDS] : null
}

export type ChatPollPurpose = typeof CHAT_POLL_PURPOSES[number]
export type ChatPollSelectionMode = typeof CHAT_POLL_SELECTION_MODES[number]
export type ChatPollStatus = 'open' | 'closed' | 'cancelled'
export type ChatPollAgreementStatus = 'proposal' | 'confirmed'

export type CreateChatPollInput = {
  purpose: ChatPollPurpose
  title: string
  selectionMode: ChatPollSelectionMode
  options: string[]
  idempotencyKey: string
}

export type ChatPollOption = {
  id: string
  label: string
  position: number
  voteCount: number
  selectedByMe: boolean
}

export type ChatPollAgreement = {
  id: string
  version: number
  status: ChatPollAgreementStatus
  selectedOptionId: string
  summary: string
  confirmationCount: number
  requiredCount: number
  confirmedByMe: boolean
  membershipCurrent: boolean
  proposedAt: string
  confirmedAt: string | null
}

export type ChatPoll = {
  id: string
  purpose: ChatPollPurpose
  title: string
  selectionMode: ChatPollSelectionMode
  status: ChatPollStatus
  revision: number
  creatorAlias: string
  isCreator: boolean
  createdAt: string
  closedAt: string | null
  ballotCount: number
  options: ChatPollOption[]
  agreement: ChatPollAgreement | null
}

export type ChatPollBoard = { roomId: string; polls: ChatPoll[] }
export type ChatPollMutationEnvelope = {
  expectedViewerBinding: string
  payload: Record<string, unknown>
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value)
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const isNullableTimestamp = (value: unknown): value is string | null => value === null || isTimestamp(value)
const isInteger = (value: unknown, min = 0) => Number.isInteger(value) && Number(value) >= min

export function parseChatPollMutationEnvelope(value: unknown): ChatPollMutationEnvelope | null {
  if (!isRecord(value) || !isUuid(value.expected_viewer_binding)) return null
  return {
    expectedViewerBinding: value.expected_viewer_binding,
    payload: Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'expected_viewer_binding')),
  }
}

export function parseCreateChatPollInput(value: unknown): CreateChatPollInput | null {
  if (!isRecord(value) || !hasExactKeys(value, ['purpose', 'title', 'selection_mode', 'options', 'idempotency_key'])
    || !CHAT_POLL_PURPOSES.includes(value.purpose as ChatPollPurpose)
    || !CHAT_POLL_SELECTION_MODES.includes(value.selection_mode as ChatPollSelectionMode)
    || !isUuid(value.idempotency_key) || typeof value.title !== 'string' || !Array.isArray(value.options)) return null
  const title = value.title.trim()
  const options = value.options.map(option => typeof option === 'string' ? option.trim() : '')
  if (title.length < 2 || title.length > 100 || options.length < 2 || options.length > 8
    || options.some(option => option.length < 1 || option.length > 80)
    || new Set(options.map(option => option.toLocaleLowerCase('ko-KR'))).size !== options.length) return null
  return {
    purpose: value.purpose as ChatPollPurpose,
    title,
    selectionMode: value.selection_mode as ChatPollSelectionMode,
    options,
    idempotencyKey: value.idempotency_key,
  }
}

export function parseVoteChatPollInput(value: unknown, mode: ChatPollSelectionMode): { optionIds: string[] } | null {
  if (!isRecord(value) || !hasExactKeys(value, ['option_ids']) || !Array.isArray(value.option_ids)) return null
  const optionIds = [...new Set(value.option_ids)]
  if (optionIds.length < 1 || optionIds.length > 8 || optionIds.some(option => !isUuid(option))) return null
  if (mode === 'single' && optionIds.length !== 1) return null
  return { optionIds: optionIds as string[] }
}

export function parseVoteOptionIds(value: unknown): { optionIds: string[] } | null {
  if (!isRecord(value) || !hasExactKeys(value, ['option_ids']) || !Array.isArray(value.option_ids)) return null
  const optionIds = [...new Set(value.option_ids)]
  if (optionIds.length < 1 || optionIds.length > 8 || optionIds.some(option => !isUuid(option))) return null
  return { optionIds: optionIds as string[] }
}

export function parseExpectedRevision(value: unknown): number | null {
  return isRecord(value) && hasExactKeys(value, ['expected_revision']) && isInteger(value.expected_revision, 1)
    ? Number(value.expected_revision) : null
}

export function parseAgreementProposalInput(value: unknown): {
  selectedOptionId: string
  expectedRevision: number
  idempotencyKey: string
  summary: string
} | null {
  if (!isRecord(value) || !hasExactKeys(value, ['selected_option_id', 'expected_revision', 'idempotency_key', 'summary'])
    || !isUuid(value.selected_option_id) || !isUuid(value.idempotency_key)
    || !isInteger(value.expected_revision, 1) || typeof value.summary !== 'string') return null
  const summary = value.summary.trim()
  if (summary.length < 2 || summary.length > 160) return null
  return {
    selectedOptionId: value.selected_option_id,
    expectedRevision: Number(value.expected_revision),
    idempotencyKey: value.idempotency_key,
    summary,
  }
}

export function parseAgreementConfirmationInput(value: unknown): { expectedVersion: number } | null {
  if (!isRecord(value) || !hasExactKeys(value, ['expected_version']) || !isInteger(value.expected_version, 1)) return null
  return { expectedVersion: Number(value.expected_version) }
}

function parseOption(value: unknown): ChatPollOption | null {
  if (!isRecord(value) || !isUuid(value.id) || typeof value.label !== 'string'
    || !value.label.trim() || value.label.length > 80 || !isInteger(value.position)
    || !isInteger(value.vote_count) || typeof value.selected_by_me !== 'boolean') return null
  return {
    id: value.id, label: value.label, position: Number(value.position),
    voteCount: Number(value.vote_count), selectedByMe: value.selected_by_me,
  }
}

function parseAgreement(value: unknown): ChatPollAgreement | null {
  if (!isRecord(value) || !isUuid(value.id) || !isInteger(value.version, 1)
    || !['proposal', 'confirmed'].includes(String(value.status)) || !isUuid(value.selected_option_id)
    || typeof value.summary !== 'string' || !isInteger(value.confirmation_count)
    || !isInteger(value.required_count, 1) || Number(value.confirmation_count) > Number(value.required_count)
    || typeof value.confirmed_by_me !== 'boolean' || typeof value.membership_current !== 'boolean'
    || !isTimestamp(value.proposed_at) || !isNullableTimestamp(value.confirmed_at)) return null
  return {
    id: value.id, version: Number(value.version), status: value.status as ChatPollAgreementStatus,
    selectedOptionId: value.selected_option_id, summary: value.summary,
    confirmationCount: Number(value.confirmation_count), requiredCount: Number(value.required_count),
    confirmedByMe: value.confirmed_by_me, membershipCurrent: value.membership_current,
    proposedAt: value.proposed_at, confirmedAt: value.confirmed_at,
  }
}

function parsePoll(value: unknown): ChatPoll | null {
  if (!isRecord(value) || !isUuid(value.id) || !CHAT_POLL_PURPOSES.includes(value.purpose as ChatPollPurpose)
    || typeof value.title !== 'string' || !CHAT_POLL_SELECTION_MODES.includes(value.selection_mode as ChatPollSelectionMode)
    || !['open', 'closed', 'cancelled'].includes(String(value.status)) || !isInteger(value.revision, 1)
    || typeof value.creator_alias !== 'string' || typeof value.is_creator !== 'boolean'
    || !isTimestamp(value.created_at) || !isNullableTimestamp(value.closed_at) || !isInteger(value.ballot_count)
    || !Array.isArray(value.options) || value.options.length < 2 || value.options.length > 8) return null
  const options = value.options.map(parseOption)
  if (options.some(option => !option)) return null
  const typedOptions = options as ChatPollOption[]
  if (new Set(typedOptions.map(option => option.id)).size !== typedOptions.length
    || new Set(typedOptions.map(option => option.position)).size !== typedOptions.length) return null
  const agreement = value.agreement == null ? null : parseAgreement(value.agreement)
  if (value.agreement != null && !agreement) return null
  return {
    id: value.id, purpose: value.purpose as ChatPollPurpose, title: value.title,
    selectionMode: value.selection_mode as ChatPollSelectionMode, status: value.status as ChatPollStatus,
    revision: Number(value.revision), creatorAlias: value.creator_alias, isCreator: value.is_creator,
    createdAt: value.created_at, closedAt: value.closed_at,
    ballotCount: Number(value.ballot_count), options: typedOptions, agreement,
  }
}

export function parseChatPollBoard(value: unknown): ChatPollBoard | null {
  if (!isRecord(value) || !isUuid(value.room_id) || !Array.isArray(value.polls)) return null
  const polls = value.polls.map(parsePoll)
  if (polls.some(poll => !poll)) return null
  const typedPolls = polls as ChatPoll[]
  if (new Set(typedPolls.map(poll => poll.id)).size !== typedPolls.length) return null
  return { roomId: value.room_id, polls: typedPolls }
}

export function chatPollErrorMessage(code: string): string {
  if (/stale_(?:version|revision)/.test(code)) return '다른 멤버가 먼저 변경했어요. 투표를 새로고침하고 다시 진행해 주세요.'
  if (/tied/.test(code)) return '현재 결과가 동률이에요. 합의로 확정하지 않고 대화를 더 나눠 주세요.'
  if (/no_response/.test(code)) return '아직 투표 응답이 없어서 합의로 확인할 수 없어요.'
  if (/not_open/.test(code)) return '이미 마감되었거나 취소된 투표예요. 결과만 확인할 수 있어요.'
  if (/creator_required/.test(code)) return '이 작업은 투표를 만든 멤버만 할 수 있어요.'
  if (/winning_option_required/.test(code)) return '가장 많은 표를 받은 선택지를 골라 합의 제안으로 고정해 주세요.'
  if (/agreement_membership_changed/.test(code)) return '멤버 구성이 바뀌어 이 합의 버전을 확인할 수 없어요. 새 버전을 제안해 주세요.'
  if (/membership_changed/.test(code)) return '멤버 구성이 바뀌었어요. 투표를 새로고침하고 다시 진행해 주세요.'
  if (/rate_limited/.test(code)) return '투표를 너무 빠르게 만들고 있어요. 잠시 뒤 다시 시도해 주세요.'
  if (/forbidden|membership_required|blocked/.test(code)) return '현재 이 모임방의 투표를 볼 수 없어요. 방 목록에서 참여 상태를 확인해 주세요.'
  if (/Unauthorized|unauthenticated|not_authenticated/.test(code)) return '로그인한 뒤 모임방 투표를 확인해 주세요.'
  if (/invalid_/.test(code)) return '투표 내용을 다시 확인해 주세요.'
  return '투표 서버에 연결하지 못했어요. 작성 내용은 그대로 두었으니 다시 시도해 주세요.'
}

export function isChatPollId(value: unknown): value is string {
  return isUuid(value)
}
