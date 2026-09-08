import {
  COMMUNITY_MBTI_CONSENT_VERSION,
  COMMUNITY_MBTI_GENDERS,
  COMMUNITY_MBTI_MEETING_STATS_CONSENT_VERSION,
  MATCHED_ASPECTS,
  MBTI_TYPES,
  PARTNER_MBTI_TYPES,
  RELATIONSHIP_STATUSES,
  type CommunityMbtiGender,
  type MatchedAspect,
  type MbtiExperienceCreateInput,
  type MbtiExperiencePatchInput,
  type MbtiMeetingStatsConsentInput,
  type MbtiMutationInput,
  type MbtiParticipantInput,
  type MbtiScore,
  type MbtiType,
  type RelationshipStatus,
} from './types'

const MAX_REVISION = 2_147_483_647
export const MAX_REPORTED_COUNT_PER_REQUEST = 100
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class MbtiInputError extends Error {
  readonly code: 'invalid_body' | 'unexpected_field' | 'invalid_field'
  readonly field: string | null

  constructor(code: 'invalid_body' | 'unexpected_field' | 'invalid_field', field: string | null = null) {
    super(code)
    this.name = 'MbtiInputError'
    this.code = code
    this.field = field
  }
}

function strictRecord(value: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MbtiInputError('invalid_body')
  }
  const record = value as Record<string, unknown>
  const allowed = new Set(allowedKeys)
  const unexpected = Object.keys(record).find((key) => !allowed.has(key))
  if (unexpected) throw new MbtiInputError('unexpected_field', unexpected)
  return record
}

function enumValue<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new MbtiInputError('invalid_field', field)
  }
  return value as T
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new MbtiInputError('invalid_field', field)
  }
  return value
}

function mutationId(value: unknown): string {
  if (typeof value !== 'string' || !IDEMPOTENCY_PATTERN.test(value)) {
    throw new MbtiInputError('invalid_field', 'client_mutation_id')
  }
  return value
}

function aspects(value: unknown, field: string): MatchedAspect[] | null {
  if (value === null) return null
  if (!Array.isArray(value) || value.length > MATCHED_ASPECTS.length) {
    throw new MbtiInputError('invalid_field', field)
  }
  const unique: MatchedAspect[] = []
  for (const item of value) {
    const aspect = enumValue(item, field, MATCHED_ASPECTS)
    if (!unique.includes(aspect)) unique.push(aspect)
  }
  return unique
}

function score(value: unknown, field: string): MbtiScore | null {
  if (value === null) return null
  return integer(value, field, 1, 5) as MbtiScore
}

function consent(value: unknown): true {
  if (value !== true) throw new MbtiInputError('invalid_field', 'consent')
  return true
}

function mbti(value: unknown, field: string): MbtiType {
  return enumValue(value, field, MBTI_TYPES)
}

function gender(value: unknown, field: string): CommunityMbtiGender {
  return enumValue(value, field, COMMUNITY_MBTI_GENDERS)
}

function relationshipStatus(value: unknown): RelationshipStatus {
  return enumValue(value, 'relationship_status', RELATIONSHIP_STATUSES)
}

export function parseParticipantInput(value: unknown): MbtiParticipantInput {
  const body = strictRecord(value, [
    'self_mbti', 'self_gender', 'consent', 'consent_version',
    'expected_revision', 'client_mutation_id',
  ])
  if (body.consent_version !== COMMUNITY_MBTI_CONSENT_VERSION) {
    throw new MbtiInputError('invalid_field', 'consent_version')
  }
  return {
    selfMbti: mbti(body.self_mbti, 'self_mbti'),
    selfGender: gender(body.self_gender, 'self_gender'),
    consent: consent(body.consent),
    consentVersion: COMMUNITY_MBTI_CONSENT_VERSION,
    expectedRevision: integer(body.expected_revision, 'expected_revision', 0, MAX_REVISION),
    clientMutationId: mutationId(body.client_mutation_id),
  }
}

