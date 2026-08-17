import { NextRequest, NextResponse } from 'next/server'

import { mapCommunityApiError } from '@/lib/community/api-errors'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseRequestClient(req)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ meetups: [], availability: 'auth_required' })
  }

  const { data, error } = await supabase.rpc('list_reviewable_meetups', { p_limit: 30 })
  if (error) {
    const mapped = mapCommunityApiError(error)
    if (mapped.error === 'community_schema_unavailable') {
      return NextResponse.json({ meetups: [], availability: 'schema_unavailable' })
    }
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  return NextResponse.json({ meetups: data ?? [], availability: 'ready' })
}
