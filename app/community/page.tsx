import CommunityPortal from '@/components/community/CommunityPortal'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default function CommunityPage() {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="community" />
  return <CommunityPortal />
}
