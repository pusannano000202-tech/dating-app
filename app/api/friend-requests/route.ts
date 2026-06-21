import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface FriendRequestRow {
  id: string
  sender_user_id: string
  receiver_user_id: string | null
  receiver_phone: string | null
  token: string
  status: string
  message: string | null
  expires_at: string
  responded_at: string | null
  created_at: string
}

interface CreateBody {
  receiver_user_id?: unknown
  receiver_nickname?: unknown
  message?: unknown
}

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_friend_request_summaries')

  if (error) {
    return NextResponse.json({ error: 'list_failed' }, { status: 500 })
  }

  type Row = {
    request_id: string
    sender_user_id: string
    receiver_user_id: string | null
    receiver_phone: string | null
    sender_display_name: string | null
    receiver_display_name: string | null
    status: string
    message: string | null
    expires_at: string
    responded_at: string | null
    created_at: string
    is_sender: boolean
    is_receiver: boolean
  }

  const rows = (data ?? []) as Row[]
  const toClientRow = (r: Row): FriendRequestRow & { sender_display_name: string | null; receiver_display_name: string | null } => ({
    id: r.request_id,
    sender_user_id: r.sender_user_id,
    receiver_user_id: r.receiver_user_id,
    receiver_phone: r.receiver_phone,
    token: '',
    status: r.status,
    message: r.message,
    expires_at: r.expires_at,
    responded_at: r.responded_at,
    created_at: r.created_at,
    sender_display_name: r.sender_display_name,
    receiver_display_name: r.receiver_display_name,
  })
  const sent = rows.filter((r) => r.is_sender).map(toClientRow)
  const received = rows.filter((r) => r.is_receiver && !r.is_sender).map(toClientRow)

  const { data: friendData } = await supabase.rpc('get_friend_summaries')

  return NextResponse.json({
    sent,
    received,
    friends: friendData ?? [],
    current_user_id: user.id,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req) as CreateBody
  const receiverNickname = typeof body.receiver_nickname === 'string' && body.receiver_nickname.trim()
    ? normalizeNickname(body.receiver_nickname)
    : null
  let receiverUserId = typeof body.receiver_user_id === 'string' ? body.receiver_user_id : null
  const message = typeof body.message === 'string' && body.message.trim()
    ? body.message.trim().slice(0, 200)
    : null

  if (!receiverUserId && receiverNickname) {
    const { data: match, error: lookupError } = await supabase
      .rpc('resolve_profile_display_name', { p_display_name: receiverNickname })
      .maybeSingle()

    if (lookupError) {
      return NextResponse.json({ error: 'nickname_lookup_unavailable' }, { status: 501 })
    }

    if (!match) {
      return NextResponse.json({ error: 'nickname_not_found' }, { status: 404 })
    }
    receiverUserId = (match as { user_id: string }).user_id
  }

  if (!receiverUserId) {
    return NextResponse.json({ error: 'receiver_required' }, { status: 400 })
  }

  if (receiverUserId === user.id) {
    return NextResponse.json({ error: 'cannot_send_to_self' }, { status: 400 })
  }

  // duplicate pending request 검사 (이미 존재하면 그 토큰 반환)
  const { data: existing } = await supabase
    .from('friend_requests')
    .select('id,token,status')
    .eq('sender_user_id', user.id)
    .eq('receiver_user_id', receiverUserId)
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ request: existing, duplicate: true })
  }

  const token = randomUUID().replace(/-/g, '')
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('friend_requests')
    .insert({
      sender_user_id: user.id,
      receiver_user_id: receiverUserId,
      receiver_phone: null,
      token,
      status: 'pending',
      message,
      expires_at: expiresAt,
    })
    .select('id,sender_user_id,receiver_user_id,receiver_phone,token,status,message,expires_at,responded_at,created_at')
    .single()

  if (error || !data) {
    const code = error?.message?.includes('cannot_send_to_self')
      ? 'cannot_send_to_self'
      : 'create_failed'
    return NextResponse.json({ error: code }, { status: 400 })
  }

  return NextResponse.json({ request: data }, { status: 201 })
}

function normalizeNickname(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}
