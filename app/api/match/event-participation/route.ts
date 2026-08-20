import { NextRequest, NextResponse } from 'next/server'

import {
  isQuantumEventParticipation,
  parseQuantumEventParticipationInput,
  type QuantumEventParticipation,
} from '@/lib/matching/quantum-event-participation'
import {
  isActiveQuantumEventLifecycle,
  isQuantumEventLifecycle,
  type QuantumEventLifecycle,
} from '@/lib/matching/quantum-event-lifecycle'
import { parseQuantumMeetingMoment } from '@/lib/matching/quantum-profile-preferences'
import { parseMySecretRole } from '@/lib/matching/quantum-secret-roles'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return json({ participation: null, availability: 'auth_required' })
  }

  const current = await readCurrentParticipation(supabase)
  if (current.kind === 'ready') {
    return json({ participation: current.participation, availability: 'ready' })
  }
  if (current.kind === 'schema_unavailable') {
    return json({ participation: null, availability: 'schema_unavailable' })
  }
  return jsonError('participation_lookup_failed', 500)
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return jsonError('Unauthorized', 401)

  const body = await readJson(request)
  const parsed = parseQuantumEventParticipationInput(body)
  if (!parsed.ok) return jsonError(parsed.error, 400)
  if (parsed.value.partyType === 'friends' && !parsed.value.groupId) {
    return jsonError('friend_group_required', 409)
  }

  const meetingMoment = parseParticipationMeetingMoment(body)
  if (!meetingMoment) return jsonError('invalid_meeting_moment', 400)

  const { data, error } = await supabase.rpc('save_my_quantum_event_meeting_moment_and_participate', {
    p_event_key: parsed.value.eventId,
    p_event_mode: parsed.value.eventMode,
    p_party_type: parsed.value.partyType,
    p_group_id: parsed.value.groupId,
    p_payload: meetingMoment,
  })

  if (error) {
    if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
    if (error.message?.toLowerCase().includes('invalid_meeting_moment')) {
      return jsonError('invalid_meeting_moment', 400)
    }
    const eventError = mapEventApplicationError(error)
    if (eventError) return jsonError(eventError, 409)
    const mapped = mapFriendGroupError(error)
    if (mapped) return jsonError(mapped, 409)
    return jsonError('participation_save_failed', 500)
  }

  const result = isRecord(data) ? data : null
  const participation = result?.participation
  const savedMoment = parseQuantumMeetingMoment(result?.meeting_moment)
  const secretRole = parseMySecretRole(result?.secret_role)
  const roleConfirmationRequired = result?.role_confirmation_required
  const applicationConfirmed = result?.application_confirmed
  if (!isQuantumEventParticipation(participation)
    || !isRecord(participation)
    || typeof participation.occurrence_id !== 'string'
    || !savedMoment
    || savedMoment.occurrenceKey !== participation.occurrence_id
    || !secretRole
    || secretRole.occurrenceId !== participation.occurrence_id
    || typeof roleConfirmationRequired !== 'boolean'
    || roleConfirmationRequired !== !secretRole.roleConfirmed
    || typeof applicationConfirmed !== 'boolean'
    || applicationConfirmed !== secretRole.applicationConfirmed) {
    return jsonError('participation_response_invalid', 500)
  }

  return json({
    participation,
    meeting_moment: savedMoment,
    secret_role: secretRole,
    role_confirmation_required: roleConfirmationRequired,
    application_confirmed: applicationConfirmed,
  })
}

function mapFriendGroupError(error: { message?: string }): string | null {
  const message = error.message?.toLowerCase() ?? ''
  if (message.includes('friend_group_required') || message.includes('group_not_found')) return 'friend_group_required'
  if (message.includes('friend_group_leader_required')) return 'friend_group_leader_required'
  if (message.includes('friend_group_gender_mismatch')) return 'friend_group_gender_mismatch'
  if (message.includes('friend_group_not_ready') || message.includes('friend_group_member_count')) return 'friend_group_not_ready'
  return null
}

function mapEventApplicationError(error: { message?: string }): string | null {
  const message = error.message?.toLowerCase() ?? ''
  for (const code of [
    'profile_preference_required',
    'application_closed',
    'event_not_recruiting',
    'event_full',
    'gender_capacity_full',
    'event_state_locked',
    'profile_gender_required',
    'party_member_already_applied',
  ]) {
    if (message.includes(code)) return code
  }
  return null
}

