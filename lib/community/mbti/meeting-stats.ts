import type { CommunityMbtiGender, MbtiType } from './types'

export interface AuthoritativeAttendanceInput {
  occurrenceId: string
  ownerUserId: string
  authoritative: boolean
  attended: boolean
}

export interface MeetingStatsConsentInput {
  ownerUserId: string
  selfMbti: MbtiType
  selfGender: CommunityMbtiGender
  expiresAt: string
  withdrawnAt: string | null
}

export interface MeetingStatsCell {
  firstMbti: MbtiType
  firstGender: 'female'
  secondMbti: MbtiType
  secondGender: 'male'
  occurrenceCount: number
  uniqueConsentingParticipantCount: number
}

export interface MeetingStatsAggregate {
  source: 'authoritative_attendance'
  generatedAt: string
  eligibleOccurrenceCount: number
  uniqueConsentingParticipantCount: number
  cells: MeetingStatsCell[]
}

export interface PublicMeetingStatsAggregate {
  source: 'authoritative_attendance'
  label: '같은 회차에서 만난 조합'
  generatedAt: string
  status: 'published' | 'insufficient_sample' | 'suppressed'
  eligibleOccurrenceCount: number | null
  uniqueConsentingParticipantCount: number | null
  cells: MeetingStatsCell[]
  limitations: string[]
}

export interface MeetingStatsPublicPolicy {
  minimumUniqueParticipants: number
  minimumOccurrences: number
  differenceThreshold: number
}

export const MEETING_STATS_PUBLIC_POLICY: MeetingStatsPublicPolicy = {
  minimumUniqueParticipants: 10,
  minimumOccurrences: 10,
  differenceThreshold: 10,
}

function isActive(consent: MeetingStatsConsentInput, now: Date): boolean {
  const expiry = Date.parse(consent.expiresAt)
  return consent.withdrawnAt === null && Number.isFinite(expiry) && expiry > now.getTime()
}

export function aggregateMeetingStats(input: {
  attendances: readonly AuthoritativeAttendanceInput[]
  consents: readonly MeetingStatsConsentInput[]
  now?: Date
}): MeetingStatsAggregate {
  const now = input.now ?? new Date()
  const consents = new Map(
    input.consents
      .filter((entry) => isActive(entry, now))
      .map((entry) => [entry.ownerUserId, entry]),
  )
  const byOccurrence = new Map<string, Set<string>>()
  for (const attendance of input.attendances) {
    if (!attendance.authoritative || !attendance.attended || !consents.has(attendance.ownerUserId)) continue
    const owners = byOccurrence.get(attendance.occurrenceId) ?? new Set<string>()
    owners.add(attendance.ownerUserId)
    byOccurrence.set(attendance.occurrenceId, owners)
  }

  const cells = new Map<string, { cell: MeetingStatsCell; occurrences: Set<string>; owners: Set<string> }>()
  const eligibleOccurrences = new Set<string>()
  const eligibleOwners = new Set<string>()
  for (const [occurrenceId, ownerSet] of byOccurrence) {
    const owners = [...ownerSet]
    for (let firstIndex = 0; firstIndex < owners.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < owners.length; secondIndex += 1) {
        const first = consents.get(owners[firstIndex])
        const second = consents.get(owners[secondIndex])
        if (!first || !second) continue
        const female = first.selfGender === 'female' ? first : second.selfGender === 'female' ? second : null
        const male = first.selfGender === 'male' ? first : second.selfGender === 'male' ? second : null
        if (!female || !male || female.ownerUserId === male.ownerUserId) continue
        eligibleOccurrences.add(occurrenceId)
        eligibleOwners.add(female.ownerUserId)
        eligibleOwners.add(male.ownerUserId)
        const key = `${female.selfMbti}|female|${male.selfMbti}|male`
        const current = cells.get(key) ?? {
          cell: {
            firstMbti: female.selfMbti,
            firstGender: 'female' as const,
            secondMbti: male.selfMbti,
            secondGender: 'male' as const,
            occurrenceCount: 0,
            uniqueConsentingParticipantCount: 0,
          },
          occurrences: new Set<string>(),
          owners: new Set<string>(),
        }
        current.occurrences.add(occurrenceId)
        current.owners.add(female.ownerUserId)
        current.owners.add(male.ownerUserId)
        cells.set(key, current)
      }
    }
  }

  return {
    source: 'authoritative_attendance',
    generatedAt: now.toISOString(),
    eligibleOccurrenceCount: eligibleOccurrences.size,
    uniqueConsentingParticipantCount: eligibleOwners.size,
    cells: [...cells.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, entry]) => ({
      ...entry.cell,
      occurrenceCount: entry.occurrences.size,
      uniqueConsentingParticipantCount: entry.owners.size,
    })),
  }
}