export function parseExperienceCreateInput(value: unknown): MbtiExperienceCreateInput {
  const body = strictRecord(value, [
    'self_mbti_snapshot', 'partner_mbti', 'partner_gender', 'relationship_status',
    'entry_mode', 'reported_count', 'score', 'matched_aspects', 'client_mutation_id',
  ])
  const entryMode = enumValue(body.entry_mode, 'entry_mode', ['count_only', 'detailed'] as const)
  const reportedCount = integer(body.reported_count, 'reported_count', 1, MAX_REPORTED_COUNT_PER_REQUEST)
  const parsedScore = score(body.score, 'score')
  const parsedAspects = aspects(body.matched_aspects, 'matched_aspects')
  if (entryMode === 'count_only' && (parsedScore !== null || parsedAspects !== null)) {
    throw new MbtiInputError('invalid_field', parsedScore !== null ? 'score' : 'matched_aspects')
  }
  if (entryMode === 'detailed' && reportedCount !== 1) {
    throw new MbtiInputError('invalid_field', 'reported_count')
  }
  return {
    selfMbtiSnapshot: mbti(body.self_mbti_snapshot, 'self_mbti_snapshot'),
    partnerMbti: enumValue(body.partner_mbti, 'partner_mbti', PARTNER_MBTI_TYPES),
    partnerGender: gender(body.partner_gender, 'partner_gender'),
    relationshipStatus: relationshipStatus(body.relationship_status),
    entryMode,
    reportedCount,
    score: parsedScore,
    matchedAspects: parsedAspects,
    clientMutationId: mutationId(body.client_mutation_id),
  }
}

export function parseExperiencePatchInput(value: unknown): MbtiExperiencePatchInput {
  const body = strictRecord(value, [
    'expected_revision', 'client_mutation_id', 'reported_count',
    'partner_gender', 'relationship_status', 'score', 'matched_aspects',
    'self_mbti_snapshot', 'confirm_self_snapshot_change',
  ])
  const result: MbtiExperiencePatchInput = {
    expectedRevision: integer(body.expected_revision, 'expected_revision', 1, MAX_REVISION),
    clientMutationId: mutationId(body.client_mutation_id),
  }
  const changesSelfSnapshot = 'self_mbti_snapshot' in body
  if (changesSelfSnapshot !== ('confirm_self_snapshot_change' in body)
    || (changesSelfSnapshot && body.confirm_self_snapshot_change !== true)) {
    throw new MbtiInputError('invalid_field', 'confirm_self_snapshot_change')
  }
  if (changesSelfSnapshot) {
    result.selfMbtiSnapshot = mbti(body.self_mbti_snapshot, 'self_mbti_snapshot')
    result.confirmSelfSnapshotChange = true
  }
  if ('reported_count' in body) {
    result.reportedCount = integer(body.reported_count, 'reported_count', 1, MAX_REPORTED_COUNT_PER_REQUEST)
  }
  if ('partner_gender' in body) result.partnerGender = gender(body.partner_gender, 'partner_gender')
  if ('relationship_status' in body) result.relationshipStatus = relationshipStatus(body.relationship_status)
  if ('score' in body) result.score = score(body.score, 'score')
  if ('matched_aspects' in body) result.matchedAspects = aspects(body.matched_aspects, 'matched_aspects')
  if (Object.keys(result).length === 2) throw new MbtiInputError('invalid_field', 'patch')
  return result
}

export function parseMutationInput(value: unknown): MbtiMutationInput {
  const body = strictRecord(value, ['expected_revision', 'client_mutation_id'])
  return {
    expectedRevision: integer(body.expected_revision, 'expected_revision', 1, MAX_REVISION),
    clientMutationId: mutationId(body.client_mutation_id),
  }
}

export function parseMeetingStatsConsentInput(value: unknown): MbtiMeetingStatsConsentInput {
  const body = strictRecord(value, [
    'self_mbti', 'self_gender', 'consent', 'consent_version',
    'expected_revision', 'client_mutation_id',
  ])
  if (body.consent_version !== COMMUNITY_MBTI_MEETING_STATS_CONSENT_VERSION) {
    throw new MbtiInputError('invalid_field', 'consent_version')
  }
  return {
    selfMbti: mbti(body.self_mbti, 'self_mbti'),
    selfGender: gender(body.self_gender, 'self_gender'),
    consent: consent(body.consent),
    consentVersion: COMMUNITY_MBTI_MEETING_STATS_CONSENT_VERSION,
    expectedRevision: integer(body.expected_revision, 'expected_revision', 0, MAX_REVISION),
    clientMutationId: mutationId(body.client_mutation_id),
  }
}

export async function readMbtiJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new MbtiInputError('invalid_body')
  }
}

export function parseExperienceId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new MbtiInputError('invalid_field', 'experience_id')
  }
  return value.toLowerCase()
}

export function parseExperiencePage(url: URL): { limit: number; cursor: string | null } {
  const rawLimit = url.searchParams.get('limit')
  const limit = rawLimit === null ? 25 : Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new MbtiInputError('invalid_field', 'limit')
  }
  const rawCursor = url.searchParams.get('cursor')
  return {
    limit,
    cursor: rawCursor === null || rawCursor === '' ? null : parseExperienceId(rawCursor),
  }
}
