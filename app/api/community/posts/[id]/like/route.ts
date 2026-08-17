import { NextRequest, NextResponse } from 'next/server'

import { mapCommunityApiError } from '@/lib/community/api-errors'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_PATTERN.test(params.id)) return NextResponse.json({ error: 'invalid_post' }, { status: 400 })

  const { data, error } = await supabase.rpc('toggle_community_post_like', { p_post_id: params.id })
  if (error) {
    const mapped = mapCommunityApiError(error)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }
  return NextResponse.json(data)
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
