import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import {
  MEETING_EVIDENCE_BUCKET,
  buildMeetingEvidencePath,
  validateMeetingEvidenceFile,
  validateMeetingEvidenceSignature,
} from '@/lib/matching/meeting-evidence'
import { getMeetingParticipantContext } from '@/lib/matching/meeting-evidence-server'
import { buildMeetingOperations } from '@/lib/matching/meeting-operations'

export const runtime = 'nodejs'

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
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
  if (!operations.can_upload_evidence) {
    return NextResponse.json({ error: 'evidence_window_closed', operations }, { status: 409 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 })
  }

  const photo = form.get('photo')
  if (!(photo instanceof File)) {
    return NextResponse.json({ error: 'photo_required' }, { status: 400 })
  }

  const validation = validateMeetingEvidenceFile({
    contentType: photo.type,
    byteSize: photo.size,
  })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 422 })
  }

  const bytes = Buffer.from(await photo.arrayBuffer())
  const signatureValidation = validateMeetingEvidenceSignature(bytes, photo.type)
  if (!signatureValidation.ok) {
    return NextResponse.json({ error: signatureValidation.error }, { status: 422 })
  }
  const fileSha256 = createHash('sha256').update(bytes).digest('hex')
  const existing = await findExistingEvidence(admin, params.id, fileSha256)
  if (existing.error) return NextResponse.json({ error: 'schema_unavailable' }, { status: 503 })
  if (existing.data) {
    return NextResponse.json({ evidence: existing.data, reused_existing: true, operations })
  }

  const priorSubmission = await findExistingUploaderEvidence(
    admin,
    params.id,
    authData.user.id,
  )
  if (priorSubmission.error) {
    return NextResponse.json({ error: 'schema_unavailable' }, { status: 503 })
  }
  if (priorSubmission.data) {
    return NextResponse.json({ error: 'evidence_already_submitted' }, { status: 409 })
  }

  const evidenceId = randomUUID()
  const storagePath = buildMeetingEvidencePath(params.id, evidenceId, validation.extension)
  const { error: uploadError } = await admin.storage
    .from(MEETING_EVIDENCE_BUCKET)
    .upload(storagePath, bytes, { contentType: photo.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: 'schema_unavailable' }, { status: 503 })
  }

  const { data: inserted, error: insertError } = await admin
    .from('meeting_photo_evidence')
    .insert({
      id: evidenceId,
      match_id: params.id,
      uploader_user_id: authData.user.id,
      storage_path: storagePath,
      file_sha256: fileSha256,
      content_type: photo.type,
      byte_size: photo.size,
    })
    .select('id, submitted_at, status')
    .single()

  if (!insertError && inserted) {
    return NextResponse.json({ evidence: inserted, reused_existing: false, operations }, { status: 201 })
  }

  await admin.storage.from(MEETING_EVIDENCE_BUCKET).remove([storagePath])
  if (insertError?.code === '23505') {
    const raced = await findExistingEvidence(admin, params.id, fileSha256)
    if (raced.data) {
      return NextResponse.json({ evidence: raced.data, reused_existing: true, operations })
    }
    const prior = await findExistingUploaderEvidence(admin, params.id, authData.user.id)
    if (prior.data) {
      return NextResponse.json({ error: 'evidence_already_submitted' }, { status: 409 })
    }
  }

  return NextResponse.json({ error: 'schema_unavailable' }, { status: 503 })
}

async function findExistingEvidence(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  matchId: string,
  fileSha256: string,
) {
  return admin
    .from('meeting_photo_evidence')
    .select('id, submitted_at, status')
    .eq('match_id', matchId)
    .eq('file_sha256', fileSha256)
    .maybeSingle()
}

async function findExistingUploaderEvidence(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  matchId: string,
  uploaderUserId: string,
) {
  return admin
    .from('meeting_photo_evidence')
    .select('id')
    .eq('match_id', matchId)
    .eq('uploader_user_id', uploaderUserId)
    .in('status', ['submitted', 'accepted'])
    .maybeSingle()
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
