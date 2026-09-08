export const MBTI_TYPES = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
  'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP',
  'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
] as const

export type MbtiType = (typeof MBTI_TYPES)[number]
export const PARTNER_MBTI_TYPES = [...MBTI_TYPES, 'UNKNOWN'] as const
export type PartnerMbtiType = (typeof PARTNER_MBTI_TYPES)[number]

export const COMMUNITY_MBTI_GENDERS = [
  'male',
  'female',
  'other_or_undisclosed',
  'unknown',
] as const

export type CommunityMbtiGender = (typeof COMMUNITY_MBTI_GENDERS)[number]

export const RELATIONSHIP_STATUSES = ['past', 'current'] as const
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number]

export const MATCHED_ASPECTS = [
  'conversation',
  'contact',
  'conflict',
  'lifestyle',
  'values',
] as const

export type MatchedAspect = (typeof MATCHED_ASPECTS)[number]
export type MbtiScore = 1 | 2 | 3 | 4 | 5

export const COMMUNITY_MBTI_CONSENT_VERSION = 'community_mbti_v1' as const
export const COMMUNITY_MBTI_MEETING_STATS_CONSENT_VERSION = 'community_mbti_meeting_stats_v1' as const

export interface MbtiParticipantDto {
  ownerUserId: string
  selfMbti: MbtiType
  selfGender: CommunityMbtiGender
  consentVersion: typeof COMMUNITY_MBTI_CONSENT_VERSION
  consentConfirmedAt: string
  revision: number
  expiresAt: string
}

interface MbtiExperienceBaseDto {
  experienceId: string
  ownerUserId: string
  selfMbtiSnapshot: MbtiType
  partnerMbti: PartnerMbtiType
  partnerGender: CommunityMbtiGender
  relationshipStatus: RelationshipStatus
  revision: number
  updatedAt: string
  expiresAt: string
}

export interface CountOnlyMbtiExperienceDto extends MbtiExperienceBaseDto {
  entryMode: 'count_only'
  reportedCount: number
  score: null
  matchedAspects: null
}

export interface DetailedMbtiExperienceDto extends MbtiExperienceBaseDto {
  entryMode: 'detailed'
  reportedCount: 1
  score: MbtiScore | null
  matchedAspects: MatchedAspect[] | null
}

export type MbtiExperienceDto = CountOnlyMbtiExperienceDto | DetailedMbtiExperienceDto

export interface MbtiMeetingStatsConsentDto {
  ownerUserId: string
  selfMbti: MbtiType
  selfGender: CommunityMbtiGender
  consentVersion: typeof COMMUNITY_MBTI_MEETING_STATS_CONSENT_VERSION
  consentConfirmedAt: string
  expiresAt: string
  revision: number
}

export interface MbtiOwnerStateDto {
  participant: MbtiParticipantDto | null
  experiences: MbtiExperienceDto[]
  nextCursor: string | null
  meetingStatsConsent: MbtiMeetingStatsConsentDto | null
}

export interface MbtiParticipantInput {
  selfMbti: MbtiType
  selfGender: CommunityMbtiGender
  consent: true
  consentVersion: typeof COMMUNITY_MBTI_CONSENT_VERSION
  expectedRevision: number
  clientMutationId: string
}

export interface MbtiExperienceCreateInput {
  selfMbtiSnapshot: MbtiType
  partnerMbti: PartnerMbtiType
  partnerGender: CommunityMbtiGender
  relationshipStatus: RelationshipStatus
  entryMode: 'count_only' | 'detailed'
  reportedCount: number
  score: MbtiScore | null
  matchedAspects: MatchedAspect[] | null
  clientMutationId: string
}

export interface MbtiExperiencePatchInput {
  expectedRevision: number
  clientMutationId: string
  selfMbtiSnapshot?: MbtiType
  confirmSelfSnapshotChange?: true
  reportedCount?: number
  partnerGender?: CommunityMbtiGender
  relationshipStatus?: RelationshipStatus
  score?: MbtiScore | null
  matchedAspects?: MatchedAspect[] | null
}

export interface MbtiMutationInput {
  expectedRevision: number
  clientMutationId: string
}

export interface MbtiMeetingStatsConsentInput {
  selfMbti: MbtiType
  selfGender: CommunityMbtiGender
  consent: true
  consentVersion: typeof COMMUNITY_MBTI_MEETING_STATS_CONSENT_VERSION
  expectedRevision: number
  clientMutationId: string
}

export interface MbtiMutationResultDto {
  status: 'saved' | 'deleted' | 'expanded' | 'withdrawn'
  resourceId: string | null
  resourceIds: string[]
  revision: number
}
