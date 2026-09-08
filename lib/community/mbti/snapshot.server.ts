import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase-admin'

import { aggregateSelfReported } from './aggregation'
import {
  aggregateMeetingStats,
  protectMeetingStatsAggregate,
  type AuthoritativeAttendanceInput,
  type MeetingStatsConsentInput,
  type MeetingStatsCell,
  type PublicMeetingStatsAggregate,
} from './meeting-stats'
import {
  COMMUNITY_MBTI_PUBLIC_POLICY,
  isFreshPublicSnapshot,
  protectSelfReportedAggregate,
  type MbtiPublicAggregate,
} from './privacy'
import { MbtiRepositoryError } from './repository'
import {
  mapMbtiExperienceRow,
  mapMbtiMeetingConsentRow,
  mapMbtiParticipantRow,
} from './server-repository'
import { MBTI_TYPES } from './types'

const PAGE_SIZE = 500

export interface MbtiPublicSnapshotDto {
  generatedAt: string
  expiresAt: string
  selfReported: MbtiPublicAggregate
  meetingStats: {
    status: 'unavailable' | 'insufficient_sample' | 'published'
    label: '같은 회차에서 만난 조합'
    reason: 'authoritative_attendance_unavailable' | 'insufficient_sample' | null
    generatedAt: string | null
    eligibleOccurrenceCount: number | null
    uniqueConsentingParticipantCount: number | null
    cells: MeetingStatsCell[]
    limitations: string[]
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function purgeAggregationBoundary(value: unknown): Date {
  const row = object(value)
  const boundary = row && typeof row.aggregation_boundary === 'string'
    ? new Date(row.aggregation_boundary)
    : null
  if (!boundary || !Number.isFinite(boundary.getTime())) {
    throw new MbtiRepositoryError('invalid_response')
  }
  return boundary
}

function publicAggregate(value: unknown): MbtiPublicAggregate | null {
  const row = object(value)
  if (
    !row
    || row.policyVersion !== COMMUNITY_MBTI_PUBLIC_POLICY.version
    || typeof row.generatedAt !== 'string'
    || !['published', 'insufficient_sample', 'suppressed'].includes(String(row.status))
    || !Array.isArray(row.selfMbti)
    || !Array.isArray(row.reportedCombinations)
    || !Array.isArray(row.ratedCombinations)
    || !Array.isArray(row.matchedAspects)
    || !Array.isArray(row.limitations)
  ) return null
  return value as MbtiPublicAggregate
}

function publicMeetingAggregate(value: unknown): PublicMeetingStatsAggregate | null {
  const row = object(value)
  if (
    !row
    || row.source !== 'authoritative_attendance'
    || row.label !== '같은 회차에서 만난 조합'
    || row.status !== 'published'
    || typeof row.generatedAt !== 'string'
    || typeof row.eligibleOccurrenceCount !== 'number'
    || !Number.isInteger(row.eligibleOccurrenceCount)
    || row.eligibleOccurrenceCount < 20
    || typeof row.uniqueConsentingParticipantCount !== 'number'
    || !Number.isInteger(row.uniqueConsentingParticipantCount)
    || row.uniqueConsentingParticipantCount < 20
    || !Array.isArray(row.cells)
    || !Array.isArray(row.limitations)
  ) return null
  if (!row.limitations.every((entry) => typeof entry === 'string')) return null
  for (const value of row.cells) {
    const cell = object(value)
    if (!cell
      || !MBTI_TYPES.includes(cell.firstMbti as (typeof MBTI_TYPES)[number])
      || cell.firstGender !== 'female'
      || !MBTI_TYPES.includes(cell.secondMbti as (typeof MBTI_TYPES)[number])
      || cell.secondGender !== 'male'
      || typeof cell.occurrenceCount !== 'number'
      || !Number.isInteger(cell.occurrenceCount)
      || cell.occurrenceCount < 10
      || typeof cell.uniqueConsentingParticipantCount !== 'number'
      || !Number.isInteger(cell.uniqueConsentingParticipantCount)
      || cell.uniqueConsentingParticipantCount < 10) return null
  }
  return value as PublicMeetingStatsAggregate
}

async function latestSnapshot(status?: 'published'): Promise<Record<string, unknown> | null> {
  const client = createSupabaseAdminClient()
  if (!client) throw new MbtiRepositoryError('service_unavailable')
  const query = client
    .from('community_mbti_public_snapshots')
    .select('generated_at,expires_at,status,self_reported,meeting_stats_status,meeting_stats')
  const { data, error } = await (status ? query.eq('status', status) : query)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new MbtiRepositoryError('service_unavailable')
  return object(data)
}

async function freshSnapshot(now: Date): Promise<Record<string, unknown> | null> {
  const client = createSupabaseAdminClient()
  if (!client) throw new MbtiRepositoryError('service_unavailable')
  const { data, error } = await client.rpc('service_get_fresh_community_mbti_snapshot', {
    p_now: now.toISOString(),
  })
  if (error) throw new MbtiRepositoryError('service_unavailable')
  return object(data)
}

async function latestPublishedMeetingSnapshot(): Promise<Record<string, unknown> | null> {
  const client = createSupabaseAdminClient()
  if (!client) throw new MbtiRepositoryError('service_unavailable')
  const { data, error } = await client
    .from('community_mbti_public_snapshots')
    .select('meeting_stats')
    .eq('meeting_stats_status', 'published')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new MbtiRepositoryError('service_unavailable')
  return object(data)
}

export async function readPublicMbtiSnapshot(now = new Date()): Promise<MbtiPublicSnapshotDto> {
  const row = await freshSnapshot(now)
  const generatedAt = row && typeof row.generated_at === 'string' ? row.generated_at : ''
  const expiresAt = row && typeof row.expires_at === 'string' ? row.expires_at : ''
  const aggregate = row ? publicAggregate(row.self_reported) : null
  if (!row || !aggregate || !isFreshPublicSnapshot(generatedAt, now) || Date.parse(expiresAt) <= now.getTime()) {
    throw new MbtiRepositoryError('service_unavailable')
  }
  const meetingStatus = row.meeting_stats_status
  if (!['unavailable', 'insufficient_sample', 'published'].includes(String(meetingStatus))) {
    throw new MbtiRepositoryError('invalid_response')
  }
  const publishedMeeting = meetingStatus === 'published'
    ? publicMeetingAggregate(row.meeting_stats)
    : null
  if (meetingStatus === 'published' && !publishedMeeting) {
    throw new MbtiRepositoryError('invalid_response')
  }
  return {
    generatedAt,
    expiresAt,
    selfReported: aggregate,
    meetingStats: {
      status: meetingStatus as MbtiPublicSnapshotDto['meetingStats']['status'],
      label: '같은 회차에서 만난 조합',
      reason: meetingStatus === 'unavailable'
        ? 'authoritative_attendance_unavailable'
        : meetingStatus === 'insufficient_sample'
          ? 'insufficient_sample'
          : null,
      generatedAt: publishedMeeting?.generatedAt ?? null,
      eligibleOccurrenceCount: publishedMeeting?.eligibleOccurrenceCount ?? null,
      uniqueConsentingParticipantCount: publishedMeeting?.uniqueConsentingParticipantCount ?? null,
      cells: publishedMeeting?.cells ?? [],
      limitations: publishedMeeting?.limitations ?? [
        '1:1 매칭이나 확인된 커플 수를 뜻하지 않아요.',
      ],
    },
  }
}

async function readAllRows(
  table: 'community_mbti_participants' | 'community_mbti_experiences' | 'community_mbti_meeting_stats_consents',
  orderColumn: 'owner_user_id' | 'experience_id',
): Promise<unknown[]> {
  const client = createSupabaseAdminClient()
  if (!client) throw new MbtiRepositoryError('service_unavailable')
  const rows: unknown[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order(orderColumn, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error || !Array.isArray(data)) throw new MbtiRepositoryError('service_unavailable')
    rows.push(...data)
    if (data.length < PAGE_SIZE) return rows
  }
}

async function readEligibleOwnerIds(): Promise<Set<string>> {
  const client = createSupabaseAdminClient()
  if (!client) throw new MbtiRepositoryError('service_unavailable')
  const ownerIds = new Set<string>()
  let cursor: string | null = null
  for (;;) {
    const { data, error } = await client.rpc('service_list_eligible_community_mbti_owner_ids', {
      p_after_owner_user_id: cursor,
      p_limit: PAGE_SIZE,
    })
    if (error || !Array.isArray(data)) throw new MbtiRepositoryError('service_unavailable')
    let lastOwnerId: string | null = null
    for (const value of data) {
      const row = object(value)
      if (!row || typeof row.owner_user_id !== 'string' || row.owner_user_id.length === 0) {
        throw new MbtiRepositoryError('invalid_response')
      }
      ownerIds.add(row.owner_user_id)
      lastOwnerId = row.owner_user_id
    }
    if (data.length < PAGE_SIZE) return ownerIds
    if (!lastOwnerId || lastOwnerId === cursor) throw new MbtiRepositoryError('invalid_response')
    cursor = lastOwnerId
  }
}

async function readSourceEpoch(): Promise<string> {
  const client = createSupabaseAdminClient()
  if (!client) throw new MbtiRepositoryError('service_unavailable')
  const { data, error } = await client.rpc('service_get_community_mbti_source_epoch')
  if (error) throw new MbtiRepositoryError('service_unavailable')
  if (typeof data === 'number' && Number.isSafeInteger(data) && data >= 0) return String(data)
  if (typeof data === 'string' && /^(0|[1-9]\d*)$/.test(data)) return data
  throw new MbtiRepositoryError('invalid_response')
}

interface AttendanceCursor {
  sourceKind: 'continuation' | 'tonight_team' | 'weekly'
  occurrenceId: string
  participantUserId: string
}

function authoritativeAttendanceRow(value: unknown): {
  cursor: AttendanceCursor
  attendance: AuthoritativeAttendanceInput
} | null {
  const row = object(value)
  if (!row
    || !['continuation', 'tonight_team', 'weekly'].includes(String(row.source_kind))
    || typeof row.occurrence_id !== 'string'
    || typeof row.participant_user_id !== 'string'
    || typeof row.authoritative !== 'boolean'
    || typeof row.attended !== 'boolean') return null
  const sourceKind = row.source_kind as AttendanceCursor['sourceKind']
  return {
    cursor: {
      sourceKind,
      occurrenceId: row.occurrence_id,
      participantUserId: row.participant_user_id,
    },
    attendance: {
      occurrenceId: `${sourceKind}:${row.occurrence_id}`,
      ownerUserId: row.participant_user_id,
      authoritative: row.authoritative,
      attended: row.attended,
    },
  }
}

async function readAuthoritativeAttendance(): Promise<AuthoritativeAttendanceInput[] | null> {
  const client = createSupabaseAdminClient()
  if (!client) throw new MbtiRepositoryError('service_unavailable')
  const attendances: AuthoritativeAttendanceInput[] = []
  let cursor: AttendanceCursor | null = null
  for (;;) {
    const result = await client.rpc('service_list_authoritative_mbti_attendance', {
      p_after_source_kind: cursor?.sourceKind ?? null,
      p_after_occurrence_id: cursor?.occurrenceId ?? null,
      p_after_participant_user_id: cursor?.participantUserId ?? null,
      p_limit: PAGE_SIZE,
    }) as { data: unknown; error: unknown }
    if (result.error || !Array.isArray(result.data)) return null
    const page: Array<ReturnType<typeof authoritativeAttendanceRow>> = (result.data as unknown[])
      .map(authoritativeAttendanceRow)
    const validPage = page.filter(
      (entry): entry is NonNullable<ReturnType<typeof authoritativeAttendanceRow>> => entry !== null,
    )
    if (validPage.length !== page.length) return null
    attendances.push(...validPage.map((entry) => entry.attendance))
    if (validPage.length < PAGE_SIZE) return attendances
    const nextCursor: AttendanceCursor | undefined = validPage.at(-1)?.cursor
    if (!nextCursor
      || (cursor
        && nextCursor.sourceKind === cursor.sourceKind
        && nextCursor.occurrenceId === cursor.occurrenceId
        && nextCursor.participantUserId === cursor.participantUserId)) return null
    cursor = nextCursor
  }
}

export async function refreshPublicMbtiSnapshot(now?: Date): Promise<MbtiPublicSnapshotDto> {
  const client = createSupabaseAdminClient()
  if (!client) throw new MbtiRepositoryError('service_unavailable')
  const purge = await client.rpc('service_purge_expired_community_mbti')
  if (purge.error) throw new MbtiRepositoryError('service_unavailable')
  const aggregationNow = now ?? purgeAggregationBoundary(purge.data)
  const sourceEpoch = await readSourceEpoch()

  const [participantRows, experienceRows, meetingConsentRows, attendanceRows, previousRow, previousMeetingRow, eligibleOwnerIds] = await Promise.all([
    readAllRows('community_mbti_participants', 'owner_user_id'),
    readAllRows('community_mbti_experiences', 'experience_id'),
    readAllRows('community_mbti_meeting_stats_consents', 'owner_user_id'),
    readAuthoritativeAttendance(),
    latestSnapshot('published'),
    latestPublishedMeetingSnapshot(),
    readEligibleOwnerIds(),
  ])
  const participants = participantRows.map(mapMbtiParticipantRow)
    .filter((participant) => eligibleOwnerIds.has(participant.ownerUserId))
  const experiences = experienceRows.map(mapMbtiExperienceRow)
    .filter((experience) => eligibleOwnerIds.has(experience.ownerUserId))
  const meetingConsents = meetingConsentRows.map(mapMbtiMeetingConsentRow)
    .filter((consent) => eligibleOwnerIds.has(consent.ownerUserId))
  const raw = aggregateSelfReported(
    participants,
    experiences,
    aggregationNow,
  )
  const previous = previousRow ? publicAggregate(previousRow.self_reported) : null
  const protectedAggregate = protectSelfReportedAggregate(raw, previous, COMMUNITY_MBTI_PUBLIC_POLICY)
  const generatedAt = aggregationNow.toISOString()
  const expiresAt = new Date(aggregationNow.getTime() + COMMUNITY_MBTI_PUBLIC_POLICY.maximumSnapshotAgeMs).toISOString()
  let meetingStatus: MbtiPublicSnapshotDto['meetingStats']['status'] = 'unavailable'
  let publishedMeeting: PublicMeetingStatsAggregate | null = null
  if (attendanceRows) {
    const consents: MeetingStatsConsentInput[] = meetingConsents.map((consent) => {
      return {
        ownerUserId: consent.ownerUserId,
        selfMbti: consent.selfMbti,
        selfGender: consent.selfGender,
        expiresAt: consent.expiresAt,
        withdrawnAt: null,
      }
    })
    const rawMeeting = aggregateMeetingStats({ attendances: attendanceRows, consents, now: aggregationNow })
    const previousMeeting = previousMeetingRow
      ? publicMeetingAggregate(previousMeetingRow.meeting_stats)
      : null
    const protectedMeeting = protectMeetingStatsAggregate(rawMeeting, previousMeeting)
    meetingStatus = protectedMeeting.status === 'published' ? 'published' : 'insufficient_sample'
    publishedMeeting = protectedMeeting.status === 'published' ? protectedMeeting : null
  }
  const { error } = await client.rpc('service_publish_community_mbti_snapshot', {
    p_expected_source_epoch: sourceEpoch,
    p_generated_at: generatedAt,
    p_expires_at: expiresAt,
    p_privacy_policy_version: COMMUNITY_MBTI_PUBLIC_POLICY.version,
    p_status: protectedAggregate.status,
    p_self_reported: protectedAggregate,
    p_meeting_stats_status: meetingStatus,
    p_meeting_stats: publishedMeeting,
  })
  if (error) throw new MbtiRepositoryError('service_unavailable')
  return {
    generatedAt,
    expiresAt,
    selfReported: protectedAggregate,
    meetingStats: {
      status: meetingStatus,
      label: '같은 회차에서 만난 조합',
      reason: meetingStatus === 'unavailable'
        ? 'authoritative_attendance_unavailable'
        : meetingStatus === 'insufficient_sample'
          ? 'insufficient_sample'
          : null,
      generatedAt: publishedMeeting?.generatedAt ?? null,
      eligibleOccurrenceCount: publishedMeeting?.eligibleOccurrenceCount ?? null,
      uniqueConsentingParticipantCount: publishedMeeting?.uniqueConsentingParticipantCount ?? null,
      cells: publishedMeeting?.cells ?? [],
      limitations: publishedMeeting?.limitations ?? [
        '1:1 매칭이나 확인된 커플 수를 뜻하지 않아요.',
      ],
    },
  }
}
