import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .rpc('cancel_friend_request', { p_request_id: params.id })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'cancel_failed' }, { status: 400 })
  }

  return NextResponse.json({ result: data })
}
