import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .rpc('accept_friend_request', { p_request_id: params.id })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'accept_failed' }, { status: 400 })
  }

  return NextResponse.json({ result: data })
}
