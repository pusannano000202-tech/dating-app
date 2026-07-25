import { NextRequest, NextResponse } from 'next/server'
import { getMatchSetupStatus, type MatchSetupProfile } from '@/lib/matching/match-setup-status'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface MatchSetupProfileRow extends MatchSetupProfile {
  user_id: string
}

type PreMatchCardReadinessRow = {
  user_id: string
  has_pre_match_card: boolean
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
    .select('user_id')
    .eq('group_id', groupId)
    .is('left_at', null)

  if (memberError) {
    return NextResponse.json({ error: 'member_lookup_failed' }, { status: 500 })
  }

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, size, status, leader_user_id')
    .eq('id', groupId)
    .maybeSingle()

  if (groupError) {
    return NextResponse.json({ error: 'group_lookup_failed' }, { status: 500 })
  }
  if (!group) {
    return NextResponse.json({ error: 'group_not_found' }, { status: 404 })
  }
  if (group.status !== 'forming') {
    return NextResponse.json({ error: 'group_not_open' }, { status: 409 })
  }

  const activeMembers = memberRows ?? []
  const isLeader = group.leader_user_id === user.id
  if (!activeMembers.some((row: { user_id: string }) => row.user_id === user.id)) {
    return NextResponse.json({ error: 'not_group_member' }, { status: 404 })
  }
  if (!isLeader) {
    return NextResponse.json({ error: 'not_group_leader' }, { status: 409 })
  }
  if (activeMembers.length < 2) {
    return NextResponse.json({ error: 'not_enough_members' }, { status: 409 })
  }
  if (activeMembers.length !== group.size) {
    return NextResponse.json({ error: 'group_not_full' }, { status: 409 })
  }

  const userIds = activeMembers.map((row: { user_id: string }) => row.user_id)
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, personality_preference_completed_at, available_timeslots, preference_weights')
    .in('user_id', userIds)

  if (profileError) {
    return NextResponse.json({ error: 'member_profile_lookup_failed' }, { status: 500 })
  }
  if ((profiles?.length ?? 0) !== activeMembers.length) {
    return NextResponse.json({ error: 'member_profile_not_found' }, { status: 404 })
  }

  const allReady = (profiles as MatchSetupProfileRow[]).every((profile) => getMatchSetupStatus(profile).allDone)
  if (!allReady) {
    return NextResponse.json({ error: 'member_match_setup_incomplete' }, { status: 409 })
  }

  const { data: cardReadiness, error: cardReadinessError } = await supabase
    .rpc('get_group_pre_match_card_readiness', { p_group_id: groupId })

  if (cardReadinessError) {
    return NextResponse.json({ error: 'member_card_lookup_failed' }, { status: 500 })
  }

  const cardReadySet = new Set(
    ((cardReadiness ?? []) as PreMatchCardReadinessRow[])
      .filter((row) => row.has_pre_match_card)
      .map((row) => row.user_id)
  )
  const allCardsReady = userIds.every((id) => cardReadySet.has(id))
  if (!allCardsReady) {
    const currentUserCardReady = cardReadySet.has(user.id)
    return NextResponse.json(
      { error: currentUserCardReady ? 'member_pre_match_card_incomplete' : 'pre_match_card_required' },
      { status: 409 },
    )
  }

  const { data, error } = await supabase
    .rpc('enter_match_pool', { p_group_id: groupId })
    .maybeSingle()

  if (error) {
    const failure = getEnterMatchPoolRpcFailure(error.message)
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }

  return NextResponse.json({ entry: data })
}

function getEnterMatchPoolRpcFailure(message: string | undefined): { error: string; status: 404 | 409 | 500 } {
  if (message === 'group_not_found') {
    return { error: 'group_not_found', status: 404 }
  }

  if (
    message === 'not_group_leader' ||
    message === 'group_membership_invalid' ||
    message === 'already_in_queue' ||
    message === 'group_not_open' ||
    message === 'not_enough_members' ||
    message === 'group_not_full' ||
    message === 'member_match_setup_incomplete' ||
    message === 'member_pre_match_card_incomplete'
  ) {
    return { error: message, status: 409 }
  }

  return { error: 'enter_match_pool_failed', status: 500 }
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}
