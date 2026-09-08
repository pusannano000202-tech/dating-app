export interface CommunityFeaturePolicyInput {
  nodeEnv?: string
  communityEnabled?: string
}

export function isCommunityFeatureEnabled(
  input: CommunityFeaturePolicyInput = {},
): boolean {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV
  const communityEnabled = input.communityEnabled ?? process.env.NEXT_PUBLIC_COMMUNITY_ENABLED

  return nodeEnv === 'development' || communityEnabled === 'true'
}

export function isCampusEatsFeatureEnabled(input: CommunityFeaturePolicyInput & { campusEatsEnabled?: string } = {}): boolean {
  if ((input.nodeEnv ?? process.env.NODE_ENV) !== 'production') return true
  return (input.communityEnabled ?? process.env.NEXT_PUBLIC_COMMUNITY_ENABLED) === 'true'
    && (input.campusEatsEnabled ?? process.env.NEXT_PUBLIC_CAMPUS_EATS_ENABLED) === 'true'
}
