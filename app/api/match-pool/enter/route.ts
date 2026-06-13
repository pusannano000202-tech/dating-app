import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface MatchSetupProfileRow {
  user_id: string
  personality_preference_completed_at: string | null
  available_timeslots: { slots?: unknown[] } | null
  preference_weights: Record<string, unknown> | null
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req)
  const groupId = typeof body.group_id === 'string' ? body.group_id : ''
  if (!groupId) {
    return NextResponse.json({ error: 'group_id_required' }, { status: 400 })
  }

  const { data: memberRows, error: memberError } = await supabase
    .from('group_members')
    .select('user_id, role')
    .eq('group_id', groupId)
    .is('left_at', null)

  if (memberError) {
    return NextResponse.json({ error: 'member_lookup_failed' }, { status: 400 })
  }

  const activeMembers = memberRows ?? []
  const isLeader = activeMembers.some((row: { user_id: string; role: string }) => row.user_id === user.id && row.role === 'leader')
  if (!activeMembers.some((row: { user_id: string }) => row.user_id === user.id)) {
    return NextResponse.json({ error: 'not_group_member' }, { status: 400 })
  }
  if (!isLeader) {
    return NextResponse.json({ error: 'not_group_leader' }, { status: 400 })
  }
  if (activeMembers.length < 2) {
    return NextResponse.json({ error: 'not_enough_members' }, { status: 400 })
  }

  const userIds = activeMembers.map((row: { user_id: string }) => row.user_id)
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, personality_preference_completed_at, available_timeslots, preference_weights')
    .in('user_id', userIds)

  if (profileError || (profiles?.length ?? 0) !== activeMembers.length) {
    return NextResponse.json({ error: 'member_profile_lookup_failed' }, { status: 400 })
  }

  const allReady = (profiles as MatchSetupProfileRow[]).every(isMatchSetupComplete)
  if (!allReady) {
    return NextResponse.json({ error: 'member_match_setup_incomplete' }, { status: 409 })
  }

  const { data, error } = await supabase
    .rpc('enter_match_pool', { p_group_id: groupId })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'enter_failed' }, { status: 400 })
  }

  return NextResponse.json({ entry: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function hasSlots(payload: { slots?: unknown[] } | null): boolean {
  return Boolean(payload && Array.isArray(payload.slots) && payload.slots.length > 0)
}

function isMatchSetupComplete(profile: MatchSetupProfileRow): boolean {
  return Boolean(
    profile.personality_preference_completed_at &&
      hasSlots(profile.available_timeslots) &&
      profile.preference_weights != null
  )
}
