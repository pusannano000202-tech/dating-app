import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseRequestClient } from '@/lib/supabase-request'

type RouteParams = { params: Promise<{ id: string }> }

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
  if (message.includes('chat_not_open')) {
    return { status: 409, code: 'chat_not_open' as const }
  }
  if (message.includes('chat_schedule_unavailable')) {
    return { status: 409, code: 'chat_schedule_unavailable' as const }
  }
  return { status: 400, code: 'chat_error' as const }
}

export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(req)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const windowResult = await loadChatWindow(supabase, params.id)
  if (!windowResult.ok) return windowResult.response

  const { data, error } = await supabase.rpc('get_safe_match_chat_messages', {
    p_match_id: params.id,
    p_limit: 80,
  })

  if (error) {
    const mapped = toStatus(error.message || '')
    return NextResponse.json({ error: mapped.code }, { status: mapped.status })
  }

  return NextResponse.json({
    messages: data ?? [],
    chat_window: windowResult.window,
  })
}

export async function POST(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(req)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const windowResult = await loadChatWindow(supabase, params.id)
  if (!windowResult.ok) return windowResult.response

  try {
    const body = await req.json()
    const message = (body?.message ?? '').toString().trim()

    if (message.length === 0) {
      return NextResponse.json({ error: 'empty_message' }, { status: 400 })
  }

    const { data, error } = await supabase.rpc('send_safe_match_chat_message', {
      p_match_id: params.id,
      p_message_text: message,
    })

    if (error) {
      const mapped = toStatus(error.message || '')
      return NextResponse.json({ error: mapped.code }, { status: mapped.status })
    }

    return NextResponse.json({
      message: data?.[0] ?? null,
      chat_window: windowResult.window,
    })
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
}

async function loadChatWindow(
  supabase: ReturnType<typeof createSupabaseRequestClient>,
  matchId: string,
): Promise<
  | { ok: true; window: { opens_at: string; scheduled_start: string; server_now: string; is_open: true } }
  | { ok: false; response: NextResponse }
> {
  const { data, error } = await supabase.rpc('get_my_match_chat_window', {
    p_match_id: matchId,
  })

  if (error) {
    const mapped = toStatus(error.message || '')
    return {
      ok: false,
      response: NextResponse.json({ error: mapped.code }, { status: mapped.status }),
    }
  }

  const window = parseChatWindow(data)
  if (!window) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'chat_window_invalid' }, { status: 500 }),
    }
  }
  if (!window.is_open) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'chat_not_open', opens_at: window.opens_at },
        { status: 409 },
      ),
    }
  }

  return { ok: true, window: { ...window, is_open: true } }
}

function parseChatWindow(value: unknown): {
  opens_at: string
  scheduled_start: string
  server_now: string
  is_open: boolean
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    typeof record.opens_at !== 'string'
    || typeof record.scheduled_start !== 'string'
    || typeof record.server_now !== 'string'
    || typeof record.is_open !== 'boolean'
    || Number.isNaN(Date.parse(record.opens_at))
    || Number.isNaN(Date.parse(record.scheduled_start))
    || Number.isNaN(Date.parse(record.server_now))
  ) return null

  return {
    opens_at: record.opens_at,
    scheduled_start: record.scheduled_start,
    server_now: record.server_now,
    is_open: record.is_open,
  }
}
