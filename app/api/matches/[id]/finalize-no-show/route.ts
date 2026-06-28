import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .rpc('finalize_no_show', { p_match_id: params.id })
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message || 'finalize_failed' }, { status: 400 })
  return NextResponse.json({ result: data })
}
