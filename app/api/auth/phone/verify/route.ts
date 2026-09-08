import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

import {
  PHONE_VERIFICATION_SESSION_COOKIE,
  digestPhoneVerificationValue,
  getPhoneVerificationDigestSecret,
  normalizeKoreanMobilePhone,
  parsePhoneOtpCode,
  readPhoneOtpProviderConfig,
  resolvePhoneVerificationPurpose,
  toPublicPhoneVerificationError,
} from '@/lib/auth/phone-verification'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { TrustedOriginError, assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import {
  getSupabaseConfigIssue,
  getSupabasePublicKey,
  getSupabaseUrl,
} from '@/lib/utils'

type CookieMutation = { name: string; value: string; options?: CookieOptions }

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationOrigin(request)
  } catch (error) {
    const status = error instanceof TrustedOriginError ? error.status : 403
    return privateJson({ error: status === 503 ? 'phone_verification_unavailable' : 'request_not_allowed' }, status)
  }
  const providerConfig = readPhoneOtpProviderConfig(process.env)
  const digestSecret = getPhoneVerificationDigestSecret()
  const admin = createSupabaseAdminClient()
  if (getSupabaseConfigIssue() || !providerConfig.ok || !digestSecret || !admin) {
    return privateJson({ error: 'phone_verification_unavailable' }, 503)
  }

  const input = await readJson(request)
  const challengeId = readUuid(readField(input, 'challenge_id'))
  const normalizedPhone = normalizeKoreanMobilePhone(readField(input, 'phone'))
  const otp = parsePhoneOtpCode(readField(input, 'code'))
  const sessionBinding = request.cookies.get(PHONE_VERIFICATION_SESSION_COOKIE)?.value
  if (!challengeId || !normalizedPhone || !otp || !sessionBinding || !/^[A-Za-z0-9_-]{43}$/.test(sessionBinding)) {
    return privateJson({ error: toPublicPhoneVerificationError('invalid_input') }, 400)
  }

  const currentUser = await readOptionalUser(request)
  if (!currentUser.ok) return privateJson({ error: 'phone_verification_unavailable' }, 503)
  const accountUserId = currentUser.user?.id ?? null
  const purpose = resolvePhoneVerificationPurpose(accountUserId)
  const phoneHash = digestPhoneVerificationValue(normalizedPhone, digestSecret, 'phone')
  const sessionBindingHash = digestPhoneVerificationValue(sessionBinding, digestSecret, 'session')

  const { error: attemptError } = await admin.rpc('reserve_phone_otp_attempt', {
    p_challenge_id: challengeId,
    p_session_binding_hash: sessionBindingHash,
    p_phone_hash: phoneHash,
    p_purpose: purpose,
    p_account_user_id: accountUserId,
  })
  if (attemptError) {
    return privateJson({ error: toPublicPhoneVerificationError(attemptError) }, 400)
  }

  const cookiesToSet: CookieMutation[] = []
  const supabase = createPhoneAuthClient(request, cookiesToSet)
  const { data, error: verifyError } = await supabase.auth.verifyOtp({
    phone: normalizedPhone,
    token: otp,
    type: purpose === 'link_existing_account' ? 'phone_change' : 'sms',
  })
  const verifiedUser = data.user
  if (
    verifyError
    || !verifiedUser
    || (purpose === 'link_existing_account' && verifiedUser.id !== accountUserId)
  ) {
    return privateJson({ error: toPublicPhoneVerificationError(verifyError) }, 400)
  }

  const { error: completionError } = await admin.rpc('complete_phone_otp_challenge', {
    p_challenge_id: challengeId,
    p_session_binding_hash: sessionBindingHash,
    p_phone_hash: phoneHash,
    p_purpose: purpose,
    p_account_user_id: accountUserId,
    p_verified_user_id: verifiedUser.id,
  })
  if (completionError) {
    return privateJson({ error: 'phone_verification_unavailable' }, 503)
  }

  const response = withCookieMutations(privateJson({
    ok: true,
    verified: true,
    next: '/auth/continue',
  }, 200), cookiesToSet)
  response.cookies.set(PHONE_VERIFICATION_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}

function createPhoneAuthClient(request: NextRequest, cookiesToSet: CookieMutation[]) {
  return createServerClient(getSupabaseUrl(), getSupabasePublicKey(), {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(nextCookies: CookieMutation[]) {
        cookiesToSet.splice(0, cookiesToSet.length, ...nextCookies)
      },
    },
  })
}

async function readOptionalUser(request: NextRequest): Promise<
  { ok: true; user: User | null } | { ok: false }
> {
  try {
    const { data: { user }, error } = await createSupabaseRequestClient(request).auth.getUser()
    if (error && ![400, 401, 403].includes(error.status ?? 0)) return { ok: false }
    return { ok: true, user: user ?? null }
  } catch {
    return { ok: false }
  }
}

function withCookieMutations(response: NextResponse, cookies: CookieMutation[]): NextResponse {
  cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options ?? {}))
  return response
}

function privateJson(body: object, status: number): NextResponse {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Vary', 'Cookie')
  return response
}

function readUuid(value: unknown): string | null {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

async function readJson(request: NextRequest): Promise<unknown> {
  try { return await request.json() } catch { return null }
}

function readField(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined
}
