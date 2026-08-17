import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { parseBasicProfileInput } from '@/lib/profile/basic-profile-input'
import { createSupabaseRequestClient } from '@/lib/supabase-request'

export async function PUT(request: NextRequest) {
  const supabase = createSupabaseRequestClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('unauthorized', 401)

  const parsed = parseBasicProfileInput(await readJson(request))
  if (!parsed.ok) return jsonError(parsed.error, 400)

  const admin = createSupabaseAdminClient()
  if (!admin) return jsonError('server_unavailable', 503)

  const { value } = parsed
  const verifiedPhone = normalizeVerifiedPhone(user.phone)
  if (value.phone && value.phone !== verifiedPhone) {
    return jsonError('phone_verification_required', 409)
  }
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from('profiles')
    .select('school')
    .eq('user_id', user.id)
    .maybeSingle()
  if (existingProfileError) return jsonError('profile_lookup_failed', 500)
  if (existingProfile?.school && existingProfile.school !== value.school) {
    return jsonError('school_change_requires_support', 409)
  }

  const { error: nicknameError } = await supabase.rpc('claim_profile_display_name', {
    p_display_name: value.displayName,
  })
  if (nicknameError) {
    const code = nicknameError.message?.includes('nickname_taken') ? 'nickname_taken' : 'nickname_claim_failed'
    return jsonError(code, code === 'nickname_taken' ? 409 : 400)
  }

  const profile = {
    user_id: user.id,
    display_name: value.displayName,
    gender: value.gender,
    age: value.age,
    height: value.height,
    body_type: value.bodyType,
    hair_density: value.hairDensity,
    school: value.school,
    department: value.department,
    year: value.year,
    updated_at: new Date().toISOString(),
  }
  const { error: profileError } = await admin.from('profiles').upsert(profile, { onConflict: 'user_id' })
  if (profileError) return jsonError('profile_save_failed', 500)

  if (verifiedPhone) {
    const { data: userRow, error: phoneError } = await admin
      .from('users')
      .update({ phone: verifiedPhone })
      .eq('id', user.id)
      .select('id')
      .maybeSingle()
    if (phoneError) return jsonError('phone_save_failed', 500)
    if (!userRow) return jsonError('user_record_missing', 409)
  }

  return NextResponse.json({ ok: true, profile })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

function normalizeVerifiedPhone(value: string | undefined): string {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  const domesticDigits = digits.startsWith('82') ? `0${digits.slice(2)}` : digits
  if (!/^010\d{8}$/.test(domesticDigits)) return ''
  return `${domesticDigits.slice(0, 3)}-${domesticDigits.slice(3, 7)}-${domesticDigits.slice(7)}`
}
