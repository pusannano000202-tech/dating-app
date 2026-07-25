import type { MatchSetupStatus } from './match-setup-status'

export type MatchingFrontendLoadFailure =
  | 'unauthorized'
  | 'group_state_unavailable'
  | 'match_state_unavailable'
  | 'network_unavailable'

type ResponseSnapshot = {
  ok: boolean
  status: number
}

export type MatchingGroupsPayload = {
  group: {
    id: string
    leader_user_id: string
    name: string | null
    size: number
    gender: 'male' | 'female'
    status: string
  } | null
  match_pool_status: 'waiting' | 'rolled_over' | null
  members: Array<{
    group_id: string
    user_id: string
    display_name: string | null
    gender: 'male' | 'female' | null
    role: 'leader' | 'member'
    joined_at: string
    left_at: string | null
    match_setup_ready: boolean
    pre_match_card_ready: boolean
  }>
  invites: Array<{
    id: string
    group_id: string
    invited_phone: string | null
    invited_user_id: string | null
    invite_kind: 'user' | 'phone' | 'link'
    token: string
    status: string
    expires_at: string
    created_at: string
  }>
  friends: Array<{
    user_id: string
    display_name: string
    phone: string | null
    status: 'active'
    group_status: 'available' | 'invited' | 'in_group'
    match_setup_ready?: boolean
  }>
  current_user_id?: string
  current_user_match_setup: MatchSetupStatus
}

export type MatchingMatchesPayload = {
  matches: Array<{
    match_id: string
    match_mode?: 'group' | 'solo'
    my_group_id: string
    opp_group_id: string
    opp_group_size: number
    opp_group_gender: 'male' | 'female' | 'mixed'
    match_status: string
    matched_at: string
    confirmed_at: string | null
    scheduled_start: string | null
    venue_name: string | null
  }>
}

export function getMatchingFrontendLoadFailure({
  groups,
  matches,
}: {
  groups: ResponseSnapshot
  matches: ResponseSnapshot
}): MatchingFrontendLoadFailure | null {
  if ((!groups.ok && groups.status === 401) || (!matches.ok && matches.status === 401)) {
    return 'unauthorized'
  }
  if (!groups.ok) return 'group_state_unavailable'
  if (!matches.ok) return 'match_state_unavailable'
  return null
}

export function getMatchingFrontendPayloadFailure({
  groups,
  matches,
}: {
  groups: unknown
  matches: unknown
}): MatchingFrontendLoadFailure | null {
  if (!isMatchingGroupsPayload(groups)) return 'group_state_unavailable'
  if (!isMatchingMatchesPayload(matches)) return 'match_state_unavailable'
  return null
}

export function getMatchingFrontendLoadMessage(failure: MatchingFrontendLoadFailure): string {
  switch (failure) {
    case 'unauthorized':
      return '로그인이 만료됐어요. 다시 로그인한 뒤 현재 상태를 확인해주세요.'
    case 'group_state_unavailable':
      return '그룹 상태를 확인하지 못했어요. 잘못된 매칭을 시작하지 않도록 잠시 멈췄어요.'
    case 'match_state_unavailable':
      return '진행 중인 매칭을 확인하지 못했어요. 중복 시작을 막기 위해 잠시 멈췄어요.'
    case 'network_unavailable':
      return '서버와 연결되지 않았어요. 연결을 확인한 뒤 다시 시도해주세요.'
  }
}

export function isMatchingGroupsPayload(value: unknown): value is MatchingGroupsPayload {
  if (!isRecord(value)) return false
  if (!Object.prototype.hasOwnProperty.call(value, 'group')) return false
  if (!Object.prototype.hasOwnProperty.call(value, 'match_pool_status')) return false
  if (!Object.prototype.hasOwnProperty.call(value, 'current_user_match_setup')) return false
  if (!Array.isArray(value.members) || !Array.isArray(value.invites) || !Array.isArray(value.friends)) {
    return false
  }
  if (!value.members.every(isGroupMember)) return false
  if (!value.invites.every(isGroupInvite)) return false
  if (!value.friends.every(isFriendSummary)) return false
  if (!isMatchSetupStatus(value.current_user_match_setup)) return false
  if (
    Object.prototype.hasOwnProperty.call(value, 'current_user_id')
    && typeof value.current_user_id !== 'string'
  ) {
    return false
  }

  const poolStatus = value.match_pool_status
  if (poolStatus !== null && poolStatus !== 'waiting' && poolStatus !== 'rolled_over') {
    return false
  }

  if (value.group === null) return true
  return isRecord(value.group)
    && typeof value.group.id === 'string'
    && typeof value.group.leader_user_id === 'string'
    && isNullableString(value.group.name)
    && (value.group.size === 2 || value.group.size === 3)
    && (value.group.gender === 'male' || value.group.gender === 'female')
    && (
      value.group.status === 'forming'
      || value.group.status === 'ready'
      || value.group.status === 'in_pool'
      || value.group.status === 'matched'
      || value.group.status === 'completed'
      || value.group.status === 'disbanded'
    )
}

function isMatchingMatchesPayload(value: unknown): value is MatchingMatchesPayload {
  if (!isRecord(value) || !Array.isArray(value.matches)) return false
  return value.matches.every((match) => (
    isRecord(match)
    && typeof match.match_id === 'string'
    && (
      match.match_mode === undefined
      || match.match_mode === 'group'
      || match.match_mode === 'solo'
    )
    && typeof match.my_group_id === 'string'
    && typeof match.opp_group_id === 'string'
    && (
      match.opp_group_size === 1
      || match.opp_group_size === 2
      || match.opp_group_size === 3
    )
    && (
      match.opp_group_gender === 'male'
      || match.opp_group_gender === 'female'
      || match.opp_group_gender === 'mixed'
    )
    && typeof match.match_status === 'string'
    && typeof match.matched_at === 'string'
    && isNullableString(match.confirmed_at)
    && isNullableString(match.scheduled_start)
    && isNullableString(match.venue_name)
  ))
}

function isGroupMember(value: unknown): boolean {
  return isRecord(value)
    && typeof value.group_id === 'string'
    && typeof value.user_id === 'string'
    && isNullableString(value.display_name)
    && (value.gender === null || value.gender === 'male' || value.gender === 'female')
    && (value.role === 'leader' || value.role === 'member')
    && typeof value.joined_at === 'string'
    && isNullableString(value.left_at)
    && typeof value.match_setup_ready === 'boolean'
    && typeof value.pre_match_card_ready === 'boolean'
}

function isGroupInvite(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.group_id === 'string'
    && isNullableString(value.invited_phone)
    && isNullableString(value.invited_user_id)
    && (value.invite_kind === 'user' || value.invite_kind === 'phone' || value.invite_kind === 'link')
    && typeof value.token === 'string'
    && typeof value.status === 'string'
    && typeof value.expires_at === 'string'
    && typeof value.created_at === 'string'
}

function isFriendSummary(value: unknown): boolean {
  return isRecord(value)
    && typeof value.user_id === 'string'
    && typeof value.display_name === 'string'
    && isNullableString(value.phone)
    && value.status === 'active'
    && (
      value.group_status === 'available'
      || value.group_status === 'invited'
      || value.group_status === 'in_group'
    )
    && (
      value.match_setup_ready === undefined
      || typeof value.match_setup_ready === 'boolean'
    )
}

function isMatchSetupStatus(value: unknown): value is MatchSetupStatus {
  return isRecord(value)
    && typeof value.personality === 'boolean'
    && typeof value.schedule === 'boolean'
    && typeof value.preferences === 'boolean'
    && typeof value.allDone === 'boolean'
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
