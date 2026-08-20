import { NextRequest, NextResponse } from 'next/server'
import { signPrivateProfilePhotos } from '@/lib/profile/private-photo-signed-urls'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .rpc('admin_get_user_profile', { p_user_id: params.id })
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'lookup_failed' }, { status: 400 })

  const profile = data && typeof data === 'object' ? data as Record<string, unknown> : null
  if (!profile) return NextResponse.json({ profile: data })

  const profileUserId = profile.user_id
  if (typeof profileUserId !== 'string') {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 502 })
  }

  const signedPhotos = await signPrivateProfilePhotos([profileUserId], 3)
  if (!signedPhotos.ok) {
    return NextResponse.json({ error: 'photo_signing_failed' }, { status: 503 })
  }

  return NextResponse.json(
    {
      profile: {
        ...profile,
        photo_urls: signedPhotos.urlsByUser[profileUserId] ?? [],
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