function parseParticipationMeetingMoment(value: unknown) {
  if (!isRecord(value) || !isRecord(value.meeting_moment)) return null
  const moment = value.meeting_moment
  const keys = Object.keys(moment)
  if (keys.length !== 3
    || !keys.includes('mood')
    || !keys.includes('expectation')
    || !keys.includes('activityChoice')) {
    return null
  }

  const parsed = parseQuantumMeetingMoment({
    ...moment,
    occurrenceKey: '00000000-0000-4000-8000-000000000000',
  })
  return parsed
    ? {
        mood: parsed.mood,
        expectation: parsed.expectation,
        activityChoice: parsed.activityChoice,
      }
    : null
}

export async function DELETE(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return jsonError('Unauthorized', 401)

  const { data, error } = await supabase.rpc('cancel_my_quantum_event_participation')
  if (error) {
    if (isSchemaUnavailable(error)) return jsonError('schema_unavailable', 503)
    if (error.message?.toLowerCase().includes('friend_party_leader_required')) {
      return jsonError('friend_party_leader_required', 403)
    }
    if (error.message?.toLowerCase().includes('event_state_locked')) {
      return jsonError('event_state_locked', 409)
    }
    return jsonError('participation_cancel_failed', 500)
  }

  const cancellation = normalizeCancellationResponse(data)
  if (!cancellation.cancelled) {
    const current = await readCurrentParticipation(supabase)
    if (current.kind !== 'ready') return jsonError('participation_lookup_failed', 500)

    return json({
      cancelled: current.activeParticipation === null,
      participation: current.activeParticipation,
    })
  }

  return json(cancellation)
}

type CurrentParticipation = QuantumEventParticipation | QuantumEventLifecycle
type CurrentParticipationRead =
  | { kind: 'ready'; participation: CurrentParticipation | null; activeParticipation: CurrentParticipation | null }
  | { kind: 'schema_unavailable' }
  | { kind: 'error' }

async function readCurrentParticipation(
  supabase: ReturnType<typeof createSupabaseRequestClient>,
): Promise<CurrentParticipationRead> {
  const lifecycleResult = await supabase.rpc('get_my_quantum_event_lifecycle')
  if (!lifecycleResult.error && isQuantumEventLifecycle(lifecycleResult.data)) {
    return {
      kind: 'ready',
      participation: lifecycleResult.data,
      activeParticipation: isActiveQuantumEventLifecycle(lifecycleResult.data)
        ? lifecycleResult.data
        : null,
    }
  }

  if (lifecycleResult.error && !isSchemaUnavailable(lifecycleResult.error)) {
    return { kind: 'error' }
  }

  const legacyResult = await supabase.rpc('get_my_quantum_event_participation')
  if (legacyResult.error) {
    return isSchemaUnavailable(legacyResult.error)
      ? { kind: 'schema_unavailable' }
      : { kind: 'error' }
  }

  const participation = isQuantumEventParticipation(legacyResult.data) ? legacyResult.data : null
  return { kind: 'ready', participation, activeParticipation: participation }
}

function normalizeCancellationResponse(data: unknown) {
  if (typeof data === 'boolean') {
    return { cancelled: data, participation: null }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { cancelled: false, participation: null }
  }

  const result = data as {
    cancelled?: unknown
    participation?: unknown
    remaining_participation?: unknown
  }
  const remaining = result.remaining_participation ?? result.participation
  const participation = isQuantumEventLifecycle(remaining) || isQuantumEventParticipation(remaining)
    ? remaining
    : null

  return { cancelled: result.cancelled === true, participation }
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function isSchemaUnavailable(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === 'PGRST202'
    || error.code === '42P01'
    || error.code === '42883'
    || message.includes('could not find the function')
    || message.includes('does not exist')
  )
}

function jsonError(error: string, status: number) {
  return json({ error }, { status })
}

function json(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  for (const [name, value] of Object.entries(PRIVATE_NO_STORE_HEADERS)) {
    headers.set(name, value)
  }
  return NextResponse.json(body, { ...init, headers })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
