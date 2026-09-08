import type {
  MbtiExperienceCreateInput,
  MbtiExperienceDto,
  MbtiExperiencePatchInput,
  MbtiMeetingStatsConsentDto,
  MbtiMeetingStatsConsentInput,
  MbtiMutationInput,
  MbtiMutationResultDto,
  MbtiOwnerStateDto,
  MbtiParticipantDto,
  MbtiParticipantInput,
} from './types'

export type MbtiRepositoryErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'service_unavailable'
  | 'invalid_response'
  | 'invalid_request'
  | 'not_found'
  | 'stale_revision'
  | 'idempotency_conflict'
  | 'idempotency_result_unavailable'
  | 'not_implemented'

export class MbtiRepositoryError extends Error {
  readonly code: MbtiRepositoryErrorCode

  constructor(code: MbtiRepositoryErrorCode) {
    super(code)
    this.name = 'MbtiRepositoryError'
    this.code = code
  }
}

export interface MbtiStatePageInput {
  limit?: number
  cursor?: string | null
}

export interface MbtiStore {
  getState(ownerUserId: string, page?: MbtiStatePageInput): Promise<MbtiOwnerStateDto>
  upsertParticipant(ownerUserId: string, input: MbtiParticipantInput): Promise<MbtiMutationResultDto>
  createExperience(ownerUserId: string, input: MbtiExperienceCreateInput): Promise<MbtiMutationResultDto>
  updateExperience(ownerUserId: string, experienceId: string, input: MbtiExperiencePatchInput): Promise<MbtiMutationResultDto>
  deleteExperience(ownerUserId: string, experienceId: string, input: MbtiMutationInput): Promise<MbtiMutationResultDto>
  expandExperience(ownerUserId: string, experienceId: string, input: MbtiMutationInput): Promise<MbtiMutationResultDto>
  withdraw(ownerUserId: string, input: MbtiMutationInput): Promise<MbtiMutationResultDto>
  getMeetingStatsConsent(ownerUserId: string): Promise<MbtiMeetingStatsConsentDto | null>
  putMeetingStatsConsent(ownerUserId: string, input: MbtiMeetingStatsConsentInput): Promise<MbtiMutationResultDto>
  withdrawMeetingStatsConsent(ownerUserId: string, input: MbtiMutationInput): Promise<MbtiMutationResultDto>
}

export interface OwnerMbtiRepository {
  getState(page?: MbtiStatePageInput): Promise<MbtiOwnerStateDto>
  upsertParticipant(input: MbtiParticipantInput): Promise<MbtiMutationResultDto>
  createExperience(input: MbtiExperienceCreateInput): Promise<MbtiMutationResultDto>
  updateExperience(experienceId: string, input: MbtiExperiencePatchInput): Promise<MbtiMutationResultDto>
  deleteExperience(experienceId: string, input: MbtiMutationInput): Promise<MbtiMutationResultDto>
  expandExperience(experienceId: string, input: MbtiMutationInput): Promise<MbtiMutationResultDto>
  withdraw(input: MbtiMutationInput): Promise<MbtiMutationResultDto>
  getMeetingStatsConsent(): Promise<MbtiMeetingStatsConsentDto | null>
  putMeetingStatsConsent(input: MbtiMeetingStatsConsentInput): Promise<MbtiMutationResultDto>
  withdrawMeetingStatsConsent(input: MbtiMutationInput): Promise<MbtiMutationResultDto>
}

export function createOwnerMbtiRepository(
  authenticatedOwnerUserId: string,
  store: MbtiStore,
): OwnerMbtiRepository {
  if (!authenticatedOwnerUserId) throw new MbtiRepositoryError('unauthenticated')
  return Object.freeze({
    getState: (page?: MbtiStatePageInput) => store.getState(authenticatedOwnerUserId, page),
    upsertParticipant: (input: MbtiParticipantInput) => store.upsertParticipant(authenticatedOwnerUserId, input),
    createExperience: (input: MbtiExperienceCreateInput) => store.createExperience(authenticatedOwnerUserId, input),
    updateExperience: (experienceId: string, input: MbtiExperiencePatchInput) => store.updateExperience(authenticatedOwnerUserId, experienceId, input),
    deleteExperience: (experienceId: string, input: MbtiMutationInput) => store.deleteExperience(authenticatedOwnerUserId, experienceId, input),
    expandExperience: (experienceId: string, input: MbtiMutationInput) => store.expandExperience(authenticatedOwnerUserId, experienceId, input),
    withdraw: (input: MbtiMutationInput) => store.withdraw(authenticatedOwnerUserId, input),
    getMeetingStatsConsent: () => store.getMeetingStatsConsent(authenticatedOwnerUserId),
    putMeetingStatsConsent: (input: MbtiMeetingStatsConsentInput) => store.putMeetingStatsConsent(authenticatedOwnerUserId, input),
    withdrawMeetingStatsConsent: (input: MbtiMutationInput) => store.withdrawMeetingStatsConsent(authenticatedOwnerUserId, input),
  })
}
