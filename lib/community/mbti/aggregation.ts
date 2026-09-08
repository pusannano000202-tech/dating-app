import type {
  CommunityMbtiGender,
  MatchedAspect,
  MbtiExperienceDto,
  MbtiParticipantDto,
  MbtiType,
  PartnerMbtiType,
  RelationshipStatus,
} from './types'

export interface SelfMbtiAggregateCell {
  selfMbti: MbtiType
  respondentCount: number
}

export interface ReportedCombinationCell {
  selfMbtiSnapshot: MbtiType
  partnerMbti: PartnerMbtiType
  selfGender: CommunityMbtiGender
  partnerGender: CommunityMbtiGender
  relationshipStatus: RelationshipStatus
  respondentCount: number
  experienceCount: number
}

export interface RatedCombinationCell {
  selfMbtiSnapshot: MbtiType
  partnerMbti: PartnerMbtiType
  selfGender: CommunityMbtiGender
  partnerGender: CommunityMbtiGender
  relationshipStatus: RelationshipStatus
  scoredRespondentCount: number
  scoredExperienceCount: number
  positiveRate: number
}

export interface MatchedAspectCell extends Omit<RatedCombinationCell, 'positiveRate'> {
  aspect: MatchedAspect
  selectionRate: number
}

export interface MbtiAggregate {
  generatedAt: string
  respondentCount: number
  experienceCount: number
  selfMbti: SelfMbtiAggregateCell[]
  reportedCombinations: ReportedCombinationCell[]
  ratedCombinations: RatedCombinationCell[]
  matchedAspects: MatchedAspectCell[]
}

interface CombinationAccumulator {
  dimensions: Omit<ReportedCombinationCell, 'respondentCount' | 'experienceCount'>
  owners: Set<string>
  experienceCount: number
  scoresByOwner: Map<string, { positive: number; scored: number }>
  aspectsByOwner: Map<string, { scored: number; selected: Map<MatchedAspect, number> }>
}

function isAfter(value: string, now: Date): boolean {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > now.getTime()
}

function combinationKey(
  participant: MbtiParticipantDto,
  experience: MbtiExperienceDto,
): string {
  return [
    experience.selfMbtiSnapshot,
    experience.partnerMbti,
    participant.selfGender,
    experience.partnerGender,
    experience.relationshipStatus,
  ].join('|')
}

export function aggregateSelfReported(
  participants: readonly MbtiParticipantDto[],
  experiences: readonly MbtiExperienceDto[],
  now = new Date(),
): MbtiAggregate {
  const activeParticipants = participants.filter((entry) => isAfter(entry.expiresAt, now))
  const participantsByOwner = new Map(activeParticipants.map((entry) => [entry.ownerUserId, entry]))
  const selfCounts = new Map<MbtiType, Set<string>>()
  for (const participant of activeParticipants) {
    const owners = selfCounts.get(participant.selfMbti) ?? new Set<string>()
    owners.add(participant.ownerUserId)
    selfCounts.set(participant.selfMbti, owners)
  }

  const combinations = new Map<string, CombinationAccumulator>()
  for (const experience of experiences) {
    const participant = participantsByOwner.get(experience.ownerUserId)
    if (!participant || !isAfter(experience.expiresAt, now)) continue
    const key = combinationKey(participant, experience)
    let accumulator = combinations.get(key)
    if (!accumulator) {
      accumulator = {
        dimensions: {
          selfMbtiSnapshot: experience.selfMbtiSnapshot,
          partnerMbti: experience.partnerMbti,
          selfGender: participant.selfGender,
          partnerGender: experience.partnerGender,
          relationshipStatus: experience.relationshipStatus,
        },
        owners: new Set<string>(),
        experienceCount: 0,
        scoresByOwner: new Map(),
        aspectsByOwner: new Map(),
      }
      combinations.set(key, accumulator)
    }
    accumulator.owners.add(experience.ownerUserId)
    accumulator.experienceCount += experience.reportedCount
    if (experience.entryMode !== 'detailed' || experience.score === null) continue

    const ownerScore = accumulator.scoresByOwner.get(experience.ownerUserId) ?? { positive: 0, scored: 0 }
    ownerScore.scored += 1
    if (experience.score >= 4) ownerScore.positive += 1
    accumulator.scoresByOwner.set(experience.ownerUserId, ownerScore)

    const ownerAspects = accumulator.aspectsByOwner.get(experience.ownerUserId) ?? {
      scored: 0,
      selected: new Map<MatchedAspect, number>(),
    }
    ownerAspects.scored += 1
    for (const aspect of experience.matchedAspects ?? []) {
      ownerAspects.selected.set(aspect, (ownerAspects.selected.get(aspect) ?? 0) + 1)
    }
    accumulator.aspectsByOwner.set(experience.ownerUserId, ownerAspects)
  }

  const sorted = [...combinations.entries()].sort(([a], [b]) => a.localeCompare(b))
  const reportedCombinations = sorted.map(([, value]) => ({
    ...value.dimensions,
    respondentCount: value.owners.size,
    experienceCount: value.experienceCount,
  }))
  const ratedCombinations = sorted.flatMap(([, value]) => {
    if (value.scoresByOwner.size === 0) return []
    const perOwner = [...value.scoresByOwner.values()].map((entry) => entry.positive / entry.scored)
    return [{
      ...value.dimensions,
      scoredRespondentCount: value.scoresByOwner.size,
      scoredExperienceCount: [...value.scoresByOwner.values()].reduce((sum, entry) => sum + entry.scored, 0),
      positiveRate: perOwner.reduce((sum, entry) => sum + entry, 0) / perOwner.length,
    }]
  })
  const matchedAspects = sorted.flatMap(([, value]) => {
    const aspects = new Set<MatchedAspect>()
    for (const entry of value.aspectsByOwner.values()) {
      for (const aspect of entry.selected.keys()) aspects.add(aspect)
    }
    return [...aspects].sort().map((aspect) => {
      const perOwner = [...value.aspectsByOwner.values()].map((entry) => (entry.selected.get(aspect) ?? 0) / entry.scored)
      return {
        ...value.dimensions,
        aspect,
        scoredRespondentCount: value.aspectsByOwner.size,
        scoredExperienceCount: [...value.aspectsByOwner.values()].reduce((sum, entry) => sum + entry.scored, 0),
        selectionRate: perOwner.reduce((sum, entry) => sum + entry, 0) / perOwner.length,
      }
    })
  })

  return {
    generatedAt: now.toISOString(),
    respondentCount: activeParticipants.length,
    experienceCount: reportedCombinations.reduce((sum, entry) => sum + entry.experienceCount, 0),
    selfMbti: [...selfCounts.entries()]
      .map(([selfMbti, owners]) => ({ selfMbti, respondentCount: owners.size }))
      .sort((a, b) => a.selfMbti.localeCompare(b.selfMbti)),
    reportedCombinations,
    ratedCombinations,
    matchedAspects,
  }
}
