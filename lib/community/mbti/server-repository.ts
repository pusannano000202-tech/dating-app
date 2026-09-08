import 'server-only'

import { TrustedOriginError, assertTrustedMutationOrigin } from '@/lib/auth/trusted-origin'
import { createSupabaseRequestClient } from '@/lib/supabase-request'
import { getPublicAppOrigin } from '@/lib/utils'

import { participantExpiresAt } from './privacy'
import {
  createOwnerMbtiRepository,
  MbtiRepositoryError,
  type MbtiStatePageInput,
  type MbtiStore,
  type OwnerMbtiRepository,
} from './repository'
import {
  COMMUNITY_MBTI_CONSENT_VERSION,
  COMMUNITY_MBTI_GENDERS,
  COMMUNITY_MBTI_MEETING_STATS_CONSENT_VERSION,
  MATCHED_ASPECTS,
  MBTI_TYPES,
  PARTNER_MBTI_TYPES,
  RELATIONSHIP_STATUSES,
  type MbtiExperienceCreateInput,
  type MbtiExperienceDto,
  type MbtiExperiencePatchInput,
  type MbtiMeetingStatsConsentDto,
  type MbtiMeetingStatsConsentInput,
  type MbtiMutationInput,
  type MbtiMutationResultDto,
  type MbtiOwnerStateDto,
  type MbtiParticipantDto,
  type MbtiParticipantInput,
} from './types'

interface MbtiRpcClient {
  auth: {
    getUser(): PromiseLike<{
      data: { user: { id: string } | null }
      error: unknown
    }>
  }
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export function assertMbtiMutationOrigin(request: Request): void {
  try {
    assertTrustedMutationOrigin(request, getPublicAppOrigin())
  } catch (error) {
    if (error instanceof TrustedOriginError) {
      throw new MbtiRepositoryError(
        error.status === 401 ? 'unauthenticated' : error.status === 403 ? 'forbidden' : 'service_unavailable',
      )
    }
    throw error
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MbtiRepositoryError('invalid_response')
  }
  return value as Record<string, unknown>
}

function string(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new MbtiRepositoryError('invalid_response')
  return value
}

function integer(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new MbtiRepositoryError('invalid_response')
  }
  return value
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new MbtiRepositoryError('invalid_response')
  }
  return value as T
}

export function mapMbtiParticipantRow(value: unknown): MbtiParticipantDto {
  const row = record(value)
  const consentConfirmedAt = string(row.consent_confirmed_at)
  if (row.consent_version !== COMMUNITY_MBTI_CONSENT_VERSION) throw new MbtiRepositoryError('invalid_response')
  return {
    ownerUserId: string(row.owner_user_id),
    selfMbti: enumValue(row.self_mbti, MBTI_TYPES),
    selfGender: enumValue(row.self_gender, COMMUNITY_MBTI_GENDERS),
    consentVersion: COMMUNITY_MBTI_CONSENT_VERSION,
    consentConfirmedAt,
    revision: integer(row.revision, 1),
    expiresAt: participantExpiresAt(consentConfirmedAt),
  }
}

export function mapMbtiExperienceRow(value: unknown): MbtiExperienceDto {
  const row = record(value)
  const entryMode = enumValue(row.entry_mode, ['count_only', 'detailed'] as const)
  const reportedCount = integer(row.reported_count, 1)
  const rawScore = row.score
  const score = rawScore === null ? null : integer(rawScore, 1)
  if (score !== null && score > 5) throw new MbtiRepositoryError('invalid_response')
  let matchedAspects = null
  if (row.matched_aspects !== null) {
    if (!Array.isArray(row.matched_aspects)) throw new MbtiRepositoryError('invalid_response')
    matchedAspects = row.matched_aspects.map((entry) => enumValue(entry, MATCHED_ASPECTS))
  }
  const base = {
    experienceId: string(row.experience_id),
    ownerUserId: string(row.owner_user_id),
    selfMbtiSnapshot: enumValue(row.self_mbti_snapshot, MBTI_TYPES),
    partnerMbti: enumValue(row.partner_mbti, PARTNER_MBTI_TYPES),
    partnerGender: enumValue(row.partner_gender, COMMUNITY_MBTI_GENDERS),
    relationshipStatus: enumValue(row.relationship_status, RELATIONSHIP_STATUSES),
    revision: integer(row.revision, 1),
    updatedAt: string(row.updated_at),
    expiresAt: string(row.expires_at),
  }
  if (entryMode === 'count_only') {
    if (score !== null || matchedAspects !== null) throw new MbtiRepositoryError('invalid_response')
    return { ...base, entryMode, reportedCount, score: null, matchedAspects: null }
  }
  if (reportedCount !== 1) throw new MbtiRepositoryError('invalid_response')
  return {
    ...base,
    entryMode,
    reportedCount: 1,
    score: score as 1 | 2 | 3 | 4 | 5 | null,
    matchedAspects,
  }
}

