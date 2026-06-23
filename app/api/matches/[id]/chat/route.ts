import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase-server'

type RouteParams = { params: { id: string } }

function toStatus(errorMessage: string) {
  const message = (errorMessage || 'chat_error').toLowerCase()
  if (message.includes('access_denied') || message.includes('not approved') || message.includes('forbidden')) {
    return { status: 403, code: 'access_denied' as const }
  }
  if (message.includes('not_authenticated') || message.includes('unauthenticated')) {
    return { status: 401, code: 'not_authenticated' as const }
  }
  if (message.includes('invalid_message')) {
    return { status: 400, code: 'invalid_message' as const }
  }
  return { status: 400, code: message }
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_match_chat_messages', {
    p_match_id: params.id,
    p_limit: 80,
  })

  if (error) {
    const mapped = toStatus(error.message || '')
    return NextResponse.json({ error: mapped.code }, { status: mapped.status })
  }

  return NextResponse.json({
    messages: data ?? [],
    current_user_id: user.id,
  })
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const message = (body?.message ?? '').toString().trim()

    if (message.length === 0) {
      return NextResponse.json({ error: 'empty_message' }, { status: 400 })
  }

    const { data, error } = await supabase.rpc('send_match_chat_message', {
      p_match_id: params.id,
      p_message_text: message,
    })

    if (error) {
      const mapped = toStatus(error.message || '')
      return NextResponse.json({ error: mapped.code }, { status: mapped.status })
    }

    return NextResponse.json({
      current_user_id: user.id,
      message: data?.[0] ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
}
