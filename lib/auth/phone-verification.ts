import { createHmac } from 'node:crypto'

export const PHONE_VERIFICATION_SESSION_COOKIE = 'quantum-phone-verification'

export const PHONE_OTP_LIMITS = Object.freeze({
  resendCooldownSeconds: 60,
  maxAttemptsPerChallenge: 5,
  startsPerPhonePerHour: 10,
  startsPerIpPerHour: 100,
  startsPerAccountPerHour: 10,
})

export type PhoneVerificationPurpose = 'signup_or_signin' | 'link_existing_account'

export type PhoneChallengeBinding = {
  expiresAt: string
  consumedAt: string | null
  attemptCount: number
  sessionBindingHash: string
  phoneHash: string
  purpose: PhoneVerificationPurpose
  accountUserId: string | null
}

export function normalizeKoreanMobilePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed || /[^\d+()\s.-]/.test(trimmed)) return null
  let digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('82')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)
  return /^10\d{8}$/.test(digits) ? `+82${digits}` : null
}

const INTEGRATED_LOCAL_SUPABASE_URL = 'http://127.0.0.1:56421'
const INTEGRATED_LOCAL_PHONE_TEST_NUMBERS = new Set([
  '+821000000001',
  '+821000000002',
  '+821000000003',
  '+821000000004',
])

export function isPhoneAllowedForRuntime(
  normalizedPhone: string,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (env.QUANTUM_LOCAL_RUNTIME_MODE !== 'live-local') return true

  return env.NODE_ENV === 'development'
    && env.NEXT_PUBLIC_SUPABASE_URL === INTEGRATED_LOCAL_SUPABASE_URL
    && INTEGRATED_LOCAL_PHONE_TEST_NUMBERS.has(normalizedPhone)
}

export function parsePhoneOtpCode(input: unknown): string | null {
  return typeof input === 'string' && /^\d{6}$/.test(input) ? input : null
}

export function resolvePhoneVerificationPurpose(accountUserId: string | null): PhoneVerificationPurpose {
  return accountUserId ? 'link_existing_account' : 'signup_or_signin'
}

export function readPhoneOtpProviderConfig(env: Readonly<Record<string, string | undefined>>):
  | { ok: true; otpTtlSeconds: number }
  | { ok: false; error: 'provider_config_invalid' } {
  const raw = env.SUPABASE_PHONE_OTP_TTL_SECONDS
  if (!raw || !/^\d+$/.test(raw)) return { ok: false, error: 'provider_config_invalid' }
  const otpTtlSeconds = Number(raw)
  if (!Number.isInteger(otpTtlSeconds) || otpTtlSeconds < 60 || otpTtlSeconds > 3600) {
    return { ok: false, error: 'provider_config_invalid' }
  }
  return { ok: true, otpTtlSeconds }
}

export function getPhoneVerificationDigestSecret(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const candidate = env.PHONE_VERIFICATION_DIGEST_SECRET
    ?? env.SUPABASE_SECRET_KEY
    ?? env.SUPABASE_SERVICE_ROLE_KEY
  return candidate && candidate.length >= 24 && !/\s/.test(candidate) ? candidate : null
}

export function digestPhoneVerificationValue(
  value: string,
  secret: string,
  context: 'phone' | 'session' | 'ip',
): string {
  if (!value || secret.length < 24) throw new Error('phone_verification_digest_config_invalid')
  return createHmac('sha256', secret)
    .update(`quantum-phone-verification:${context}:v1:${value}`)
    .digest('hex')
}

export function validatePhoneChallengeBinding({
  challenge,
  now,
  sessionBindingHash,
  phoneHash,
  purpose,
  accountUserId,
}: {
  challenge: PhoneChallengeBinding
  now: Date
  sessionBindingHash: string
  phoneHash: string
  purpose: PhoneVerificationPurpose
  accountUserId: string | null
}): 'challenge_invalid' | null {
  const expiresAt = Date.parse(challenge.expiresAt)
  if (
    challenge.consumedAt !== null
    || !Number.isFinite(expiresAt)
    || !Number.isFinite(now.getTime())
    || now.getTime() >= expiresAt
    || !Number.isInteger(challenge.attemptCount)
    || challenge.attemptCount >= PHONE_OTP_LIMITS.maxAttemptsPerChallenge
    || challenge.sessionBindingHash !== sessionBindingHash
    || challenge.phoneHash !== phoneHash
    || challenge.purpose !== purpose
    || challenge.accountUserId !== accountUserId
  ) return 'challenge_invalid'
  return null
}

export function toPublicPhoneVerificationError(_internalError: unknown): 'phone_verification_failed' {
  return 'phone_verification_failed'
}
