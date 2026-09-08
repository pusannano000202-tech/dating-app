import { NextRequest, NextResponse } from 'next/server'
import { signPrivateProfilePhotos } from '@/lib/profile/private-photo-signed-urls'
import { RequestGuardError, requestGuardErrorResponse, requireRequestAccess } from '@/lib/auth/server-guards'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    await requireRequestAccess(request, {
      allowedRoles: ['super_admin'],
      requireRecentAuth: true,
    })
  } catch (error) {
    if (error instanceof RequestGuardError) return requestGuardErrorResponse(error)
    return requestGuardErrorResponse(error)
  }

  const params = await props.params
  const supabase = await createSupabaseServerClient()
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
