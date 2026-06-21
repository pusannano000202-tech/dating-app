import type { FriendSummary, GroupRecord, MatchStepState } from './types'

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
    return missingMembers === 1 ? '친구 1명이 더 필요해요' : `친구 ${missingMembers}명이 더 필요해요`
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
