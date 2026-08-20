import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseRequestClient } from '@/lib/supabase-request'

const ALLOWED_KINDS = new Set(['meal', 'cafe', 'walk', 'custom'])

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('Unauthorized', 401)

  const url = new URL(request.url)
  const otherUserId = cleanUuid(url.searchParams.get('friend_user_id'))
  if (!otherUserId) return jsonError('invalid_friend_user_id', 400)
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 50))

  const { data, error } = await supabase.rpc('get_friend_date_proposals', {
    p_other_user_id: otherUserId,
    p_limit: limit,
  })
  if (error) return jsonError(translateProposalError(error.message), 400)

  return NextResponse.json({ proposals: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('Unauthorized', 401)

  const body = await readJson(request)
  if (!isRecord(body)) return jsonError('invalid_request', 400)

  const recipientUserId = cleanUuid(body.recipient_user_id)
  const kind = typeof body.kind === 'string' ? body.kind.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!recipientUserId || !ALLOWED_KINDS.has(kind)) return jsonError('invalid_request', 400)
  if (message.length > 300) return jsonError('proposal_message_too_long', 400)

  const { data, error } = await supabase.rpc('create_friend_date_proposal', {
    p_recipient_user_id: recipientUserId,
    p_kind: kind,
    p_message: message || null,
  })
  if (error) {
    const code = translateProposalError(error.message)
    return jsonError(code, proposalStatus(code))
  }

  return NextResponse.json({ proposal_id: data }, { status: 201 })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function cleanUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null
}

function translateProposalError(message = ''): string {
  const known = [
    'not_authenticated',
    'invalid_recipient',
    'invalid_proposal_kind',
    'proposal_message_too_long',
    'active_friendship_required',
    'proposal_already_pending',
  ]
  return known.find((code) => message.includes(code)) ?? 'friend_date_proposal_failed'
}

function proposalStatus(code: string): number {
  if (code === 'not_authenticated') return 401
  if (code === 'active_friendship_required') return 403
  if (code === 'proposal_already_pending') return 409
  return 400
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
