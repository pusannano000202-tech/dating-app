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
