import type { Big5Vector, NumericVector } from './types'

export type PersonalityPreferenceAxis =
  | 'openness'
  | 'conscientiousness'
  | 'extraversion'
  | 'agreeableness'
  | 'emotional_stability'

export type PersonalityType =
  | 'warm_empathic'
  | 'active_social'
  | 'calm_stable'
  | 'diligent_planned'
  | 'intellectual_curious'
  | 'free_individual'
  | 'direct_honest'
  | 'playful_humorous'

export interface PersonalityPreferenceVector {
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  emotional_stability: number
}

export type PersonalityTypeWeights = Record<PersonalityType, number>

export interface PersonalityPreferenceAnswer {
  axis: PersonalityPreferenceAxis
  answer: 1 | 2 | 3 | 4 | 5
  questionId?: string
}

export interface PersonalityPreferenceProfile {
  vector: PersonalityPreferenceVector
  preferredBig5: Big5Vector
  typeWeights: PersonalityTypeWeights
  primaryType: PersonalityType
  secondaryType: PersonalityType | null
  answerLogs: PersonalityPreferenceAnswer[]
  confidence: number
  impressionPriorVector: NumericVector
}

export interface PersonalityPreferenceStoragePayload {
  preferred_personality_vector: PersonalityPreferenceVector
  preferred_personality_delta_vector: PersonalityPreferenceVector
  preferred_personality_type_weights: PersonalityTypeWeights
  preferred_personality_primary_type: PersonalityType
  preferred_personality_secondary_type: PersonalityType | null
  personality_preference_answer_logs: PersonalityPreferenceAnswer[]
  personality_preference_confidence: number
}

const AXES: PersonalityPreferenceAxis[] = [
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'emotional_stability',
]

const PERSONALITY_TYPES: PersonalityType[] = [
  'warm_empathic',
  'active_social',
  'calm_stable',
  'diligent_planned',
  'intellectual_curious',
  'free_individual',
  'direct_honest',
  'playful_humorous',
]

export function buildPersonalityPreferenceProfile(
  answers: PersonalityPreferenceAnswer[],
): PersonalityPreferenceProfile {
  const vector = buildPersonalityPreferenceVector(answers)
  const typeWeights = calculatePersonalityTypeWeights(vector)
  const { primaryType, secondaryType } = pickPrimarySecondary(typeWeights)
  const preferredBig5 = toPreferredBig5(vector)

  return {
    vector,
    preferredBig5,
    typeWeights,
    primaryType,
    secondaryType,
    answerLogs: answers,
    confidence: calculateConfidence(answers),
    impressionPriorVector: personalityImpressionPriorFromBig5(preferredBig5),
  }
}

export function buildPersonalityPreferenceVector(
  answers: PersonalityPreferenceAnswer[],
): PersonalityPreferenceVector {
  const grouped = AXES.reduce<Record<PersonalityPreferenceAxis, number[]>>((acc, axis) => {
    acc[axis] = []
    return acc
  }, {} as Record<PersonalityPreferenceAxis, number[]>)

  for (const answer of answers) {
    grouped[answer.axis].push(normalizeLikertAnswer(answer.answer))
  }

  return {
    openness: meanOrNeutral(grouped.openness),
    conscientiousness: meanOrNeutral(grouped.conscientiousness),
    extraversion: meanOrNeutral(grouped.extraversion),
    agreeableness: meanOrNeutral(grouped.agreeableness),
    emotional_stability: meanOrNeutral(grouped.emotional_stability),
  }
}

export function normalizeLikertAnswer(answer: number): number {
  if (!Number.isInteger(answer) || answer < 1 || answer > 5) {
    throw new Error('personality preference answer must be an integer from 1 to 5')
  }
  return round((answer - 1) / 4)
}

