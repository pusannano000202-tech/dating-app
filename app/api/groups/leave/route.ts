import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readJson(req)
  const groupId = typeof body.group_id === 'string' ? body.group_id : ''
  if (!groupId) {
    return NextResponse.json({ error: 'group_id_required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .rpc('leave_group', { p_group_id: groupId })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'leave_failed' }, { status: 400 })
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
