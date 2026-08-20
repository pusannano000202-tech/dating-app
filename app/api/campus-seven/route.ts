import { NextResponse } from 'next/server'
import { getCampusSevenActionAvailability } from '@/lib/campus-seven/action-availability'
import { redactCampusSevenLocation } from '@/lib/campus-seven/dashboard'
import { getCampusSevenLiveGuide } from '@/lib/campus-seven/live-guide'
import { getCampusSevenFeatureState } from '@/lib/campus-seven/program'
import { signPrivateProfilePhotos } from '@/lib/profile/private-photo-signed-urls'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type CampusSevenDashboardPayload = {
  schedule?: null | {
    dayNumber: number
    startsAt: string
    endsAt: string
    meetingPointName?: string | null
    meetingPointAddress?: string | null
    venueName?: string | null
    venueAddress?: string | null
    venueBookingUrl?: string | null
    allowedMenuNote?: string | null
  }
  reservationTask?: unknown
  participants?: Array<Record<string, unknown> & { userId?: unknown }>
  [key: string]: unknown
}

export async function GET() {
  const feature = getCampusSevenFeatureState()
  if (!feature.visible) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_my_campus_seven_dashboard')
  if (error) {
    return NextResponse.json(
      { error: translateCampusSevenError(error.message) },
      { status: error.message.includes('get_my_campus_seven_dashboard') ? 503 : 400 },
    )
  }

  const dashboard = data as CampusSevenDashboardPayload | null
  const now = new Date().toISOString()
  const liveGuide = dashboard?.schedule
    ? getCampusSevenLiveGuide({
        dayNumber: dashboard.schedule.dayNumber,
        startsAt: dashboard.schedule.startsAt,
        endsAt: dashboard.schedule.endsAt,
        meetingPointName: dashboard.schedule.meetingPointName,
        venueName: dashboard.schedule.venueName,
        now,
      })
    : null
  const actionAvailability = getCampusSevenActionAvailability({
    schedule: dashboard?.schedule ?? null,
    now,
  })
  const releasedDashboard = dashboard
    ? redactCampusSevenLocation(dashboard, liveGuide)
    : dashboard
  const participantUserIds = readParticipantUserIds(releasedDashboard)
  const signedPhotos = await signPrivateProfilePhotos(participantUserIds, 1)
  if (!signedPhotos.ok) {
    return NextResponse.json({ error: 'photo_signing_failed' }, { status: 503 })
  }
  const signedDashboard = replaceCampusSevenPhotos(releasedDashboard, signedPhotos.urlsByUser)

  return NextResponse.json({
    dashboard: signedDashboard
      ? { ...signedDashboard, liveGuide, actionAvailability }
      : signedDashboard,
    applicationsOpen: feature.applicationsOpen,
    cardPaymentsEnabled: feature.cardPaymentsEnabled,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

function readParticipantUserIds(dashboard: CampusSevenDashboardPayload | null): string[] {
  if (!Array.isArray(dashboard?.participants)) return []
  return dashboard.participants
    .map((participant) => participant.userId)
    .filter((userId): userId is string => typeof userId === 'string')
}

function replaceCampusSevenPhotos(
  dashboard: CampusSevenDashboardPayload | null,
  urlsByUser: Record<string, string[]>,
): CampusSevenDashboardPayload | null {
  if (!dashboard || !Array.isArray(dashboard.participants)) return dashboard
  return {
    ...dashboard,
    participants: dashboard.participants.map((participant) => ({
      ...participant,
      photoUrl: typeof participant.userId === 'string'
        ? urlsByUser[participant.userId]?.[0] ?? null
        : null,
    })),
  }
}

function translateCampusSevenError(message = ''): string {
  if (message.includes('not_authenticated')) return 'Unauthorized'
  if (message.includes('get_my_campus_seven_dashboard')) return 'program_setup_required'
  return 'program_lookup_failed'
}
