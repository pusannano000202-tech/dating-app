import type {
  MatchedAspectCell,
  MbtiAggregate,
  RatedCombinationCell,
  ReportedCombinationCell,
  SelfMbtiAggregateCell,
} from './aggregation'

const DAY_MS = 24 * 60 * 60 * 1000

export const COMMUNITY_MBTI_PUBLIC_POLICY = {
  version: 'community_mbti_public_v1',
  minimumUniqueRespondents: 10,
  minimumRankedRespondents: 30,
  maximumSnapshotAgeMs: DAY_MS,
  differenceThreshold: 10,
} as const

export interface MbtiPublicAggregate {
  policyVersion: typeof COMMUNITY_MBTI_PUBLIC_POLICY.version
  generatedAt: string
  status: 'published' | 'insufficient_sample' | 'suppressed'
  respondentCount: number | null
  experienceCount: number | null
  selfMbti: SelfMbtiAggregateCell[]
  reportedCombinations: ReportedCombinationCell[]
  ratedCombinations: RatedCombinationCell[]
  matchedAspects: MatchedAspectCell[]
  limitations: string[]
}

export function participantExpiresAt(consentConfirmedAt: string): string {
  const timestamp = Date.parse(consentConfirmedAt)
  if (!Number.isFinite(timestamp)) throw new TypeError('invalid_consent_confirmed_at')
  return new Date(timestamp + 90 * DAY_MS).toISOString()
}

export function experienceExpiresAt(updatedAt: string, participantExpiry: string): string {
  const updatedTimestamp = Date.parse(updatedAt)
  const participantTimestamp = Date.parse(participantExpiry)
  if (!Number.isFinite(updatedTimestamp) || !Number.isFinite(participantTimestamp)) {
    throw new TypeError('invalid_expiry_source')
  }
  return new Date(Math.min(updatedTimestamp + 90 * DAY_MS, participantTimestamp)).toISOString()
}

export function isFreshPublicSnapshot(generatedAt: string, now = new Date()): boolean {
  const timestamp = Date.parse(generatedAt)
  return Number.isFinite(timestamp)
    && timestamp <= now.getTime()
    && now.getTime() - timestamp < COMMUNITY_MBTI_PUBLIC_POLICY.maximumSnapshotAgeMs
}

function selfKey(value: SelfMbtiAggregateCell): string {
  return value.selfMbti
}

function combinationKey(value: ReportedCombinationCell | RatedCombinationCell | MatchedAspectCell): string {
  return [
    value.selfMbtiSnapshot,
    value.partnerMbti,
    value.selfGender,
    value.partnerGender,
    value.relationshipStatus,
    'aspect' in value ? value.aspect : '',
  ].join('|')
}

interface ReleaseProbe {
  count: number
  fingerprint: string
}

function releaseProbes<T>(
  entries: readonly T[],
  key: (entry: T) => string,
  count: (entry: T) => number,
): Map<string, ReleaseProbe> {
  return new Map(entries.map((entry) => [key(entry), {
    count: count(entry),
    fingerprint: JSON.stringify(entry),
  }]))
}

function differenceSafe<T>(
  key: string,
  current: T,
  currentCount: number,
  previous: ReadonlyMap<string, ReleaseProbe> | null,
  threshold: number,
): boolean {
  const prior = previous?.get(key)
  if (!prior) return true
  return prior.fingerprint === JSON.stringify(current)
    || Math.abs(currentCount - prior.count) >= threshold
}

function hasUnsafePreviousTransition(
  previous: ReadonlyMap<string, ReleaseProbe> | null,
  current: ReadonlyMap<string, ReleaseProbe>,
  threshold: number,
): boolean {
  if (!previous) return false
  for (const [key, prior] of previous) {
    const next = current.get(key)
    if (!next) {
      if (prior.count < threshold) return true
      continue
    }
    if (prior.fingerprint !== next.fingerprint && Math.abs(next.count - prior.count) < threshold) {
      return true
    }
  }
  return false
}

