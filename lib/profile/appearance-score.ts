export type SelfAppearanceScoreSource = 'auto' | 'override' | 'legacy'

export interface SelfAppearanceScoreInputs {
  auto?: unknown
  override?: unknown
  legacy?: unknown
}

export interface ResolvedSelfAppearanceScore {
  score: number
  source: SelfAppearanceScoreSource
}

export type AppearanceScoreRequestFailureCode =
  | 'ai_server_timeout'
  | 'ai_server_unavailable'
  | 'ai_server_error'
  | 'ai_quota_unavailable'
  | 'ai_response_invalid'
  | 'score_not_found'
  | PhotoRejectionCode

export type PhotoRejectionCode =
  | 'photo_no_face'
  | 'photo_multiple_people'
  | 'photo_face_occluded'
  | 'photo_low_quality'
  | 'photo_minor_suspected'

export type AppearanceScoreRequestResult =
  | {
    ok: true
    score: number
    appearanceType: AppearanceType
    confidence: number
    modelVersion: string
    promptVersion: string
    anchorManifestVersion: string
  }
  | { ok: false; code: AppearanceScoreRequestFailureCode; status: number }

export type AppearanceType =
  | 'cute'
  | 'pure'
  | 'chic'
  | 'warm'
  | 'stylish'
  | 'healthy'

export type AppearanceGenderBank = 'female' | 'male'

export const APPROVED_APPEARANCE_ANALYSIS_VERSION = {
  modelVersion: 'gpt-5.6-terra',
  promptVersion: 'appearance-anchor-v3',
  anchorManifestVersion: 'approved-v1',
} as const

interface AppearanceScoreRequestOptions {
  serverUrl: string
  serverSecret: string
  userId: string
  photoUrls: string[]
  genderBank: AppearanceGenderBank
  timeoutMs: number
  fetchImpl?: typeof fetch
}

const DIRECT_SCORE_KEYS = [
  'self_appearance_score',
  'appearance_score',
  'score',
] as const

const NORMALIZED_SCORE_KEYS = [
  'self_appearance_score_normalized',
  'appearance_score_normalized',
  'score_normalized',
] as const

const NESTED_KEYS = ['data', 'result', 'payload', 'scores'] as const
const PHOTO_REJECTION_CODES = new Set<PhotoRejectionCode>([
  'photo_no_face',
  'photo_multiple_people',
  'photo_face_occluded',
  'photo_low_quality',
  'photo_minor_suspected',
])
const APPEARANCE_TYPES = new Set<AppearanceType>([
  'cute',
  'pure',
  'chic',
  'warm',
  'stylish',
  'healthy',
])
const SAFE_AI_FAILURE_CODES = new Map<string, AppearanceScoreRequestFailureCode>([
  ['analysis_quota_unavailable', 'ai_quota_unavailable'],
])
const DEFERRED_APPEARANCE_SCORE_FAILURE_CODES = new Set<string>([
  'ai_server_timeout',
  'ai_server_unavailable',
  'ai_server_error',
  'ai_server_not_configured',
  'ai_quota_unavailable',
  'ai_response_invalid',
  'score_not_found',
])

export function resolveSelfAppearanceScore(
  inputs: SelfAppearanceScoreInputs
): ResolvedSelfAppearanceScore | null {
  const override = normalizeScore(inputs.override)
  if (override !== null) {
    return { score: override, source: 'override' }
  }

  const auto = normalizeScore(inputs.auto)
  if (auto !== null) {
    return { score: auto, source: 'auto' }
  }

  const legacy = normalizeScore(inputs.legacy)
  if (legacy !== null) {
    return { score: legacy, source: 'legacy' }
  }

  return null
}

export function extractSelfAppearanceScore(payload: unknown): number | null {
  return extractSelfAppearanceScoreInner(payload, 0)
}

export function normalizeProfileAppearanceScore(value: unknown): number | null {
  const numberValue = toFiniteNumber(value)
  if (numberValue === null || numberValue < 0 || numberValue > 100) {
    return null
  }

  if (numberValue <= 1) {
    return roundScore(numberValue * 100)
  }

  return roundScore(numberValue)
}

export function shouldDeferAppearanceScoreFailure(code: string): boolean {
  return DEFERRED_APPEARANCE_SCORE_FAILURE_CODES.has(code)
}

