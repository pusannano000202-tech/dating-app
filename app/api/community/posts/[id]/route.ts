import { NextRequest, NextResponse } from 'next/server'

import { mapCommunityApiError } from '@/lib/community/api-errors'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isUuid(params.id)) return NextResponse.json({ error: 'invalid_post_id' }, { status: 400 })

  const { data, error } = await supabase.rpc('get_community_post', { p_post_id: params.id })
  if (error) {
    const mapped = mapCommunityApiError(error)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const post = Array.isArray(data) ? data[0] : data
  if (!post) return NextResponse.json({ error: 'post_not_found' }, { status: 404 })
  return NextResponse.json(
    { post },
    { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } },
  )
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isUuid(params.id)) return NextResponse.json({ error: 'invalid_post_id' }, { status: 400 })

  const { data, error } = await supabase.rpc('delete_community_post', { p_post_id: params.id })
  if (error) {
    const mapped = mapCommunityApiError(error)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }
  if (!data) return NextResponse.json({ error: 'post_not_found' }, { status: 404 })

  return new NextResponse(null, { status: 204 })
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
