import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import HotCommunityBoard from '@/components/community/HotCommunityBoard'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default function HotCommunityPage() {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="community" />
  return <HotCommunityBoard />
}
