import { NextRequest, NextResponse } from 'next/server'
import {
  getMatchSetupStatus,
  type MatchSetupProfile,
  type MatchSetupStatus,
} from '@/lib/matching/match-setup-status'
import { normalizeGroupSize } from '@/lib/matching/group-size'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type GroupStatus = 'forming' | 'ready' | 'in_pool' | 'matched' | 'completed' | 'disbanded'
type GroupRole = 'leader' | 'member'
type FriendGroupStatus = 'available' | 'invited' | 'in_group'
type MatchPoolStatus = 'waiting' | 'rolled_over'
type GroupRpcOperation = 'create' | 'size'
type GroupRpcError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}
type GroupRpcErrorResponse = {
  error: string
  status: number
}

interface GroupRecord {
  id: string
  leader_user_id: string
  name: string | null
  size: number
  gender: 'male' | 'female'
  status: GroupStatus
  created_at: string
  updated_at: string
}

interface GroupMemberRecord {
  group_id: string
  user_id: string
  display_name: string | null
  gender: 'male' | 'female' | null
  role: GroupRole
  joined_at: string
  left_at: string | null
  match_setup_ready: boolean
  pre_match_card_ready: boolean
}

interface GroupInviteRecord {
  id: string
  group_id: string
  invited_phone: string | null
  invited_user_id: string | null
  invite_kind: 'user' | 'phone' | 'link'
  token: string
  status: string
  expires_at: string
  created_at: string
}

interface FriendSummary {
  user_id: string
  display_name: string
  phone: string | null
  status: 'active'
  group_status: FriendGroupStatus
}

interface ProfileMatchSetupSummary extends MatchSetupProfile {
  user_id: string
}

type GroupState = {
  group: GroupRecord | null
  match_pool_status: MatchPoolStatus | null
  members: GroupMemberRecord[]
  invites: GroupInviteRecord[]
  friends: FriendSummary[]
  current_user_match_setup: MatchSetupStatus
}

type GroupLoadResult = {
  error: 'group_state_read_failed'
} | {
  group: GroupRecord
}

type GroupMembersLoadResult = {
  error: 'group_state_read_failed'
} | {
  members: GroupMemberRecord[]
}

type MatchSetupLoadResult = {
  error: 'group_state_read_failed'
} | {
  status: MatchSetupStatus
}

type GroupInvitesLoadResult = {
  error: 'group_state_read_failed'
} | {
  invites: GroupInviteRecord[]
}

type FriendsLoadResult = {
  error: 'group_state_read_failed'
} | {
  friends: FriendSummary[]
}

type LoadGroupStateResult = {
  error: 'group_state_read_failed'
} | {
  result: GroupState
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const user = await getUser(supabase)
  if (!user) {
    return jsonError('Unauthorized', 401)
  }

  const state = await loadGroupState(supabase, user.id)
  if ('error' in state) {
    return jsonError(state.error, 500)
  }
  return NextResponse.json({ ...state.result, current_user_id: user.id })
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser(supabase)
  if (!user) {
    return jsonError('Unauthorized', 401)
  }

  const existingState = await loadGroupState(supabase, user.id)
  if ('error' in existingState) {
    return jsonError(existingState.error, 500)
  }
  const existing = existingState.result
  if (existing.group && ['forming', 'ready', 'in_pool', 'matched'].includes(existing.group.status)) {
    return NextResponse.json({ ...existing, current_user_id: user.id })
  }

  const body = await readJson(req)
  const size = normalizeGroupSize(body.size)
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('gender')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError) {
    return jsonError('profile_read_failed', 500)
  }

  if (!profile?.gender || !['male', 'female'].includes(profile.gender)) {
    return jsonError('profile_gender_required', 400)
  }

  const { error: rpcError } = await supabase.rpc('create_group_with_leader', {
    p_name: name,
    p_size: size,
  })

  if (rpcError) {
    const mappedError = mapGroupRpcError('create', rpcError)
    if (isCreateGroupConflict(rpcError)) {
      const concurrentState = await loadGroupState(supabase, user.id)
      if ('error' in concurrentState) {
        return jsonError(concurrentState.error, 500)
      }
      if (concurrentState.result.group) {
        return NextResponse.json({ ...concurrentState.result, current_user_id: user.id })
      }
      return jsonError('already_in_group', 409)
    }
    return jsonError(mappedError.error, mappedError.status)
  }

  const state = await loadGroupState(supabase, user.id)
  if ('error' in state) {
    return jsonError(state.error, 500)
  }
  return NextResponse.json({ ...state.result, current_user_id: user.id }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const user = await getUser(supabase)
  if (!user) {
    return jsonError('Unauthorized', 401)
  }

  const body = await readJson(req)
  const size = normalizeGroupSize(body.size)
  const stateLoad = await loadGroupState(supabase, user.id)
  if ('error' in stateLoad) {
    return jsonError(stateLoad.error, 500)
  }
  const state = stateLoad.result
  const group = state.group

  if (!group) {
    return jsonError('group_not_found', 404)
  }
  if (group.leader_user_id !== user.id) {
    return jsonError('not_group_leader', 403)
  }
  if (group.status !== 'forming') {
    return jsonError('group_locked', 409)
  }

  const activeMemberCount = state.members.length
  if (activeMemberCount > size) {
    return jsonError('group_size_smaller_than_members', 409)
  }

  const { error: rpcError } = await supabase.rpc('update_group_size', {
    p_group_id: group.id,
    p_size: size,
  })

  if (rpcError) {
    const mappedError = mapGroupRpcError('size', rpcError)
    return jsonError(mappedError.error, mappedError.status)
  }

  const nextState = await loadGroupState(supabase, user.id)
  if ('error' in nextState) {
    return jsonError(nextState.error, 500)
  }
  return NextResponse.json({ ...nextState.result, current_user_id: user.id })
}

