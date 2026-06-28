import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('admin_list_pending_matches')
  if (error) return NextResponse.json({ error: error.message || 'lookup_failed' }, { status: 400 })
  return NextResponse.json({ matches: data ?? [] })
}