export function toPreferredBig5(vector: PersonalityPreferenceVector): Big5Vector {
  return {
    openness: round(clamp01(vector.openness)),
    conscientiousness: round(clamp01(vector.conscientiousness)),
    extraversion: round(clamp01(vector.extraversion)),
    agreeableness: round(clamp01(vector.agreeableness)),
    neuroticism: round(1 - clamp01(vector.emotional_stability)),
  }
}

export function big5ToPersonalityPreferenceVector(big5: Big5Vector): PersonalityPreferenceVector {
  return {
    openness: round(clamp01(big5.openness)),
    conscientiousness: round(clamp01(big5.conscientiousness)),
    extraversion: round(clamp01(big5.extraversion)),
    agreeableness: round(clamp01(big5.agreeableness)),
    emotional_stability: round(1 - clamp01(big5.neuroticism)),
  }
}

export function buildPersonalityPreferenceStoragePayload(
  profile: PersonalityPreferenceProfile,
  selfBig5?: Big5Vector | null,
): PersonalityPreferenceStoragePayload {
  const baseline = selfBig5
    ? big5ToPersonalityPreferenceVector(selfBig5)
    : {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        emotional_stability: 0.5,
      }

  return {
    preferred_personality_vector: profile.vector,
    preferred_personality_delta_vector: subtractPreferenceVectors(profile.vector, baseline),
    preferred_personality_type_weights: profile.typeWeights,
    preferred_personality_primary_type: profile.primaryType,
    preferred_personality_secondary_type: profile.secondaryType,
    personality_preference_answer_logs: profile.answerLogs,
    personality_preference_confidence: profile.confidence,
  }
}

export function scorePersonalityFit(
  preferred: PersonalityPreferenceVector,
  actual: Big5Vector,
): number {
  const actualPreferenceSpace: PersonalityPreferenceVector = {
    openness: actual.openness,
    conscientiousness: actual.conscientiousness,
    extraversion: actual.extraversion,
    agreeableness: actual.agreeableness,
    emotional_stability: 1 - actual.neuroticism,
  }
  const distance = AXES.reduce(
    (sum, axis) => sum + Math.abs(clamp01(preferred[axis]) - clamp01(actualPreferenceSpace[axis])),
    0,
  )
  return round(clamp01(1 - distance / AXES.length))
}

export function calculatePersonalityTypeWeights(
  vector: PersonalityPreferenceVector,
): PersonalityTypeWeights {
  const openness = clamp01(vector.openness)
  const conscientiousness = clamp01(vector.conscientiousness)
  const extraversion = clamp01(vector.extraversion)
  const agreeableness = clamp01(vector.agreeableness)
  const emotionalStability = clamp01(vector.emotional_stability)

  return normalizeTypeWeights({
    warm_empathic:
      agreeableness * 0.45 +
      emotionalStability * 0.25 +
      conscientiousness * 0.15 +
      extraversion * 0.10 +
      openness * 0.05,
    active_social:
      extraversion * 0.55 +
      openness * 0.20 +
      agreeableness * 0.15 +
      emotionalStability * 0.10,
    calm_stable:
      emotionalStability * 0.50 +
      conscientiousness * 0.25 +
      agreeableness * 0.15 +
      extraversion * 0.10,
    diligent_planned:
      conscientiousness * 0.55 +
      emotionalStability * 0.20 +
      agreeableness * 0.15 +
      openness * 0.10,
    intellectual_curious:
      openness * 0.55 +
      conscientiousness * 0.20 +
      emotionalStability * 0.15 +
      extraversion * 0.10,
    free_individual:
      openness * 0.45 +
      emotionalStability * 0.20 +
      extraversion * 0.15 +
      agreeableness * 0.10 +
      (1 - conscientiousness) * 0.10,
    direct_honest:
      emotionalStability * 0.30 +
      extraversion * 0.25 +
      conscientiousness * 0.20 +
      agreeableness * 0.15 +
      openness * 0.10,
    playful_humorous:
      extraversion * 0.35 +
      openness * 0.30 +
      agreeableness * 0.20 +
      emotionalStability * 0.15,
  })
}

