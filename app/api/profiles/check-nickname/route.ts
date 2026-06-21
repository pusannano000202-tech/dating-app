import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isSupabaseConfigured } from '@/lib/utils'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const nickname = searchParams.get('nickname')?.replace(/\s+/g, ' ').trim() ?? ''

  if (nickname.length < 2 || nickname.length > 20) {
    return NextResponse.json(
      { available: false, error: 'invalid_nickname' },
      { status: 400 },
    )
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      available: true,
      duplicate_count: 0,
      mode: 'local-preview',
    })
  }

  const supabase = createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const currentUserId = authData.user?.id ?? null

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('display_name', nickname)
    .limit(3)

  if (error) {
    return NextResponse.json(
      { available: false, error: 'nickname_lookup_unavailable' },
      { status: 501 },
    )
  }

  const duplicateCount = (data ?? []).filter((row) => row.user_id !== currentUserId).length

  return NextResponse.json({
    available: duplicateCount === 0,
    duplicate_count: duplicateCount,
  })
}
