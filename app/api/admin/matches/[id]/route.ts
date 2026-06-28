import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>
type AdminReviewRow = Record<string, unknown>

interface MeetingEvidenceRow {
  id: string
  venue_id: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  status: string | null
  checkin_radius_m: number | null
}

interface VenueEvidenceRow {
  name: string | null
  address: string | null
  map_url: string | null
  latitude: number | null
  longitude: number | null
  checkin_radius_m: number | null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .rpc('admin_get_match_review', { p_match_id: params.id })
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message || 'lookup_failed' }, { status: 400 })

  const review = data && typeof data === 'object' ? data as AdminReviewRow : null
  const evidence = await loadAdminMatchEvidence(supabase, params.id, review)
  return NextResponse.json({ review: review ? { ...review, evidence } : data })
}

async function loadAdminMatchEvidence(
  supabase: SupabaseServerClient,
  matchId: string,
  review: AdminReviewRow | null,
) {
  const groupIds = [review?.group_a_id, review?.group_b_id].filter((id): id is string => typeof id === 'string')
  const [meeting, attendances, deposits, refunds] = await Promise.all([
    loadMeetingEvidence(supabase, matchId),
    safeSelect(() => supabase
      .from('attendances')
      .select('user_id,gps_lat,gps_lng,within_radius,checked_at,peer_confirmed')
      .eq('match_id', matchId)),
    groupIds.length > 0
      ? safeSelect(() => supabase
        .from('deposits')
        .select('user_id,group_id,amount,status,paid_at,refunded_at,notes')
        .in('group_id', groupIds))
      : Promise.resolve([]),
    safeSelect(() => supabase
      .from('deposit_refund_requests')
      .select('user_id,deposit_id,requested_refund_amount,status,processed_at,zero_refund_reasons,zero_refund_comment')
      .eq('match_id', matchId)),
  ])

  return {
    meeting,
    attendances,
    deposits,
    refunds,
  }
}

async function loadMeetingEvidence(supabase: SupabaseServerClient, matchId: string) {
  const meeting = await safeMaybeSingle<MeetingEvidenceRow>(() => supabase
    .from('match_meetings')
    .select('id,venue_id,scheduled_start,scheduled_end,status,checkin_radius_m')
    .eq('match_id', matchId))

  const venueId = typeof meeting?.venue_id === 'string' ? meeting.venue_id : null
  const venue = venueId
    ? await safeMaybeSingle<VenueEvidenceRow>(() => supabase
      .from('venues')
      .select('name,address,map_url,latitude,longitude,checkin_radius_m')
      .eq('id', venueId))
    : null

  return { meeting, venue }
}

async function safeSelect<T>(query: () => PromiseLike<{ data: T[] | null; error: unknown }>) {
  try {
    const { data, error } = await query()
    if (error) return []
    return data ?? []
  } catch {
    return []
  }
}

async function safeMaybeSingle<T>(query: () => { maybeSingle: () => PromiseLike<{ data: T | null; error: unknown }> }) {
  try {
    const { data, error } = await query().maybeSingle()
    if (error) return null
    return data ?? null
  } catch {
    return null
  }
}
