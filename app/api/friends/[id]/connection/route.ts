import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseRequestClient } from '@/lib/supabase-request'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(request: NextRequest, props: RouteContext) {
  const params = await props.params;
  return updateConnection(request, params.id, 'remove_friend_and_exclude')
}

export async function POST(request: NextRequest, props: RouteContext) {
  const params = await props.params;
  const body = await readJson(request)
  if (body.action !== 'restore') return jsonError('invalid_action', 400)
  return updateConnection(request, params.id, 'restore_friend_visibility')
}

async function updateConnection(
  request: NextRequest,
  friendUserId: string,
  rpcName: 'remove_friend_and_exclude' | 'restore_friend_visibility',
) {
  const cleanFriendUserId = cleanUuid(friendUserId)
  if (!cleanFriendUserId) return jsonError('invalid_friend', 400)

  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('Unauthorized', 401)

  const { data, error } = await supabase.rpc(rpcName, {
    p_friend_user_id: cleanFriendUserId,
  })
  if (error || data !== true) {
    const code = translateConnectionError(error?.message)
    return jsonError(code, code === 'friend_restore_not_allowed' ? 403 : 409)
  }

  return NextResponse.json({ ok: true })
}

async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return isRecord(body) ? body : {}
  } catch {
    return {}
  }
}

function cleanUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function translateConnectionError(message = '') {
  const known = ['active_friendship_required', 'friend_restore_not_allowed', 'invalid_friend']
  return known.find((code) => message.includes(code)) ?? 'friend_connection_update_failed'
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
