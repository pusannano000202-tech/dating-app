import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface CreateInviteBody {
  group_id?: unknown
  invited_user_id?: unknown
  invited_phone?: unknown
  kind?: unknown
}

export async function GET(req: NextRequest) {
  // RPC 는 SECURITY DEFINER 이고 pending + not expired 만 안전 필드를 반환하므로
  // 미로그인 사용자에게도 허용한다. 가입자/회원만의 미리보기로 막으면 초대 링크 UX 가 어색.
  const supabase = createSupabaseServerClient()

  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return jsonError('token_required', 400)
  }

  const { data, error } = await supabase
    .rpc('get_group_invite_by_token', { p_token: token })
    .maybeSingle()

  if (error) {
    return jsonError('invite_lookup_failed', 500)
  }

  if (!data) {
    return jsonError('invite_not_found', 404)
  }

  const { data: { user } } = await supabase.auth.getUser()

  return NextResponse.json({ invite: data, authenticated: Boolean(user) })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const user = await getUser(supabase)
  if (!user) {
    return jsonError('Unauthorized', 401)
  }

  const body = await readJson(req) as CreateInviteBody
  const groupId = typeof body.group_id === 'string' ? body.group_id : ''
  const invitedUserId = typeof body.invited_user_id === 'string' ? body.invited_user_id : null
  const invitedPhone = typeof body.invited_phone === 'string' && body.invited_phone.trim()
    ? body.invited_phone.trim()
    : null
  const isLinkInvite = body.kind === 'link'

  if (!groupId) {
    return jsonError('group_id_required', 400)
  }

  if (invitedPhone) {
    return jsonError('phone_invites_disabled', 400)
  }

  if (!isLinkInvite && !invitedUserId) {
    return jsonError('invite_target_required', 400)
  }

  if (invitedUserId === user.id) {
    return jsonError('cannot_invite_self', 400)
  }

  const inviteKind: 'user' | 'link' = isLinkInvite
    ? 'link'
    : 'user'

  const token = randomUUID().replace(/-/g, '')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('group_invites')
    .insert({
      group_id: groupId,
      invited_by_user_id: user.id,
      invited_user_id: invitedUserId,
      invited_phone: null,
      invite_kind: inviteKind,
      token,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id,group_id,invited_phone,invited_user_id,invite_kind,token,status,expires_at,created_at')
    .single()

  if (error || !data) {
    return jsonError('invite_create_failed', 500)
  }

  return NextResponse.json({ invite: data }, { status: 201 })
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