export function mapMbtiMeetingConsentRow(value: unknown): MbtiMeetingStatsConsentDto {
  const row = record(value)
  const consentConfirmedAt = string(row.consent_confirmed_at)
  if (row.consent_version !== COMMUNITY_MBTI_MEETING_STATS_CONSENT_VERSION) {
    throw new MbtiRepositoryError('invalid_response')
  }
  return {
    ownerUserId: string(row.owner_user_id),
    selfMbti: enumValue(row.self_mbti_snapshot, MBTI_TYPES),
    selfGender: enumValue(row.self_gender_snapshot, COMMUNITY_MBTI_GENDERS),
    consentVersion: COMMUNITY_MBTI_MEETING_STATS_CONSENT_VERSION,
    consentConfirmedAt,
    expiresAt: participantExpiresAt(consentConfirmedAt),
    revision: integer(row.revision, 1),
  }
}

export function mapMbtiMutationResult(value: unknown): MbtiMutationResultDto {
  const row = record(value)
  const status = enumValue(row.status, ['saved', 'deleted', 'expanded', 'withdrawn'] as const)
  const resourceId = row.resource_id === null ? null : string(row.resource_id)
  if (!Array.isArray(row.resource_ids)) throw new MbtiRepositoryError('invalid_response')
  return {
    status,
    resourceId,
    resourceIds: row.resource_ids.map(string),
    revision: integer(row.revision),
  }
}

function rpcError(error: unknown): MbtiRepositoryError {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message.toLowerCase()
    : ''
  if (/not_authenticated/.test(message)) return new MbtiRepositoryError('unauthenticated')
  if (/not_found/.test(message)) return new MbtiRepositoryError('not_found')
  if (/stale_revision/.test(message)) return new MbtiRepositoryError('stale_revision')
  if (/idempotency_conflict/.test(message)) return new MbtiRepositoryError('idempotency_conflict')
  if (/idempotency_result_unavailable/.test(message)) return new MbtiRepositoryError('idempotency_result_unavailable')
  if (/invalid_|required|too_large|conflict/.test(message)) return new MbtiRepositoryError('invalid_request')
  return new MbtiRepositoryError('service_unavailable')
}

async function callRpc(client: MbtiRpcClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  let result: { data: unknown; error: unknown }
  try {
    result = await client.rpc(name, args)
  } catch {
    throw new MbtiRepositoryError('service_unavailable')
  }
  if (result.error) throw rpcError(result.error)
  return result.data
}

function assertOwner(ownerUserId: string, authenticatedOwnerUserId: string): void {
  if (ownerUserId !== authenticatedOwnerUserId) throw new MbtiRepositoryError('unauthenticated')
}

