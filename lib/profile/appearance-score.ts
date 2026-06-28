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
