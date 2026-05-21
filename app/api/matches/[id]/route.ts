import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .rpc('get_match_detail', { p_match_id: params.id })
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'detail_failed' }, { status: 400 })
  }
  if (!data) {
    return NextResponse.json({ error: 'match_not_found' }, { status: 404 })
  }

  return NextResponse.json({ match: data })
}