async function loadGroupState(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
): Promise<LoadGroupStateResult> {
  const { data: membership, error: membershipError } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle()

  if (membershipError) {
    return { error: 'group_state_read_failed' }
  }

  if (!membership) {
    const currentUserSetup = await loadCurrentUserMatchSetup(supabase, userId)
    if ('error' in currentUserSetup) {
      return { error: currentUserSetup.error }
    }
    return {
      result: {
        group: null,
        match_pool_status: null,
        members: [],
        invites: [],
        friends: [],
        current_user_match_setup: currentUserSetup.status,
      },
    }
  }

  const groupState = await loadGroup(supabase, membership.group_id)
  if ('error' in groupState) {
    return { error: groupState.error }
  }

  const membersState = await loadMembers(supabase, groupState.group.id)
  if ('error' in membersState) {
    return { error: membersState.error }
  }
  const group = groupState.group
  const members = membersState.members
  const { data: matchPool, error: matchPoolError } = await supabase
    .from('match_pool')
    .select('status')
    .eq('group_id', group.id)
    .in('status', ['waiting', 'rolled_over'])
    .maybeSingle()

  if (matchPoolError) {
    return { error: 'group_state_read_failed' }
  }
  const match_pool_status =
    (matchPool as { status: MatchPoolStatus } | null)?.status ?? null

  const invitesState = await loadInvites(supabase, group.id)
  if ('error' in invitesState) {
    return { error: invitesState.error }
  }
  const friendsState = await loadFriends(supabase, members, invitesState.invites)
  if ('error' in friendsState) {
    return { error: friendsState.error }
  }
  const currentUserSetup = await loadCurrentUserMatchSetup(supabase, userId)
  if ('error' in currentUserSetup) {
    return { error: currentUserSetup.error }
  }

  return {
    result: {
      group,
      match_pool_status,
      members,
      invites: invitesState.invites,
      friends: friendsState.friends,
      current_user_match_setup: currentUserSetup.status,
    },
  }
}

async function loadGroup(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  groupId: string
): Promise<GroupLoadResult> {
  const { data, error } = await supabase
    .from('groups')
    .select('id,leader_user_id,name,size,gender,status,created_at,updated_at')
    .eq('id', groupId)
    .maybeSingle()

  if (error || !data) {
    return { error: 'group_state_read_failed' }
  }

  return { group: data as GroupRecord }
}

async function loadMembers(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  groupId: string
): Promise<GroupMembersLoadResult> {
  const { data, error } = await supabase.rpc('get_group_member_summaries', { p_group_id: groupId })

  if (error || !data || data.length === 0) {
    return { error: 'group_state_read_failed' }
  }

  type Row = {
    user_id: string
    display_name: string | null
    gender: 'male' | 'female' | null
    role: GroupRole
    joined_at: string
  }
  const members = (data as Row[]).map((row) => ({
    group_id: groupId,
    user_id: row.user_id,
    display_name: row.display_name,
    gender: row.gender,
    role: row.role,
    joined_at: row.joined_at,
    left_at: null,
    match_setup_ready: false,
    pre_match_card_ready: false,
  }))

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, personality_preference_completed_at, available_timeslots, preference_weights')
    .in('user_id', members.map((member) => member.user_id))

  if (profilesError || !profiles || profiles.length !== members.length) {
    return { error: 'group_state_read_failed' }
  }

  const readySet = new Set<string>(
    ((profiles ?? []) as ProfileMatchSetupSummary[])
      .filter((row) => getMatchSetupStatus(row).allDone)
      .map((row) => row.user_id)
  )

  const { data: cardReadiness, error: cardReadinessError } = await supabase
    .rpc('get_group_pre_match_card_readiness', { p_group_id: groupId })

  if (cardReadinessError) {
    return { error: 'group_state_read_failed' }
  }

  type CardReadinessRow = { user_id: string; has_pre_match_card: boolean }
  const cardReadySet = new Set<string>(
    ((cardReadiness ?? []) as CardReadinessRow[])
      .filter((row) => row.has_pre_match_card)
      .map((row) => row.user_id)
  )

  return {
    members: members.map((member) => ({
      ...member,
      pre_match_card_ready: cardReadySet.has(member.user_id),
      match_setup_ready: readySet.has(member.user_id) && cardReadySet.has(member.user_id),
    })),
  }
}

