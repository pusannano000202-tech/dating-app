import {
  PARTNER_MBTI_TYPES,
  type CommunityMbtiGender,
  type MatchedAspect,
  type MbtiExperienceCreateInput,
  type MbtiScore,
  type MbtiType,
  type PartnerMbtiType,
  type RelationshipStatus,
} from './types'

export const MAX_COUNT_ONLY_EXPERIENCES_PER_SUBMISSION = 100

export interface MbtiExperienceDraft {
  draftId: string
  partnerMbti: PartnerMbtiType
  ordinal: number
  partnerGender: CommunityMbtiGender
  relationshipStatus: RelationshipStatus
  evaluateIndividually: boolean
  score: MbtiScore | null
  matchedAspects: MatchedAspect[]
}

export type MbtiCountDraft = Partial<Record<PartnerMbtiType, number>>

export function expandCountDraft(
  counts: MbtiCountDraft,
  priorDrafts: readonly MbtiExperienceDraft[] = [],
): MbtiExperienceDraft[] {
  const result: MbtiExperienceDraft[] = []
  const priorByDraftId = new Map(priorDrafts.map((draft) => [draft.draftId, draft]))
  for (const partnerMbti of PARTNER_MBTI_TYPES) {
    const count = counts[partnerMbti] ?? 0
    if (!Number.isInteger(count) || count < 0) throw new TypeError('invalid_mbti_count')
    for (let ordinal = 1; ordinal <= count; ordinal += 1) {
      const draftId = `${partnerMbti}-${ordinal}`
      const prior = priorByDraftId.get(draftId)
      result.push(prior ? {
        ...prior,
        draftId,
        partnerMbti,
        ordinal,
        matchedAspects: [...prior.matchedAspects],
      } : {
        draftId,
        partnerMbti,
        ordinal,
        partnerGender: 'unknown',
        relationshipStatus: 'past',
        evaluateIndividually: false,
        score: null,
        matchedAspects: [],
      })
    }
  }
  return result
}

export function buildExperienceSubmissions(
  drafts: readonly MbtiExperienceDraft[],
  selfMbtiSnapshot: MbtiType,
  mutationId: (index: number) => string,
): MbtiExperienceCreateInput[] {
  const result: MbtiExperienceCreateInput[] = []
  const grouped = new Map<string, { draft: MbtiExperienceDraft; count: number }>()
  for (const draft of drafts) {
    if (draft.evaluateIndividually) {
      result.push({
        selfMbtiSnapshot,
        partnerMbti: draft.partnerMbti,
        partnerGender: draft.partnerGender,
        relationshipStatus: draft.relationshipStatus,
        entryMode: 'detailed',
        reportedCount: 1,
        score: draft.score,
        matchedAspects: draft.matchedAspects.length > 0 ? [...new Set(draft.matchedAspects)] : null,
        clientMutationId: '',
      })
      continue
    }
    const key = [draft.partnerMbti, draft.partnerGender, draft.relationshipStatus].join('|')
    const current = grouped.get(key)
    if (current) current.count += 1
    else grouped.set(key, { draft, count: 1 })
  }
  for (const { draft, count } of grouped.values()) {
    for (let remaining = count; remaining > 0; remaining -= MAX_COUNT_ONLY_EXPERIENCES_PER_SUBMISSION) {
      result.push({
        selfMbtiSnapshot,
        partnerMbti: draft.partnerMbti,
        partnerGender: draft.partnerGender,
        relationshipStatus: draft.relationshipStatus,
        entryMode: 'count_only',
        reportedCount: Math.min(remaining, MAX_COUNT_ONLY_EXPERIENCES_PER_SUBMISSION),
        score: null,
        matchedAspects: null,
        clientMutationId: '',
      })
    }
  }
  return result.map((entry, index) => ({ ...entry, clientMutationId: mutationId(index) }))
}
