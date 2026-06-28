import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const score = typeof body.score === 'number' ? body.score : null
  if (score === null || score < 0 || score > 100) {
    return NextResponse.json({ error: 'invalid_score' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('admin_set_appearance_override', {
    p_user_id: params.id,
    p_score: score,
    p_reason: typeof body.reason === 'string' ? body.reason : null,
  })
  if (error) return NextResponse.json({ error: error.message || 'override_failed' }, { status: 400 })
  return NextResponse.json({ effective_score: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const { data, error } = await supabase.rpc('admin_clear_appearance_override', {
    p_user_id: params.id,
    p_reason: typeof body.reason === 'string' ? body.reason : null,
  })
  if (error) return NextResponse.json({ error: error.message || 'clear_failed' }, { status: 400 })
  return NextResponse.json({ effective_score: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}