async function loadCurrentUserMatchSetup(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<MatchSetupLoadResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('personality_preference_completed_at, available_timeslots, preference_weights')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return { error: 'group_state_read_failed' }
  return { status: getMatchSetupStatus((data as MatchSetupProfile | null) ?? null) }
}

async function loadInvites(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  groupId: string
): Promise<GroupInvitesLoadResult> {
  const { data, error } = await supabase
    .from('group_invites')
    .select('id,group_id,invited_phone,invited_user_id,invite_kind,token,status,expires_at,created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (error) {
    return { error: 'group_state_read_failed' }
  }
  return { invites: (data ?? []) as GroupInviteRecord[] }
}

async function loadFriends(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  members: GroupMemberRecord[],
  invites: GroupInviteRecord[]
): Promise<FriendsLoadResult> {
  const { data, error } = await supabase.rpc('get_friend_summaries')
  if (error) {
    return { error: 'group_state_read_failed' }
  }

  const memberIds = new Set(members.map((member) => member.user_id))
  const invitedIds = new Set(
    invites
      .filter((invite) => invite.status === 'pending' && invite.invited_user_id)
      .map((invite) => invite.invited_user_id as string)
  )

  type Row = { user_id: string; display_name: string | null; status: string }
  return {
    friends: ((data ?? []) as Row[]).map((row) => ({
      user_id: row.user_id,
      display_name: row.display_name ?? `친구 ${row.user_id.slice(0, 8)}`,
      phone: null,
      status: 'active',
      group_status: memberIds.has(row.user_id)
        ? 'in_group'
        : invitedIds.has(row.user_id)
          ? 'invited'
          : 'available',
    })),
  }
}

async function getUser(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

const groupRpcErrorMap: Record<string, GroupRpcErrorResponse> = {
  not_authenticated: { error: 'not_authenticated', status: 401 },
  invalid_group_size: { error: 'invalid_group_size', status: 400 },
  profile_gender_required: { error: 'profile_gender_required', status: 400 },
  user_not_found: { error: 'user_not_found', status: 404 },
  already_in_group: { error: 'already_in_group', status: 409 },
  group_not_found: { error: 'group_not_found', status: 404 },
  not_group_leader: { error: 'not_group_leader', status: 403 },
  group_not_editable: { error: 'group_not_editable', status: 409 },
  group_size_below_member_count: { error: 'group_size_below_member_count', status: 409 },
}

function mapGroupRpcError(operation: GroupRpcOperation, error: GroupRpcError): GroupRpcErrorResponse {
  if (isRpcUnavailableError(error)) {
    return operation === 'create'
      ? { error: 'group_create_rpc_unavailable', status: 503 }
      : { error: 'group_size_rpc_unavailable', status: 503 }
  }

  for (const [token, mappedError] of Object.entries(groupRpcErrorMap)) {
    if (hasGroupRpcErrorToken(error, token)) {
      return mappedError
    }
  }

  return operation === 'create'
    ? { error: 'group_create_failed', status: 500 }
    : { error: 'group_size_update_failed', status: 500 }
}

function hasGroupRpcErrorToken(error: GroupRpcError, token: string) {
  const tokenPattern = new RegExp(`(^|[^a-z0-9_])${token}($|[^a-z0-9_])`, 'i')
  return [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => tokenPattern.test(value))
}

function isCreateGroupConflict(error: GroupRpcError) {
  return hasGroupRpcErrorToken(error, 'already_in_group') || (
    error.code === '23505' && hasGroupRpcErrorToken(error, 'idx_group_members_active_user_unique')
  )
}

function isRpcUnavailableError(error: GroupRpcError) {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return true
  }

  return [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => {
      const normalized = value.toLowerCase()
      return normalized.includes('could not find the function') || (
        normalized.includes('function') && normalized.includes('schema cache')
      )
    })
}
