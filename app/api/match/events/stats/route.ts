import { NextResponse } from 'next/server'

import {
  aggregateQuantumEventApplicantStats,
  type QuantumEventApplicantGender,
  type QuantumEventApplicantRow,
} from '@/lib/matching/quantum-event-stats'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

const LOOKBACK_DAYS = 21

export async function GET() {
  const supabase = createSupabaseAdminClient()
  if (!supabase) return unavailableResponse()

  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: participationData, error: participationError } = await supabase
    .from('quantum_event_participations')
    .select('user_id,event_id,event_mode,party_type,status,updated_at')
    .gte('updated_at', cutoff)

  if (participationError) return unavailableResponse()

  const participations = Array.isArray(participationData)
    ? participationData.filter(isParticipationRow)
    : []
  const userIds = Array.from(new Set(participations.map((row) => row.user_id)))
  if (userIds.length === 0) return readyResponse({})

  const { data: profileData, error: profileError } = await supabase.rpc(
    'get_quantum_event_profile_genders',
    { p_user_ids: userIds },
  )

  if (profileError) return unavailableResponse()

  const genderByUserId = new Map<string, QuantumEventApplicantGender>()
  for (const profile of Array.isArray(profileData) ? profileData : []) {
    if (!isRecord(profile) || typeof profile.user_id !== 'string') continue
    genderByUserId.set(
      profile.user_id,
      profile.gender === 'male' || profile.gender === 'female' ? profile.gender : null,
    )
  }

  const rows: QuantumEventApplicantRow[] = participations.map((row) => ({
    event_id: row.event_id,
    event_mode: row.event_mode,
    party_type: row.party_type,
    status: row.status,
    updated_at: row.updated_at,
    gender: genderByUserId.get(row.user_id) ?? null,
  }))

  return readyResponse(aggregateQuantumEventApplicantStats(rows))
}

function readyResponse(stats: ReturnType<typeof aggregateQuantumEventApplicantStats>) {
  return NextResponse.json(
    { stats, availability: 'ready' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

function unavailableResponse() {
  return NextResponse.json(
    { stats: {}, availability: 'unavailable' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

function isParticipationRow(value: unknown): value is {
  user_id: string
  event_id: string
  event_mode: 'tonight' | 'scheduled'
  party_type: 'solo' | 'friends'
  status: 'recruiting' | 'confirmed' | 'cancelled' | 'completed'
  updated_at: string
} {
  if (!isRecord(value)) return false
  return (
    typeof value.user_id === 'string'
    && typeof value.event_id === 'string'
    && (value.event_mode === 'tonight' || value.event_mode === 'scheduled')
    && (value.party_type === 'solo' || value.party_type === 'friends')
    && ['recruiting', 'confirmed', 'cancelled', 'completed'].includes(String(value.status))
    && typeof value.updated_at === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
