import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_match_connections', { p_match_id: params.id })
  if (error) {
    return NextResponse.json({ error: error.message || 'lookup_failed' }, { status: 400 })
  }
  return NextResponse.json({ connections: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req)
  const targetUserId = typeof body.target_user_id === 'string' ? body.target_user_id : ''
  const action = body.action === 'cancel' ? 'cancel' : 'agree'

  if (!targetUserId) {
    return NextResponse.json({ error: 'target_user_id_required' }, { status: 400 })
  }

  const rpcName = action === 'cancel' ? 'cancel_connection' : 'agree_connection'
  const { data, error } = await supabase
    .rpc(rpcName, { p_match_id: params.id, p_target_user_id: targetUserId })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || `${action}_failed` }, { status: 400 })
  }

  return NextResponse.json({ result: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}
