import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { assertTrustedMutationOrigin, TrustedOriginError } from '@/lib/auth/trusted-origin'
import { meetupRpcErrorResponse } from '@/lib/meetups/http'
import { isSupabaseConfigured } from '@/lib/utils'

const headers = { 'Cache-Control': 'private, no-store' }

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
  try { assertTrustedMutationOrigin(request) }
  catch (error) { return NextResponse.json({ error: 'request_not_allowed' }, { status: error instanceof TrustedOriginError ? error.status : 403, headers }) }
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'community_schema_unavailable' }, { status: 503, headers })
  try { return await applyMembership(request, meetupId, rpcName) }
  catch { return NextResponse.json({ error: 'community_unavailable' }, { status: 503, headers }) }
}

async function applyMembership(request: NextRequest, meetupId: string, rpcName: 'join_activity_meetup' | 'leave_activity_meetup') {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError) return NextResponse.json({ error: 'community_unavailable' }, { status: 503, headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  if (!isUuid(meetupId)) return NextResponse.json({ error: 'invalid_meetup_id' }, { status: 400, headers })
  // The old immediate-join endpoint must not silently bypass the new application.
  // DB execute rights are revoked by the companion migration, separately applied.
  if (rpcName === 'join_activity_meetup') return NextResponse.json({ error: 'meetup_application_required' }, { status: 409, headers })

  const { data, error } = await supabase.rpc(rpcName, { p_meetup_id: meetupId })
  if (error) return meetupRpcErrorResponse(error)

  return NextResponse.json({ membership: data }, { headers })
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
