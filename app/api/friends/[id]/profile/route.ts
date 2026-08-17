import { NextRequest, NextResponse } from 'next/server'

import { signPrivateProfilePhotos } from '@/lib/profile/private-photo-signed-urls'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const friendUserId = cleanUuid(params.id)
  if (!friendUserId) return NextResponse.json({ error: 'invalid_friend' }, { status: 400 })

  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .rpc('get_friend_profile_summary', { p_friend_user_id: friendUserId })
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'friend_profile_lookup_failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'active_friendship_required' }, { status: 403 })

  const signed = await signPrivateProfilePhotos([friendUserId], 3)
  return NextResponse.json({
    profile: {
      ...data,
      photo_urls: signed.ok ? signed.urlsByUser[friendUserId] ?? [] : [],
    },
  })
}

function cleanUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}
