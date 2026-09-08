export type MeetingOperationPhase =
  | 'scheduled'
  | 'check_in'
  | 'in_progress'
  | 'complete'
  | 'closed'

export type MeetingOperations = {
  starts_at: string
  ends_at: string
  chat_opens_at: string
  check_in_opens_at: string
  no_show_report_opens_at: string
  evidence_upload_opens_at: string
  evidence_upload_closes_at: string
  phase: MeetingOperationPhase
  can_upload_evidence: boolean
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

export function buildMeetingOperations(input: {
  startsAt: string
  endsAt: string
  now?: string
}): MeetingOperations {
  const startsAt = parseTimestamp(input.startsAt)
  const endsAt = parseTimestamp(input.endsAt)
  const now = input.now ? parseTimestamp(input.now) : new Date()

  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error('invalid_meeting_schedule')
  }

  const chatOpensAt = new Date(startsAt.getTime() - 20 * MINUTE_MS)
  const checkInOpensAt = new Date(startsAt.getTime() - 20 * MINUTE_MS)
  const noShowReportOpensAt = new Date(startsAt.getTime() + 10 * MINUTE_MS)
  const evidenceUploadClosesAt = new Date(endsAt.getTime() + 24 * HOUR_MS)
  const nowMs = now.getTime()

  let phase: MeetingOperationPhase = 'scheduled'
  if (nowMs > evidenceUploadClosesAt.getTime()) phase = 'closed'
  else if (nowMs >= endsAt.getTime()) phase = 'complete'
  else if (nowMs >= startsAt.getTime()) phase = 'in_progress'
  else if (nowMs >= checkInOpensAt.getTime()) phase = 'check_in'

  return {
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    chat_opens_at: chatOpensAt.toISOString(),
    check_in_opens_at: checkInOpensAt.toISOString(),
    no_show_report_opens_at: noShowReportOpensAt.toISOString(),
    evidence_upload_opens_at: checkInOpensAt.toISOString(),
    evidence_upload_closes_at: evidenceUploadClosesAt.toISOString(),
    phase,
    can_upload_evidence: nowMs >= checkInOpensAt.getTime()
      && nowMs <= evidenceUploadClosesAt.getTime(),
  }
}

function parseTimestamp(value: string): Date {
  const timestamp = new Date(value)
  if (!value || Number.isNaN(timestamp.getTime())) {
    throw new Error('invalid_meeting_schedule')
  }
  return timestamp
}
