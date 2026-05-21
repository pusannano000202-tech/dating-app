import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_my_matches')

  if (error) {
    return NextResponse.json({ error: 'list_failed' }, { status: 500 })
  }

  return NextResponse.json({ matches: data ?? [] })
}