function createRpcStore(client: MbtiRpcClient, authenticatedOwnerUserId: string): MbtiStore {
  return {
    async getState(ownerUserId: string, page: MbtiStatePageInput = {}): Promise<MbtiOwnerStateDto> {
      assertOwner(ownerUserId, authenticatedOwnerUserId)
      const value = record(await callRpc(client, 'community_mbti_get_my_state', {
        p_limit: page.limit ?? 25,
        p_cursor: page.cursor ?? null,
      }))
      const experiences = value.experiences
      if (!Array.isArray(experiences)) throw new MbtiRepositoryError('invalid_response')
      return {
        participant: value.participant === null ? null : mapMbtiParticipantRow(value.participant),
        experiences: experiences.map(mapMbtiExperienceRow),
        nextCursor: value.next_cursor === null ? null : string(value.next_cursor),
        meetingStatsConsent: value.meeting_stats_consent === null
          ? null
          : mapMbtiMeetingConsentRow(value.meeting_stats_consent),
      }
    },
    async upsertParticipant(ownerUserId: string, input: MbtiParticipantInput) {
      assertOwner(ownerUserId, authenticatedOwnerUserId)
      return mapMbtiMutationResult(await callRpc(client, 'community_mbti_upsert_participant', {
        p_self_mbti: input.selfMbti,
        p_self_gender: input.selfGender,
        p_consent_version: input.consentVersion,
        p_expected_revision: input.expectedRevision,
        p_client_mutation_id: input.clientMutationId,
      }))
    },
    async createExperience(ownerUserId: string, input: MbtiExperienceCreateInput) {
      assertOwner(ownerUserId, authenticatedOwnerUserId)
      return mapMbtiMutationResult(await callRpc(client, 'community_mbti_create_experience', {
        p_self_mbti_snapshot: input.selfMbtiSnapshot,
        p_partner_mbti: input.partnerMbti,
        p_partner_gender: input.partnerGender,
        p_relationship_status: input.relationshipStatus,
        p_entry_mode: input.entryMode,
        p_reported_count: input.reportedCount,
        p_score: input.score,
        p_matched_aspects: input.matchedAspects,
        p_client_mutation_id: input.clientMutationId,
      }))
    },
    async updateExperience(ownerUserId: string, experienceId: string, input: MbtiExperiencePatchInput) {
      assertOwner(ownerUserId, authenticatedOwnerUserId)
      const patch: Record<string, unknown> = {}
      if (input.selfMbtiSnapshot !== undefined) patch.self_mbti_snapshot = input.selfMbtiSnapshot
      if (input.confirmSelfSnapshotChange !== undefined) patch.confirm_self_snapshot_change = input.confirmSelfSnapshotChange
      if (input.reportedCount !== undefined) patch.reported_count = input.reportedCount
      if (input.partnerGender !== undefined) patch.partner_gender = input.partnerGender
      if (input.relationshipStatus !== undefined) patch.relationship_status = input.relationshipStatus
      if (input.score !== undefined) patch.score = input.score
      if (input.matchedAspects !== undefined) patch.matched_aspects = input.matchedAspects
      return mapMbtiMutationResult(await callRpc(client, 'community_mbti_update_experience', {
        p_experience_id: experienceId,
        p_expected_revision: input.expectedRevision,
        p_patch: patch,
        p_client_mutation_id: input.clientMutationId,
      }))
    },
    async deleteExperience(ownerUserId: string, experienceId: string, input: MbtiMutationInput) {
      assertOwner(ownerUserId, authenticatedOwnerUserId)
      return mapMbtiMutationResult(await callRpc(client, 'community_mbti_delete_experience', {
        p_experience_id: experienceId,
        p_expected_revision: input.expectedRevision,
        p_client_mutation_id: input.clientMutationId,
      }))
    },
    async expandExperience(ownerUserId: string, experienceId: string, input: MbtiMutationInput) {
      assertOwner(ownerUserId, authenticatedOwnerUserId)
      return mapMbtiMutationResult(await callRpc(client, 'community_mbti_expand_experience', {
        p_experience_id: experienceId,
        p_expected_revision: input.expectedRevision,
        p_client_mutation_id: input.clientMutationId,
      }))
    },
    async withdraw(ownerUserId: string, input: MbtiMutationInput) {
      assertOwner(ownerUserId, authenticatedOwnerUserId)
      return mapMbtiMutationResult(await callRpc(client, 'community_mbti_withdraw', {
        p_expected_revision: input.expectedRevision,
        p_client_mutation_id: input.clientMutationId,
      }))
    },
    async getMeetingStatsConsent(ownerUserId: string) {
      assertOwner(ownerUserId, authenticatedOwnerUserId)
      const value = await callRpc(client, 'community_mbti_get_meeting_stats_consent')
      return value === null ? null : mapMbtiMeetingConsentRow(value)
    },
    async putMeetingStatsConsent(ownerUserId: string, input: MbtiMeetingStatsConsentInput) {
      assertOwner(ownerUserId, authenticatedOwnerUserId)
      return mapMbtiMutationResult(await callRpc(client, 'community_mbti_put_meeting_stats_consent', {
        p_self_mbti: input.selfMbti,
        p_self_gender: input.selfGender,
        p_consent_version: input.consentVersion,
        p_expected_revision: input.expectedRevision,
        p_client_mutation_id: input.clientMutationId,
      }))
    },
    async withdrawMeetingStatsConsent(ownerUserId: string, input: MbtiMutationInput) {
      assertOwner(ownerUserId, authenticatedOwnerUserId)
      return mapMbtiMutationResult(await callRpc(client, 'community_mbti_withdraw_meeting_stats_consent', {
        p_expected_revision: input.expectedRevision,
        p_client_mutation_id: input.clientMutationId,
      }))
    },
  }
}

export async function createAuthenticatedOwnerMbtiRepository(request: Request): Promise<OwnerMbtiRepository> {
  const client = createSupabaseRequestClient(request) as unknown as MbtiRpcClient
  let result: Awaited<ReturnType<MbtiRpcClient['auth']['getUser']>>
  try {
    result = await client.auth.getUser()
  } catch {
    throw new MbtiRepositoryError('service_unavailable')
  }
  if (!result.data.user) throw new MbtiRepositoryError('unauthenticated')
  if (result.error) throw new MbtiRepositoryError('service_unavailable')
  const ownerUserId = result.data.user.id
  return createOwnerMbtiRepository(ownerUserId, createRpcStore(client, ownerUserId))
}