export function protectSelfReportedAggregate(
  raw: MbtiAggregate,
  previous: MbtiPublicAggregate | null,
  policy = COMMUNITY_MBTI_PUBLIC_POLICY,
): MbtiPublicAggregate {
  const previousSelf = previous
    ? releaseProbes(previous.selfMbti, selfKey, (entry) => entry.respondentCount)
    : null
  const previousReported = previous
    ? releaseProbes(previous.reportedCombinations, combinationKey, (entry) => entry.respondentCount)
    : null
  const previousRated = previous
    ? releaseProbes(previous.ratedCombinations, combinationKey, (entry) => entry.scoredRespondentCount)
    : null
  const previousAspects = previous
    ? releaseProbes(previous.matchedAspects, combinationKey, (entry) => entry.scoredRespondentCount)
    : null
  const currentSelf = releaseProbes(raw.selfMbti, selfKey, (entry) => entry.respondentCount)
  const currentReported = releaseProbes(raw.reportedCombinations, combinationKey, (entry) => entry.respondentCount)
  const currentRated = releaseProbes(raw.ratedCombinations, combinationKey, (entry) => entry.scoredRespondentCount)
  const currentAspects = releaseProbes(raw.matchedAspects, combinationKey, (entry) => entry.scoredRespondentCount)

  const cellSafe = (cellCount: number) => cellCount >= policy.minimumUniqueRespondents
    && raw.respondentCount - cellCount >= policy.minimumUniqueRespondents

  const safeSelfMbti = raw.selfMbti.filter((entry) => cellSafe(entry.respondentCount)
    && differenceSafe(selfKey(entry), entry, entry.respondentCount, previousSelf, policy.differenceThreshold))
  const safeReportedCombinations = raw.reportedCombinations.filter((entry) => cellSafe(entry.respondentCount)
    && differenceSafe(combinationKey(entry), entry, entry.respondentCount, previousReported, policy.differenceThreshold))
  const rankedSafe = (count: number) => count >= policy.minimumRankedRespondents
    && raw.respondentCount - count >= policy.minimumUniqueRespondents
  const safeRatedCombinations = raw.ratedCombinations.filter((entry) => rankedSafe(entry.scoredRespondentCount)
    && differenceSafe(combinationKey(entry), entry, entry.scoredRespondentCount, previousRated, policy.differenceThreshold))
  const safeMatchedAspects = raw.matchedAspects.filter((entry) => rankedSafe(entry.scoredRespondentCount)
    && differenceSafe(combinationKey(entry), entry, entry.scoredRespondentCount, previousAspects, policy.differenceThreshold))

  const totalChangedUnsafely = previous !== null
    && previous.respondentCount !== null
    && previous.experienceCount !== null
    && (previous.respondentCount !== raw.respondentCount || previous.experienceCount !== raw.experienceCount)
    && Math.abs(raw.respondentCount - previous.respondentCount) < policy.differenceThreshold
  const suppressRelease = totalChangedUnsafely
    || hasUnsafePreviousTransition(previousSelf, currentSelf, policy.differenceThreshold)
    || hasUnsafePreviousTransition(previousReported, currentReported, policy.differenceThreshold)
    || hasUnsafePreviousTransition(previousRated, currentRated, policy.differenceThreshold)
    || hasUnsafePreviousTransition(previousAspects, currentAspects, policy.differenceThreshold)
  const selfMbti = suppressRelease ? [] : safeSelfMbti
  const reportedCombinations = suppressRelease ? [] : safeReportedCombinations
  const ratedCombinations = suppressRelease ? [] : safeRatedCombinations
  const matchedAspects = suppressRelease ? [] : safeMatchedAspects

  const hasSafeCell = selfMbti.length + reportedCombinations.length + ratedCombinations.length + matchedAspects.length > 0
  const rawHadThresholdCell = raw.selfMbti.some((entry) => cellSafe(entry.respondentCount))
    || raw.reportedCombinations.some((entry) => cellSafe(entry.respondentCount))
    || raw.ratedCombinations.some((entry) => rankedSafe(entry.scoredRespondentCount))
  const status = suppressRelease
    ? 'suppressed'
    : hasSafeCell
    ? 'published'
    : rawHadThresholdCell && previous
      ? 'suppressed'
      : 'insufficient_sample'
  const exactTotalSafe = !suppressRelease
    && raw.respondentCount >= policy.minimumUniqueRespondents * 2
    && (!previous
      || (previous.respondentCount === raw.respondentCount && previous.experienceCount === raw.experienceCount)
      || Math.abs(raw.respondentCount - (previous.respondentCount ?? 0)) >= policy.differenceThreshold)

  return {
    policyVersion: COMMUNITY_MBTI_PUBLIC_POLICY.version,
    generatedAt: raw.generatedAt,
    status,
    respondentCount: exactTotalSafe ? raw.respondentCount : null,
    experienceCount: exactTotalSafe ? raw.experienceCount : null,
    selfMbti,
    reportedCombinations,
    ratedCombinations,
    matchedAspects,
    limitations: [
      '선택 참여한 자기보고 응답이며 실제 커플 수가 아니에요.',
      '적은 표본과 직전 공개값으로 역산될 수 있는 조합은 숨겨요.',
      '궁합이나 미래 관계 성공을 예측하지 않아요.',
    ],
  }
}
