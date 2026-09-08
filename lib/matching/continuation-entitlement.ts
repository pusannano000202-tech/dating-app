export function canIssueFriendRequestEntitlement(input: {
  requesterPresent: boolean
  targetPresent: boolean
  feePurpose: 'next_occurrence' | 'friend_request'
  feeStatus: 'unpaid' | 'pending' | 'verified' | 'recovery_required'
  alreadyFriends: boolean
}) {
  return input.requesterPresent
    && input.targetPresent
    && input.feePurpose === 'friend_request'
    && input.feeStatus === 'verified'
    && !input.alreadyFriends
}

