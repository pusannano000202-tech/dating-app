import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type GroupStatus = 'forming' | 'ready' | 'in_pool' | 'matched' | 'completed' | 'disbanded'
type GroupRole = 'leader' | 'member'
type FriendGroupStatus = 'available' | 'invited' | 'in_group'

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
  role: GroupRole
  joined_at: string
  left_at: string | null
}

interface GroupInviteRecord {
  id: string
  group_id: string
  invited_phone: string | null
  invited_user_id: string | null
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

export async function GET() {
  const supabase = createSupabaseServerClient()
  const user = await getUser(supabase)
  if (!user) {
    return jsonError('Unauthorized', 401)
  }

  const state = await loadGroupState(supabase, user.id)
  return NextResponse.json(state)
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const user = await getUser(supabase)
  if (!user) {
    return jsonError('Unauthorized', 401)
  }

  const existing = await loadGroupState(supabase, user.id)
  if (existing.group && ['forming', 'ready', 'in_pool', 'matched'].includes(existing.group.status)) {
    return NextResponse.json(existing)
  }

  const body = await readJson(req)
  const size = body.size === 2 ? 2 : 3
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

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      leader_user_id: user.id,
      name,
      size,
      gender: profile.gender,
      status: 'forming',
    })
    .select('id,leader_user_id,name,size,gender,status,created_at,updated_at')
    .single()

  if (groupError || !group) {
    return jsonError('group_create_failed', 500)
  }

  const { error: memberError } = await supabase
    .from('group_members')
    .insert({
      group_id: group.id,
      user_id: user.id,
      role: 'leader',
    })

  if (memberError) {
    await supabase.from('groups').delete().eq('id', group.id)
    return jsonError('leader_membership_create_failed', 500)
  }

  const state = await loadGroupState(supabase, user.id)
  return NextResponse.json(state, { status: 201 })
}

async function loadGroupState(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string
) {
  const { data: membership } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle()

  const group = membership?.group_id
    ? await loadGroup(supabase, membership.group_id)
    : null

  const members = group ? await loadMembers(supabase, group.id) : []
  const invites = group ? await loadInvites(supabase, group.id) : []
  const friends = await loadFriends(supabase, userId, members, invites)

  return {
    group,
    members,
    invites,
    friends,
  }
}

async function loadGroup(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  groupId: string
): Promise<GroupRecord | null> {
  const { data } = await supabase
    .from('groups')
    .select('id,leader_user_id,name,size,gender,status,created_at,updated_at')
    .eq('id', groupId)
    .maybeSingle()

  return (data as GroupRecord | null) ?? null
}

async function loadMembers(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  groupId: string
): Promise<GroupMemberRecord[]> {
  const { data } = await supabase
    .from('group_members')
    .select('group_id,user_id,role,joined_at,left_at')
    .eq('group_id', groupId)
    .is('left_at', null)
    .order('joined_at')

  return (data ?? []) as GroupMemberRecord[]
}

async function loadInvites(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  groupId: string
): Promise<GroupInviteRecord[]> {
  const { data } = await supabase
    .from('group_invites')
    .select('id,group_id,invited_phone,invited_user_id,token,status,expires_at,created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  return (data ?? []) as GroupInviteRecord[]
}

async function loadFriends(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  members: GroupMemberRecord[],
  invites: GroupInviteRecord[]
): Promise<FriendSummary[]> {
  const { data } = await supabase
    .from('friendships')
    .select('user_id,friend_user_id,status')
    .eq('status', 'active')
    .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`)

  const memberIds = new Set(members.map((member) => member.user_id))
  const invitedIds = new Set(
    invites
      .filter((invite) => invite.status === 'pending' && invite.invited_user_id)
      .map((invite) => invite.invited_user_id as string)
  )

  return ((data ?? []) as Array<{ user_id: string; friend_user_id: string }>).map((row) => {
    const friendId = row.user_id === userId ? row.friend_user_id : row.user_id
    return {
      user_id: friendId,
      display_name: `친구 ${friendId.slice(0, 8)}`,
      phone: null,
      status: 'active',
      group_status: memberIds.has(friendId)
        ? 'in_group'
        : invitedIds.has(friendId)
          ? 'invited'
          : 'available',
    }
  })
}

async function getUser(supabase: ReturnType<typeof createSupabaseServerClient>) {
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
