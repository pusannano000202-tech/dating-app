import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .rpc('admin_get_user_profile', { p_user_id: params.id })
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message || 'lookup_failed' }, { status: 400 })
  return NextResponse.json({ profile: data })
}
