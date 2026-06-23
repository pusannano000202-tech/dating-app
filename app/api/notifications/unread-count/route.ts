import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ count: 0 })
  }

  const { data, error } = await supabase.rpc('count_unread_notifications').maybeSingle()
  if (error) {
    return NextResponse.json({ count: 0 })
  }
  return NextResponse.json({ count: typeof data === 'number' ? data : 0 })
}