export async function requestAppearanceScore({
  serverUrl,
  serverSecret,
  userId,
  photoUrls,
  genderBank,
  timeoutMs,
  fetchImpl = fetch,
}: AppearanceScoreRequestOptions): Promise<AppearanceScoreRequestResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(`${serverUrl}/api/score-photos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serverSecret}`,
      },
      body: JSON.stringify({
        user_id: userId,
        photo_urls: photoUrls,
        gender_bank: genderBank,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const safeFailureCode = await readSafeFailureCode(response)
      if (safeFailureCode) {
        return {
          ok: false,
          code: safeFailureCode,
          status: safeFailureCode === 'ai_quota_unavailable' ? 503 : 422,
        }
      }
      return { ok: false, code: 'ai_server_error', status: 502 }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return { ok: false, code: 'ai_response_invalid', status: 502 }
    }

    if (!isPlainObject(payload) || payload.status !== 'ok') {
      return { ok: false, code: 'ai_response_invalid', status: 502 }
    }

    const score = normalizeScore(payload.score_0_100)
    const appearanceType = readAppearanceType(payload.appearance_type)
    const confidence = readConfidence(payload.confidence)
    const modelVersion = readMetadataVersion(payload.model_version)
    const promptVersion = readMetadataVersion(payload.prompt_version)
    const anchorManifestVersion = readMetadataVersion(payload.anchor_manifest_version)
    if (
      score === null ||
      appearanceType === null ||
      confidence === null ||
      modelVersion === null ||
      promptVersion === null ||
      anchorManifestVersion === null ||
      modelVersion !== APPROVED_APPEARANCE_ANALYSIS_VERSION.modelVersion ||
      promptVersion !== APPROVED_APPEARANCE_ANALYSIS_VERSION.promptVersion ||
      anchorManifestVersion !== APPROVED_APPEARANCE_ANALYSIS_VERSION.anchorManifestVersion ||
      payload.reject_code !== 'none'
    ) {
      return { ok: false, code: 'ai_response_invalid', status: 502 }
    }

    return {
      ok: true,
      score,
      appearanceType,
      confidence,
      modelVersion,
      promptVersion,
      anchorManifestVersion,
    }
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError'
      ? { ok: false, code: 'ai_server_timeout', status: 504 }
      : { ok: false, code: 'ai_server_unavailable', status: 503 }
  } finally {
    clearTimeout(timeout)
  }
}

function readAppearanceType(value: unknown): AppearanceType | null {
  return typeof value === 'string' && APPEARANCE_TYPES.has(value as AppearanceType)
    ? value as AppearanceType
    : null
}

function readConfidence(value: unknown): number | null {
  const confidence = toFiniteNumber(value)
  return confidence === null || confidence < 0 || confidence > 1 ? null : confidence
}

function readMetadataVersion(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128
    ? value
    : null
}

async function readSafeFailureCode(
  response: Response,
): Promise<AppearanceScoreRequestFailureCode | null> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return null
  }

  if (!isPlainObject(payload) || typeof payload.code !== 'string') {
    return null
  }

  if (PHOTO_REJECTION_CODES.has(payload.code as PhotoRejectionCode)) {
    return payload.code as PhotoRejectionCode
  }

  return SAFE_AI_FAILURE_CODES.get(payload.code) ?? null
}

function extractSelfAppearanceScoreInner(payload: unknown, depth: number): number | null {
  if (!isPlainObject(payload) || depth > 4) {
    return null
  }

  for (const key of DIRECT_SCORE_KEYS) {
    if (key in payload) {
      const score = normalizeScore(payload[key])
      if (score !== null) {
        return score
      }
    }
  }

  for (const key of NORMALIZED_SCORE_KEYS) {
    if (key in payload) {
      const score = normalizeProfileAppearanceScore(payload[key])
      if (score !== null) {
        return score
      }
    }
  }

  for (const key of NESTED_KEYS) {
    if (key in payload) {
      const score = extractSelfAppearanceScoreInner(payload[key], depth + 1)
      if (score !== null) {
        return score
      }
    }
  }

  return null
}

function normalizeScore(value: unknown): number | null {
  const numberValue = toFiniteNumber(value)
  if (numberValue === null || numberValue < 0 || numberValue > 100) {
    return null
  }

  return roundScore(numberValue)
}

function toFiniteNumber(value: unknown): number | null {
  const numberValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN

  return Number.isFinite(numberValue) ? numberValue : null
}

function roundScore(score: number): number {
  return Math.round(score * 100) / 100
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