export function pickPrimarySecondary(typeWeights: PersonalityTypeWeights): {
  primaryType: PersonalityType
  secondaryType: PersonalityType | null
} {
  const ranked = PERSONALITY_TYPES
    .map((type) => ({ type, score: typeWeights[type] }))
    .sort((a, b) => b.score - a.score)
  const primary = ranked[0]
  const secondary = ranked[1]

  return {
    primaryType: primary.type,
    secondaryType: secondary.score >= primary.score * 0.75 ? secondary.type : null,
  }
}

export function personalityImpressionPriorFromBig5(big5: Big5Vector): NumericVector {
  const openness = clamp01(big5.openness)
  const conscientiousness = clamp01(big5.conscientiousness)
  const extraversion = clamp01(big5.extraversion)
  const agreeableness = clamp01(big5.agreeableness)
  const emotionalStability = clamp01(1 - big5.neuroticism)

  return normalizeNumericVector({
    cute:
      extraversion * 0.35 +
      agreeableness * 0.25 +
      (1 - conscientiousness) * 0.15 +
      emotionalStability * 0.10,
    pure:
      conscientiousness * 0.30 +
      agreeableness * 0.25 +
      emotionalStability * 0.25 +
      (1 - extraversion) * 0.10,
    chic:
      (1 - extraversion) * 0.40 +
      emotionalStability * 0.25 +
      openness * 0.15 +
      conscientiousness * 0.10,
    warm:
      agreeableness * 0.45 +
      emotionalStability * 0.25 +
      extraversion * 0.15 +
      conscientiousness * 0.10,
    stylish:
      openness * 0.45 +
      extraversion * 0.15 +
      (1 - conscientiousness) * 0.15 +
      emotionalStability * 0.10,
    healthy:
      extraversion * 0.35 +
      emotionalStability * 0.25 +
      conscientiousness * 0.15 +
      agreeableness * 0.10,
  })
}

function normalizeTypeWeights(raw: Record<PersonalityType, number>): PersonalityTypeWeights {
  const sum = PERSONALITY_TYPES.reduce((total, type) => total + Math.max(0, raw[type]), 0)
  if (sum === 0) {
    const neutral = round(1 / PERSONALITY_TYPES.length)
    return PERSONALITY_TYPES.reduce((acc, type) => {
      acc[type] = neutral
      return acc
    }, {} as PersonalityTypeWeights)
  }

  return PERSONALITY_TYPES.reduce((acc, type) => {
    acc[type] = round(Math.max(0, raw[type]) / sum)
    return acc
  }, {} as PersonalityTypeWeights)
}

function normalizeNumericVector(raw: NumericVector): NumericVector {
  const entries = Object.entries(raw)
  const sum = entries.reduce((total, [, value]) => total + Math.max(0, value), 0)
  if (sum === 0) return Object.fromEntries(entries.map(([key]) => [key, 0]))
  return Object.fromEntries(entries.map(([key, value]) => [key, round(Math.max(0, value) / sum)]))
}

function calculateConfidence(answers: PersonalityPreferenceAnswer[]): number {
  const answeredAxes = new Set(answers.map((answer) => answer.axis))
  return round(answeredAxes.size / AXES.length)
}

function meanOrNeutral(values: number[]): number {
  if (values.length === 0) return 0.5
  return round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function subtractPreferenceVectors(
  preferred: PersonalityPreferenceVector,
  baseline: PersonalityPreferenceVector,
): PersonalityPreferenceVector {
  return {
    openness: round(preferred.openness - baseline.openness),
    conscientiousness: round(preferred.conscientiousness - baseline.conscientiousness),
    extraversion: round(preferred.extraversion - baseline.extraversion),
    agreeableness: round(preferred.agreeableness - baseline.agreeableness),
    emotional_stability: round(preferred.emotional_stability - baseline.emotional_stability),
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}
