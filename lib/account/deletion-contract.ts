export const ACCOUNT_DELETION_CONFIRMATION = '계정을 삭제합니다'
export const ACCOUNT_REAUTH_MAX_AGE_MS = 15 * 60 * 1000
const MAX_CLOCK_SKEW_MS = 30 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type AccountDeletionRequestInput = {
  confirmation: typeof ACCOUNT_DELETION_CONFIRMATION
  idempotencyKey: string
}

export type VoiceCleanupStatus = 'requested' | 'retry_pending'

export function resolveVoiceCleanupStatus(result: {
  failed: number
  pending: boolean
}): VoiceCleanupStatus {
  return result.failed === 0 && result.pending === false ? 'requested' : 'retry_pending'
}

export function parseAccountDeletionRequest(value: unknown): AccountDeletionRequestInput | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value).sort()
  if (keys.length !== 2 || keys[0] !== 'confirmation' || keys[1] !== 'idempotencyKey') return null
  if (value.confirmation !== ACCOUNT_DELETION_CONFIRMATION) return null
  if (typeof value.idempotencyKey !== 'string' || !UUID.test(value.idempotencyKey)) return null
  return {
    confirmation: ACCOUNT_DELETION_CONFIRMATION,
    idempotencyKey: value.idempotencyKey.toLowerCase(),
  }
}

export function isRecentAccountAuthentication(lastSignInAt: unknown, nowMs = Date.now()): boolean {
  if (typeof lastSignInAt !== 'string' || !Number.isFinite(nowMs)) return false
  const signedInAtMs = Date.parse(lastSignInAt)
  if (!Number.isFinite(signedInAtMs)) return false
  const ageMs = nowMs - signedInAtMs
  return ageMs >= -MAX_CLOCK_SKEW_MS && ageMs <= ACCOUNT_REAUTH_MAX_AGE_MS
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
