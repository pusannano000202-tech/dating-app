import type { SupabaseClient } from '@supabase/supabase-js'

export type MeetingParticipantContext = {
  matchId: string
  groupIds: [string, string]
  startsAt: string
  endsAt: string
}

export type MeetingParticipantContextResult =
  | { ok: true; context: MeetingParticipantContext }
  | {
      ok: false
      error: 'match_not_found' | 'not_match_participant' | 'meeting_not_scheduled' | 'schema_unavailable'
    }

type MeetingEvidenceContextRow = {
  match_id: string
  group_a_id: string
  group_b_id: string
  is_participant: boolean
  scheduled_start: string | null
  scheduled_end: string | null
}

export async function getMeetingParticipantContext(
  admin: SupabaseClient,
  matchId: string,
  userId: string,
): Promise<MeetingParticipantContextResult> {
  const { data, error } = await admin
    .rpc('get_meeting_evidence_context', {
      p_match_id: matchId,
      p_user_id: userId,
    })
    .maybeSingle()

  if (error) return { ok: false, error: 'schema_unavailable' }
  const row = data as MeetingEvidenceContextRow | null
  if (!row) return { ok: false, error: 'match_not_found' }
  if (!row.is_participant) return { ok: false, error: 'not_match_participant' }
  if (!row.scheduled_start || !row.scheduled_end) {
    return { ok: false, error: 'meeting_not_scheduled' }
  }

  const groupIds: [string, string] = [row.group_a_id, row.group_b_id]
  return {
    ok: true,
    context: {
      matchId: row.match_id,
      groupIds,
      startsAt: row.scheduled_start,
      endsAt: row.scheduled_end,
    },
  }
}
