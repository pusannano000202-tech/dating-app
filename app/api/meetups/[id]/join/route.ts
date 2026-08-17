import { NextRequest, NextResponse } from 'next/server'

import { mapCommunityApiError } from '@/lib/community/api-errors'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, props: RouteContext) {
  const params = await props.params;
  return changeMembership(req, params.id, 'join_activity_meetup')
}

export async function DELETE(req: NextRequest, props: RouteContext) {
  const params = await props.params;
  return changeMembership(req, params.id, 'leave_activity_meetup')
}

async function changeMembership(
  request: NextRequest,
  meetupId: string,
  rpcName: 'join_activity_meetup' | 'leave_activity_meetup',
) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isUuid(meetupId)) return NextResponse.json({ error: 'invalid_meetup_id' }, { status: 400 })

  const { data, error } = await supabase.rpc(rpcName, { p_meetup_id: meetupId })
  if (error) {
    const mapped = mapCommunityApiError(error)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  return NextResponse.json({ membership: data })
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
