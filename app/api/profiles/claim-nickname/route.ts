import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req)
  const nickname = typeof body.nickname === 'string'
    ? body.nickname.replace(/\s+/g, ' ').trim()
    : ''

  if (nickname.length < 2 || nickname.length > 20) {
    return NextResponse.json({ error: 'invalid_nickname' }, { status: 400 })
  }

  const { data, error } = await supabase
    .rpc('claim_profile_display_name', { p_display_name: nickname })
    .maybeSingle()

  if (error) {
    const message = error.message ?? ''
    const code = message.includes('nickname_taken')
      ? 'nickname_taken'
      : message.includes('invalid_nickname')
        ? 'invalid_nickname'
        : message.includes('not_authenticated')
          ? 'Unauthorized'
          : 'nickname_claim_failed'
    return NextResponse.json(
      { error: code },
      { status: code === 'nickname_taken' ? 409 : code === 'Unauthorized' ? 401 : 400 },
    )
  }

  return NextResponse.json({ nickname: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}
