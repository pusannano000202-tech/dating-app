import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { getAliasSigningSecret, verifyAliasTicket } from '@/lib/profile/alias-options'
import { parseBasicProfileInput } from '@/lib/profile/basic-profile-input'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { TrustedOriginError, assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('unauthorized', 401)

  const [{ data: minimumRows, error: minimumError }, { data: friendNameRows, error: friendNameError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.rpc('get_my_minimum_signup'),
    supabase.rpc('get_my_friend_recognition_name'),
    supabase
      .from('profiles')
      .select('display_name, gender, department, height, body_type, hair_density, year')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])
  if (minimumError) return jsonError('minimum_signup_lookup_failed', 503)
  if (friendNameError) return jsonError('friend_name_lookup_failed', 503)
  if (profileError) return jsonError('profile_lookup_failed', 500)

  const minimum = firstRow<Record<string, unknown>>(minimumRows)
  const friendName = firstRow<Record<string, unknown>>(friendNameRows)
  const legacyGender = profile?.gender === 'male' || profile?.gender === 'female'
    ? profile.gender
    : null
  return noStoreJson({
    profile: {
      display_name: typeof minimum?.display_name === 'string'
        ? minimum.display_name
        : validLegacyText(profile?.display_name, 2, 20),
      friend_recognition_name: validLegacyText(friendName?.friend_recognition_name, 2, 40),
      birth_date: typeof minimum?.birth_date === 'string' ? minimum.birth_date : '',
      school_scope: minimum?.school_scope === 'pnu_self_selected' ? minimum.school_scope : '',
      department: typeof minimum?.department === 'string'
        ? minimum.department
        : validLegacyText(profile?.department, 1, 120),
      gender: typeof minimum?.community_gender === 'string' ? minimum.community_gender : legacyGender,
      phone_verified: Boolean(user.phone && user.phone_confirmed_at),
      height: profile?.height ?? null,
      body_type: profile?.body_type ?? null,
      hair_density: profile?.hair_density ?? null,
      year: profile?.year ?? null,
    },
  })
}

export async function PUT(request: NextRequest) {
  try {
    assertTrustedMutationOrigin(request)
  } catch (error) {
    const status = error instanceof TrustedOriginError ? error.status : 403
    return jsonError(status === 503 ? 'server_unavailable' : 'request_not_allowed', status)
  }
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('unauthorized', 401)

  const parsed = parseBasicProfileInput(await readJson(request))
  if (!parsed.ok) return jsonError(parsed.error, 400)

  const admin = createSupabaseAdminClient()
  const aliasSecret = getAliasSigningSecret()
  if (!admin || !aliasSecret) return jsonError('server_unavailable', 503)

  const { value } = parsed
  if (!user.phone || !user.phone_confirmed_at) return jsonError('phone_verification_required', 409)

  const verifiedAlias = verifyAliasTicket({
    ticket: value.aliasTicket,
    selectedAlias: value.displayName,
    userId: user.id,
    secret: aliasSecret,
  })
  if (!verifiedAlias.ok) return jsonError(verifiedAlias.error, 400)

  const baseArgs = {
    p_user_id: user.id,
    p_display_name: verifiedAlias.displayName,
    p_birth_date: value.birthDate,
    p_school_scope: value.schoolScope,
    p_department: value.department,
    p_community_gender: value.gender,
    p_height: value.height,
    p_body_type: value.bodyType,
    p_hair_density: value.hairDensity,
    p_year: value.year,
  }
  // Older mobile builds may omit the new private name. They retain the old
  // signup contract and will be prompted to fill the null field after update.
  const { data: resultRows, error: saveError } = value.friendRecognitionName
    ? await admin.rpc('complete_minimum_signup_with_friend_name', {
        ...baseArgs, p_friend_recognition_name: value.friendRecognitionName,
      })
    : await admin.rpc('complete_minimum_signup', baseArgs)
  if (saveError) {
    if (saveError.message?.includes('alias_taken')) return jsonError('alias_taken', 409)
    if (saveError.message?.includes('phone_verification_required')) {
      return jsonError('phone_verification_required', 409)
    }
    return jsonError('profile_save_failed', 500)
  }

  const result = firstRow<Record<string, unknown>>(resultRows)
  if (!result || result.minimum_signup_complete !== true) return jsonError('profile_save_incomplete', 409)
  return noStoreJson({ ok: true, ...result })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
  })
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null
  return value && typeof value === 'object' ? value as T : null
}

function validLegacyText(value: unknown, minLength: number, maxLength: number): string {
  if (typeof value !== 'string') return ''
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length >= minLength && normalized.length <= maxLength ? normalized : ''
}

function noStoreJson(value: unknown) {
  return NextResponse.json(value, {
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
  })
}
