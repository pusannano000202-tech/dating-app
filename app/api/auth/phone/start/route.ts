import { randomBytes } from 'node:crypto'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

import {
  PHONE_OTP_LIMITS,
  PHONE_VERIFICATION_SESSION_COOKIE,
  digestPhoneVerificationValue,
  getPhoneVerificationDigestSecret,
  isPhoneAllowedForRuntime,
  normalizeKoreanMobilePhone,
  readPhoneOtpProviderConfig,
  resolvePhoneVerificationPurpose,
} from '@/lib/auth/phone-verification'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { resolvePhoneClientAddress } from '@/lib/auth/phone-client-address'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { TrustedOriginError, assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import {
  getSupabaseConfigIssue,
  getSupabasePublicKey,
  getSupabaseUrl,
} from '@/lib/utils'

type CookieMutation = { name: string; value: string; options?: CookieOptions }
type ChallengeRow = { challenge_id: string; expires_at: string; retry_after_seconds: number }

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
  const clientAddress = resolvePhoneClientAddress(request.headers, process.env)
  if (getSupabaseConfigIssue() || !providerConfig.ok || !digestSecret || !admin || !clientAddress) {
    return privateJson({ error: 'phone_verification_unavailable' }, 503)
  }

  const input = await readJson(request)
  const normalizedPhone = normalizeKoreanMobilePhone(readField(input, 'phone'))
  if (!normalizedPhone) return privateJson({ error: 'invalid_phone' }, 400)
  if (!isPhoneAllowedForRuntime(normalizedPhone, process.env)) {
    return privateJson({ error: 'local_test_phone_only' }, 400)
  }

  const currentUser = await readOptionalUser(request)
  if (!currentUser.ok) return privateJson({ error: 'phone_verification_unavailable' }, 503)
  const accountUserId = currentUser.user?.id ?? null
  const purpose = resolvePhoneVerificationPurpose(accountUserId)

  const sessionBinding = readOrCreateSessionBinding(request)
  const phoneHash = digestPhoneVerificationValue(normalizedPhone, digestSecret, 'phone')
  const ipHash = digestPhoneVerificationValue(clientAddress, digestSecret, 'ip')
  const sessionBindingHash = digestPhoneVerificationValue(sessionBinding, digestSecret, 'session')

  const { data: reserved, error: reserveError } = await admin
    .rpc('reserve_phone_otp_challenge', {
      p_phone_hash: phoneHash,
      p_ip_hash: ipHash,
      p_session_binding_hash: sessionBindingHash,
      p_purpose: purpose,
      p_account_user_id: accountUserId,
      p_provider_ttl_seconds: providerConfig.otpTtlSeconds,
    })
    .maybeSingle<ChallengeRow>()
  if (reserveError || !reserved) {
    const status = isRateLimitError(reserveError) ? 429 : 503
    return withSessionBinding(
      privateJson({ error: status === 429 ? 'phone_verification_rate_limited' : 'phone_verification_unavailable' }, status),
      sessionBinding,
      providerConfig.otpTtlSeconds,
    )
  }

  const cookiesToSet: CookieMutation[] = []
  const supabase = createPhoneAuthClient(request, cookiesToSet)
  const providerResult = purpose === 'link_existing_account'
    ? await supabase.auth.updateUser({ phone: normalizedPhone })
    : await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: { shouldCreateUser: true },
      })

  if (providerResult.error) {
    return withCookieMutations(
      withSessionBinding(
        privateJson({ error: 'phone_verification_unavailable' }, 503),
        sessionBinding,
        providerConfig.otpTtlSeconds,
      ),
      cookiesToSet,
    )
  }

  return withCookieMutations(
    withSessionBinding(privateJson({
      ok: true,
      challenge_id: reserved.challenge_id,
      expires_at: reserved.expires_at,
      retry_after_seconds: Math.max(
        PHONE_OTP_LIMITS.resendCooldownSeconds,
        reserved.retry_after_seconds,
      ),
    }, 202), sessionBinding, providerConfig.otpTtlSeconds),
    cookiesToSet,
  )
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

function readOrCreateSessionBinding(request: NextRequest): string {
  const existing = request.cookies.get(PHONE_VERIFICATION_SESSION_COOKIE)?.value
  return existing && /^[A-Za-z0-9_-]{43}$/.test(existing)
    ? existing
    : randomBytes(32).toString('base64url')
}

function withSessionBinding(response: NextResponse, value: string, maxAge: number): NextResponse {
  response.cookies.set(PHONE_VERIFICATION_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  })
  return response
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

function isRateLimitError(error: { message?: string } | null): boolean {
  return Boolean(error?.message && /rate_limited|resend_cooldown/.test(error.message))
}

async function readJson(request: NextRequest): Promise<unknown> {
  try { return await request.json() } catch { return null }
}

function readField(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined
}
