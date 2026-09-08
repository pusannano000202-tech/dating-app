export const CHALLENGE_CATEGORIES = ['soccer', 'gaming'] as const

export type DepartmentChallengeCategory = (typeof CHALLENGE_CATEGORIES)[number]
export type DepartmentChallengeStatus =
  | 'recruiting'
  | 'opponent_pending'
  | 'scheduled'
  | 'result_pending'
  | 'completed'
  | 'cancelled'

export type ChallengeRosterRejectReason =
  | 'wrong_school'
  | 'department_identity_required'
  | 'department_restricted'
  | 'team_full'
  | 'already_on_other_team'
  | 'challenge_closed'

export type ChallengeFriendInviteRejectReason =
  | 'captain_required'
  | 'active_friendship_required'
  | 'wrong_school'
  | 'department_identity_required'
  | 'department_restricted'
  | 'already_on_team'
  | 'team_full'
  | 'challenge_closed'

export type ChallengeCaptainResult = Readonly<{
  teamId: string
  ownScore: number
  opponentScore: number
}>

export type DepartmentChallengeInviteState = Readonly<{
  challenge_id: string
  revision: number
  candidates: ReadonlyArray<Readonly<{ user_id: string; display_name: string }>>
  sent: ReadonlyArray<Readonly<{
    invite_id: string
    user_id: string
    display_name: string
    status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'
    expires_at: string
  }>>
  incoming: ReadonlyArray<Readonly<{
    invite_id: string
    team_id: string
    display_name: string
    status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'
    expires_at: string
  }>>
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INVITE_STATUSES = new Set(['pending', 'accepted', 'declined', 'cancelled', 'expired'])

export function isDepartmentChallengeCategory(value: unknown): value is DepartmentChallengeCategory {
  return typeof value === 'string' && (CHALLENGE_CATEGORIES as readonly string[]).includes(value)
}

export function parseDepartmentChallengeInviteState(value: unknown): DepartmentChallengeInviteState | null {
  if (!exactRecord(value, ['challenge_id', 'revision', 'candidates', 'sent', 'incoming'])
      || !validUuid(value.challenge_id)
      || !Number.isInteger(value.revision) || (value.revision as number) < 0
      || !Array.isArray(value.candidates) || value.candidates.length > 100
      || !Array.isArray(value.sent) || value.sent.length > 100
      || !Array.isArray(value.incoming) || value.incoming.length > 20) return null
  if (!value.candidates.every((row) => exactRecord(row, ['user_id', 'display_name'])
      && validUuid(row.user_id) && validLabel(row.display_name))) return null
  if (!value.sent.every((row) => exactRecord(row, ['invite_id', 'user_id', 'display_name', 'status', 'expires_at'])
      && validUuid(row.invite_id) && validUuid(row.user_id) && validLabel(row.display_name)
      && INVITE_STATUSES.has(row.status as string) && validTimestamp(row.expires_at))) return null
  if (!value.incoming.every((row) => exactRecord(row, ['invite_id', 'team_id', 'display_name', 'status', 'expires_at'])
      && validUuid(row.invite_id) && validUuid(row.team_id) && validLabel(row.display_name)
      && INVITE_STATUSES.has(row.status as string) && validTimestamp(row.expires_at))) return null
  return value as DepartmentChallengeInviteState
}

export function assessChallengeRosterAcceptance({
  sameSchool,
  challengeStatus,
  actorDepartmentKey,
  teamDepartmentKey,
  targetTeamId,
  acceptedTeamId,
  acceptedCount,
  capacity,
}: {
  sameSchool: boolean
  challengeStatus: DepartmentChallengeStatus
  actorDepartmentKey: string | null
  teamDepartmentKey: string | null
  targetTeamId: string
  acceptedTeamId: string | null
  acceptedCount: number
  capacity: number
}): { ok: true } | { ok: false; reason: ChallengeRosterRejectReason } {
  if (!sameSchool) return { ok: false, reason: 'wrong_school' }
  if (!actorDepartmentKey || !teamDepartmentKey) return { ok: false, reason: 'department_identity_required' }
  if (actorDepartmentKey !== teamDepartmentKey) return { ok: false, reason: 'department_restricted' }
  if (!['recruiting', 'opponent_pending', 'scheduled'].includes(challengeStatus)) {
    return { ok: false, reason: 'challenge_closed' }
  }
  if (acceptedTeamId && acceptedTeamId !== targetTeamId) return { ok: false, reason: 'already_on_other_team' }
  if (acceptedCount >= capacity) return { ok: false, reason: 'team_full' }
  return { ok: true }
}

export function assessDepartmentChallengeFriendInvite({
  inviterIsCaptain,
  activeFriendship,
  sameSchool,
  challengeStatus,
  friendDepartmentKey,
  teamDepartmentKey,
  alreadyOnTeam,
  acceptedCount,
  capacity,
}: {
  inviterIsCaptain: boolean
  activeFriendship: boolean
  sameSchool: boolean
  challengeStatus: DepartmentChallengeStatus
  friendDepartmentKey: string | null
  teamDepartmentKey: string | null
  alreadyOnTeam: boolean
  acceptedCount: number
  capacity: number
}): { ok: true } | { ok: false; reason: ChallengeFriendInviteRejectReason } {
  if (!inviterIsCaptain) return { ok: false, reason: 'captain_required' }
  if (!activeFriendship) return { ok: false, reason: 'active_friendship_required' }
  if (!sameSchool) return { ok: false, reason: 'wrong_school' }
  if (!friendDepartmentKey || !teamDepartmentKey) return { ok: false, reason: 'department_identity_required' }
  if (friendDepartmentKey !== teamDepartmentKey) return { ok: false, reason: 'department_restricted' }
  if (!['recruiting', 'opponent_pending', 'scheduled'].includes(challengeStatus)) return { ok: false, reason: 'challenge_closed' }
  if (alreadyOnTeam) return { ok: false, reason: 'already_on_team' }
  if (acceptedCount >= capacity) return { ok: false, reason: 'team_full' }
  return { ok: true }
}

export function resolveBilateralChallengeResult(
  first: ChallengeCaptainResult | null,
  second: ChallengeCaptainResult | null,
):
  | { status: 'pending'; result: null }
  | { status: 'conflict'; result: null }
  | {
      status: 'confirmed'
      result: { firstTeamId: string; secondTeamId: string; firstScore: number; secondScore: number }
    } {
  if (!first || !second) return { status: 'pending', result: null }
  if (!isValidResult(first) || !isValidResult(second) || first.teamId === second.teamId) {
    return { status: 'conflict', result: null }
  }
  if (first.ownScore !== second.opponentScore || first.opponentScore !== second.ownScore) {
    return { status: 'conflict', result: null }
  }
  return {
    status: 'confirmed',
    result: {
      firstTeamId: first.teamId,
      secondTeamId: second.teamId,
      firstScore: first.ownScore,
      secondScore: first.opponentScore,
    },
  }
}

function isValidResult(result: ChallengeCaptainResult) {
  return Boolean(result.teamId)
    && Number.isSafeInteger(result.ownScore)
    && Number.isSafeInteger(result.opponentScore)
    && result.ownScore >= 0
    && result.opponentScore >= 0
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function validLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 120
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}
