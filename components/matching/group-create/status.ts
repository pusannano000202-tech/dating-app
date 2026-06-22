import type { FriendSummary, GroupRecord, GroupStatus, MatchStepState } from './types'

export type GroupExitActionKind =
  | 'member_can_leave'
  | 'leader_needs_transfer'
  | 'leader_can_disband'
  | 'locked'

export type GroupExitActionState = {
  kind: GroupExitActionKind
  title: string
  description: string
  primaryLabel: string
  helperText: string
}

export function getMemberStatusLabel(
  userId: string,
  memberMatchReadyByUserId: Map<string, boolean>,
) {
  return memberMatchReadyByUserId.get(userId) ? '준비 완료' : '준비 필요'
}

export function getQueueStatusText({
  group,
  membersLength,
  needsSetupCount,
}: {
  group: GroupRecord | null
  membersLength: number
  needsSetupCount: number
}) {
  if (!group) return '그룹 상태를 불러오지 못했어요.'
  const requiredMembers = group.size
  const missingMembers = Math.max(0, requiredMembers - membersLength)
  if (missingMembers > 0) {
    return `친구 ${missingMembers}명이 더 필요해요`
  }
  if (needsSetupCount > 0) return '멤버마다 성향/시간/비중/사전 카드 준비가 필요해요'
  return '매칭 큐 진입 준비 완료'
}

export function getFriendMatchState(
  friend: FriendSummary,
  memberMatchReadyByUserId: Map<string, boolean>,
): MatchStepState {
  if (friend.group_status === 'in_group') {
    return memberMatchReadyByUserId.get(friend.user_id) ? 'ready' : 'needs_setup'
  }
  if (friend.group_status === 'invited') {
    return 'needs_setup'
  }
  return 'needs_setup'
}

export function getFriendMatchLabel(
  friend: FriendSummary,
  memberMatchReadyByUserId: Map<string, boolean>,
): string {
  if (friend.group_status === 'in_group') {
    return getFriendMatchState(friend, memberMatchReadyByUserId) === 'ready'
      ? '준비 완료'
      : '준비 필요'
  }
  if (friend.group_status === 'invited') {
    return '수락 대기'
  }
  return '초대 가능'
}

export function getGroupExitActionState({
  isLeader,
  groupStatus,
  activeMemberCount,
  capacity,
  transferableMemberCount,
}: {
  isLeader: boolean
  groupStatus: GroupStatus
  activeMemberCount: number
  capacity: number
  transferableMemberCount: number
}): GroupExitActionState {
  if (!canLeaveWhileGroupStatus(groupStatus)) {
    return {
      kind: 'locked',
      title: '지금은 그룹을 바꿀 수 없어요',
      description: '매칭이 이미 진행 중이거나 완료된 그룹은 임의로 나가거나 해체할 수 없어요.',
      primaryLabel: '진행 중',
      helperText: '문제가 생기면 매칭 취소나 관리자 확인 흐름으로 처리해야 해요.',
    }
  }

  if (!isLeader) {
    const missingAfterLeave = Math.max(0, capacity - Math.max(0, activeMemberCount - 1))
    return {
      kind: 'member_can_leave',
      title: '이 그룹에서 나갈 수 있어요',
      description: `나가면 이 그룹의 매칭 준비에서 빠지고, 남은 그룹은 다시 친구를 초대해야 해요. 현재 기준으로 ${missingAfterLeave}명이 더 필요해요.`,
      primaryLabel: '그룹 나가기',
      helperText: '나간 뒤에는 새 그룹을 만들거나 다른 초대를 받을 수 있어요.',
    }
  }

  if (transferableMemberCount > 0) {
    return {
      kind: 'leader_needs_transfer',
      title: '리더는 바로 나갈 수 없어요',
      description: '먼저 리더를 넘기거나 그룹을 해체해야 해요. 리더가 사라지면 초대와 큐 상태가 꼬일 수 있어요.',
      primaryLabel: '리더 위임하기',
      helperText: '위임하면 본인은 일반 멤버가 되고, 그다음 그룹 나가기가 가능해요.',
    }
  }

  return {
    kind: 'leader_can_disband',
    title: '아직 혼자 있는 그룹이에요',
    description: '초대된 친구가 없다면 그룹을 해체하고 다시 만들 수 있어요.',
    primaryLabel: '그룹 해체',
    helperText: '해체하면 현재 그룹 준비 상태가 종료돼요.',
  }
}

function canLeaveWhileGroupStatus(status: GroupStatus) {
  return status === 'forming' || status === 'ready'
}
