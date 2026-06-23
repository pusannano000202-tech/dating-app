import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req)
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) {
    return NextResponse.json({ error: 'token_required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .rpc('accept_group_invite_by_token', { p_token: token })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'invite_accept_failed' }, { status: 400 })
  }

  return NextResponse.json({ invite: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}
