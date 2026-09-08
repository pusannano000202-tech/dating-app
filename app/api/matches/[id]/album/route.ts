import { NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { MEETING_EVIDENCE_BUCKET } from '@/lib/matching/meeting-evidence'
import { getMeetingParticipantContext } from '@/lib/matching/meeting-evidence-server'
import { buildMeetingOperations } from '@/lib/matching/meeting-operations'

const SIGNED_URL_TTL_SECONDS = 300

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createSupabaseRequestClient(request)
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createSupabaseAdminClient()
  if (!admin) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 })

  const participant = await getMeetingParticipantContext(admin, params.id, authData.user.id)
  if (!participant.ok) return participantErrorResponse(participant.error)

  let operations
  try {
    operations = buildMeetingOperations({
      startsAt: participant.context.startsAt,
      endsAt: participant.context.endsAt,
    })
  } catch {
    return NextResponse.json({ error: 'meeting_not_scheduled' }, { status: 409 })
  }

  const { data: rows, error: readError } = await admin
    .from('meeting_photo_evidence')
    .select('id, storage_path, submitted_at, captured_at, status, uploader_user_id')
    .eq('match_id', params.id)
    .in('status', ['submitted', 'accepted'])
    .order('submitted_at', { ascending: false })
    .limit(50)

  if (readError) return NextResponse.json({ error: 'schema_unavailable' }, { status: 503 })

  const photos = []
  for (const row of rows ?? []) {
    const { data, error } = await admin.storage
      .from(MEETING_EVIDENCE_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS)
    if (error || !data.signedUrl) continue
    photos.push({
      id: row.id,
      signed_url: data.signedUrl,
      submitted_at: row.submitted_at,
      captured_at: row.captured_at,
      status: row.status,
      mine: row.uploader_user_id === authData.user.id,
      expires_in: 300,
    })
  }

  return NextResponse.json({ operations, photos })
}

function participantErrorResponse(error: string) {
  switch (error) {
    case 'match_not_found':
      return NextResponse.json({ error }, { status: 404 })
    case 'not_match_participant':
      return NextResponse.json({ error }, { status: 403 })
    case 'meeting_not_scheduled':
      return NextResponse.json({ error }, { status: 409 })
    default:
      return NextResponse.json({ error: 'schema_unavailable' }, { status: 503 })
  }
}