function cellKey(cell: MeetingStatsCell): string {
  return `${cell.firstMbti}|${cell.firstGender}|${cell.secondMbti}|${cell.secondGender}`
}

function changedBySafeAmount(current: number, previous: number, threshold: number): boolean {
  const difference = Math.abs(current - previous)
  return difference === 0 || difference >= threshold
}

function transitionIsSafe(
  current: MeetingStatsCell,
  previous: MeetingStatsCell,
  threshold: number,
): boolean {
  return changedBySafeAmount(current.occurrenceCount, previous.occurrenceCount, threshold)
    && changedBySafeAmount(
      current.uniqueConsentingParticipantCount,
      previous.uniqueConsentingParticipantCount,
      threshold,
    )
}

export function protectMeetingStatsAggregate(
  raw: MeetingStatsAggregate,
  previous: PublicMeetingStatsAggregate | null,
  policy: MeetingStatsPublicPolicy = MEETING_STATS_PUBLIC_POLICY,
): PublicMeetingStatsAggregate {
  const previousCells = new Map((previous?.cells ?? []).map((cell) => [cellKey(cell), cell]))
  const currentCells = new Map(raw.cells.map((cell) => [cellKey(cell), cell]))
  const cellMeetsThreshold = (cell: MeetingStatsCell) => (
    cell.occurrenceCount >= policy.minimumOccurrences
    && cell.uniqueConsentingParticipantCount >= policy.minimumUniqueParticipants
    && raw.eligibleOccurrenceCount - cell.occurrenceCount >= policy.minimumOccurrences
    && raw.uniqueConsentingParticipantCount - cell.uniqueConsentingParticipantCount
      >= policy.minimumUniqueParticipants
  )

  const totalTransitionSafe = !previous
    || previous.eligibleOccurrenceCount === null
    || previous.uniqueConsentingParticipantCount === null
    || (
      changedBySafeAmount(
        raw.eligibleOccurrenceCount,
        previous.eligibleOccurrenceCount,
        policy.differenceThreshold,
      )
      && changedBySafeAmount(
        raw.uniqueConsentingParticipantCount,
        previous.uniqueConsentingParticipantCount,
        policy.differenceThreshold,
      )
    )
  let cellTransitionsSafe = true
  for (const [key, prior] of previousCells) {
    const current = currentCells.get(key)
    if (!current) {
      if (prior.occurrenceCount < policy.differenceThreshold
        || prior.uniqueConsentingParticipantCount < policy.differenceThreshold) {
        cellTransitionsSafe = false
        break
      }
      continue
    }
    if (!transitionIsSafe(current, prior, policy.differenceThreshold)) {
      cellTransitionsSafe = false
      break
    }
  }

  const suppressRelease = !totalTransitionSafe || !cellTransitionsSafe
  const cells = suppressRelease
    ? []
    : raw.cells.filter((cell) => cellMeetsThreshold(cell)
      && (!previousCells.has(cellKey(cell))
        || transitionIsSafe(cell, previousCells.get(cellKey(cell))!, policy.differenceThreshold)))
  const status = suppressRelease
    ? 'suppressed'
    : cells.length > 0
      ? 'published'
      : 'insufficient_sample'

  return {
    source: 'authoritative_attendance',
    label: '같은 회차에서 만난 조합',
    generatedAt: raw.generatedAt,
    status,
    eligibleOccurrenceCount: status === 'published' ? raw.eligibleOccurrenceCount : null,
    uniqueConsentingParticipantCount: status === 'published'
      ? raw.uniqueConsentingParticipantCount
      : null,
    cells,
    limitations: [
      '같은 회차의 권위 있는 출석과 양쪽의 별도 동의를 집계해요.',
      '1:1 매칭이나 확인된 커플 수를 뜻하지 않아요.',
      '작은 표본과 직전 공개값으로 역산될 수 있는 조합은 숨겨요.',
    ],
  }
}
