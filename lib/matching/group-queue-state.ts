export type MatchPoolStatus = 'waiting' | 'rolled_over' | 'cancelled'
export type GroupQueueState = 'inactive' | 'active' | 'matched'

export function isGroupQueueActive(status: MatchPoolStatus | string | null | undefined): boolean {
  return status === 'waiting' || status === 'rolled_over'
}

export function getGroupQueueState(
  groupStatus: string | null | undefined,
  matchPoolStatus: MatchPoolStatus | string | null | undefined,
): GroupQueueState {
  if (groupStatus === 'matched') return 'matched'
  return isGroupQueueActive(matchPoolStatus) ? 'active' : 'inactive'
}
