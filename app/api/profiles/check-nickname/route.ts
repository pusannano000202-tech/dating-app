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
  if (!currentUserId) {
    return NextResponse.json({
      available: true,
      duplicate_count: 0,
      mode: 'unauthenticated-preview',
    })
  }

  const { data, error } = await supabase
    .rpc('is_profile_display_name_available', { p_display_name: nickname })
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { available: false, error: 'nickname_lookup_unavailable' },
      { status: 501 },
    )
  }

  const available = Boolean(data)

  return NextResponse.json({
    available,
    duplicate_count: available ? 0 : 1,
  })
}
