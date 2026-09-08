const ISOLATED_LOCAL_AUTH_ORIGIN = 'http://127.0.0.1:56421'
const DEFAULT_TIMEOUT_MS = 1_500

function hasExpectedSettingsShape(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.external !== null
    && typeof value.external === 'object'
    && !Array.isArray(value.external)
    && typeof value.disable_signup === 'boolean'
    && typeof value.phone_autoconfirm === 'boolean'
}

function hasEnabledPhoneOtp(value) {
  return value.external.phone === true
    && value.disable_signup === false
    && value.phone_autoconfirm === false
}

export async function preflightIntegratedLocalAuth({
  url,
  publicKey,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (url !== ISOLATED_LOCAL_AUTH_ORIGIN) throw new Error('isolated_local_auth_required')
  if (typeof publicKey !== 'string' || !publicKey.trim()) throw new Error('local_auth_public_key_required')
  if (typeof fetchImpl !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('local_auth_preflight_invalid')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${ISOLATED_LOCAL_AUTH_ORIGIN}/auth/v1/settings`, {
      method: 'GET',
      headers: { apikey: publicKey },
      signal: controller.signal,
    })
    if (!response?.ok) throw new Error('local_auth_unavailable')

    let settings
    try {
      settings = await response.json()
    } catch {
      throw new Error('local_auth_invalid_settings')
    }
    if (!hasExpectedSettingsShape(settings)) throw new Error('local_auth_invalid_settings')
    if (!hasEnabledPhoneOtp(settings)) throw new Error('local_auth_phone_unavailable')
    return 'passed'
  } catch (error) {
    if (error instanceof Error && ['local_auth_unavailable', 'local_auth_invalid_settings', 'local_auth_phone_unavailable'].includes(error.message)) throw error
    throw new Error('local_auth_unavailable')
  } finally {
    clearTimeout(timeout)
  }
}
