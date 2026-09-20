import { NextRequest, NextResponse } from 'next/server'

import { resolveProfileOnboardingStatus } from '@/lib/profile/onboarding-status'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

type ProfileRow = {
  display_name: string | null
  gender: string | null
  age: number | null
  height: number | null
  body_type: string | null
  hair_density: string | null
  school: string | null
  department: string | null
  year: number | null
  appearance_type: string | null
  worldcup_completed_at: string | null
  big5_openness: number | null
  big5_conscientiousness: number | null
  big5_extraversion: number | null
  big5_agreeableness: number | null
  big5_neuroticism: number | null
}

type ReadinessRow = {
  minimum_signup_complete?: unknown
  profile_onboarding_complete?: unknown
  matching_ready?: unknown
  missing_reasons?: unknown
}

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Optional request binding for resumable application screens. The authenticated
  // identity, not the header, still determines every query below.
  const expectedOwner = request.headers.get('X-Quantum-Owner')
  if (expectedOwner !== null && expectedOwner !== user.id) {
    return NextResponse.json({ error: 'account_changed' }, {
      status: 409, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization, X-Quantum-Owner' },
    })
  }

  const [profileResult, photoResult, appearanceResult, readinessResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, gender, age, height, body_type, hair_density, school, department, year, appearance_type, worldcup_completed_at, big5_openness, big5_conscientiousness, big5_extraversion, big5_agreeableness, big5_neuroticism')
      .eq('user_id', user.id)
      .maybeSingle<ProfileRow>(),
    supabase
      .from('photos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase.rpc('get_my_appearance_score_status').maybeSingle(),
    supabase.rpc('get_my_profile_readiness'),
  ])

  if (profileResult.error || photoResult.error || readinessResult.error) {
    return NextResponse.json({ error: 'profile_lookup_failed' }, { status: 500 })
  }

  const photoCount = photoResult.count ?? 0
  const readiness = firstRow<ReadinessRow>(readinessResult.data)
  if (!readiness) return NextResponse.json({ error: 'profile_readiness_unavailable' }, { status: 503 })
  const minimumSignupComplete = readiness.minimum_signup_complete === true
  const onboarding = resolveProfileOnboardingStatus({
    minimumSignupComplete,
    worldcupCompletedAt: profileResult.data?.worldcup_completed_at ?? null,
    photoCount,
  })

  return NextResponse.json({
    availability: 'ready',
    profile: toPublicProfile(profileResult.data),
    photo_count: photoCount,
    appearance_status: readAppearanceStatus(appearanceResult.data, appearanceResult.error),
    next_step: onboarding.nextStep,
    community_ready: minimumSignupComplete,
    minimum_signup_complete: minimumSignupComplete,
    profile_onboarding_complete: readiness.profile_onboarding_complete === true,
    matching_ready: readiness.matching_ready === true,
    missing_reasons: readStringArray(readiness.missing_reasons),
    is_complete: readiness.profile_onboarding_complete === true,
  }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } })
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null
  return value && typeof value === 'object' ? value as T : null
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function toPublicProfile(profile: ProfileRow | null) {
  if (!profile) return null
  const {
    appearance_type: _appearanceType,
    worldcup_completed_at: _worldcupCompletedAt,
    big5_openness: _openness,
    big5_conscientiousness: _conscientiousness,
    big5_extraversion: _extraversion,
    big5_agreeableness: _agreeableness,
    big5_neuroticism: _neuroticism,
    ...publicProfile
  } = profile
  return publicProfile
}

function readAppearanceStatus(value: unknown, error: unknown) {
  if (error) return 'unavailable'
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'not_requested'
  const status = 'status' in value ? value.status : null
  const photoRevision = 'photo_revision' in value ? value.photo_revision : null
  if (photoRevision == null) return 'not_requested'
  return status === 'pending' || status === 'ready' || status === 'failed' || status === 'stale'
    ? status
    : 'unavailable'
}
