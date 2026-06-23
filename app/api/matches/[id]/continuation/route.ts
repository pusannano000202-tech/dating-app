import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('get_match_continuation_state', { p_match_id: params.id }).maybeSingle()
  if (error) return NextResponse.json({ error: error.message || 'lookup_failed' }, { status: 400 })
  return NextResponse.json({ state: data })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const choice = body.choice === 'end' ? 'end' : body.choice === 'continue' ? 'continue' : null
  if (!choice) return NextResponse.json({ error: 'invalid_choice' }, { status: 400 })

  const { data, error } = await supabase
    .rpc('submit_continuation_choice', { p_match_id: params.id, p_choice: choice })
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message || 'submit_failed' }, { status: 400 })
  return NextResponse.json({ result: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}
