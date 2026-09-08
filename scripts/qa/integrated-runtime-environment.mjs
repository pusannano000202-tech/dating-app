import { INTEGRATED_STACK } from './integrated-local-config.mjs'

export function validateIntegratedLocalAuthEnvironment(values) {
  if (!Array.isArray(values)) throw new Error('Local test Auth settings are required')
  const env = Object.fromEntries(values.map(value => {
    const separator = value.indexOf('=')
    return [value.slice(0, separator), value.slice(separator + 1)]
  }))
  const expected = {
    GOTRUE_EXTERNAL_PHONE_ENABLED: 'true', GOTRUE_SMS_AUTOCONFIRM: 'false',
    GOTRUE_SMS_PROVIDER: 'twilio',
    GOTRUE_SMS_TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
    GOTRUE_SMS_TWILIO_MESSAGE_SERVICE_SID: 'MG00000000000000000000000000000000',
    GOTRUE_SMS_TWILIO_AUTH_TOKEN: 'local-test-only-not-a-provider-token',
  }
  const mappings = ['821000000001:100001', '821000000002:100002', '821000000003:100003', '821000000004:100004']
  if (!Object.entries(expected).every(([key, value]) => env[key] === value)
    || (env.GOTRUE_SMS_TEST_OTP || '').split(',').sort().join(',') !== mappings.join(',')) {
    throw new Error('Local Auth must use the exact test-number mapping and dummy-only SMS settings')
  }
  return env.GOTRUE_SMS_OTP_EXP
}

function hasKeyRole(key, role) {
  if (typeof key !== 'string' || !key) return false
  if (role === 'anon' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true
  if (role === 'service_role' && /^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return true
  try {
    const parts = key.split('.')
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === role
  } catch { return false }
}

// Status is read from the dedicated local CLI project, never from a hosted .env file.
// Role parsing is a configuration guard; Auth preflight verifies the running service.
export function createIntegratedRuntimeEnvironment(status, secrets, smsOtpTtl) {
  if (status?.API_URL !== INTEGRATED_STACK.apiUrl) throw new Error('Unexpected local Auth address')
  const publicKey = status.ANON_KEY || status.PUBLISHABLE_KEY
  const adminKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY
  if (!hasKeyRole(publicKey, 'anon') || !hasKeyRole(adminKey, 'service_role')) throw new Error('Invalid local credential roles')
  if (!/^[0-9]+$/.test(String(smsOtpTtl)) || !Number.isSafeInteger(Number(smsOtpTtl)) || Number(smsOtpTtl) < 60) throw new Error('Observed provider SMS TTL must be at least 60 seconds')
  // CLI 2.116.0 does not expose SMS expiry in config.toml. Keep the app challenge
  // at or below both the observed local provider lifetime and the app safety cap.
  // This does not change the provider or relax production config validation.
  const applicationChallengeTtl = Math.min(Number(smsOtpTtl), 3600)
  if (![secrets?.phoneDigest, secrets?.profileAlias].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) throw new Error('Stable private local secrets are required')
  return {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
    SUPABASE_SERVICE_ROLE_KEY: adminKey.startsWith('sb_secret_') ? '' : adminKey,
    SUPABASE_SECRET_KEY: adminKey.startsWith('sb_secret_') ? adminKey : '',
    SUPABASE_PHONE_OTP_TTL_SECONDS: String(applicationChallengeTtl),
    PHONE_VERIFICATION_DIGEST_SECRET: secrets.phoneDigest,
    PROFILE_ALIAS_SIGNING_SECRET: secrets.profileAlias,
    NEXT_PUBLIC_DEV_AUTH_BYPASS: 'false',
    PAYMENT_PROVIDER: 'mock',
    NEXT_PUBLIC_PAYMENT_PROVIDER: 'mock',
    CONTINUATION_LOCAL_PAYMENT_SIMULATOR_ENABLED: 'false',
    TONIGHT_AUTOMATION_ENABLED: 'false',
    TONIGHT_CARD_PAYMENTS_ENABLED: 'false',
    TOSS_SECRET_KEY: '',
    NEXT_PUBLIC_TOSS_CLIENT_KEY: '',
  }
}
