import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import DepartmentChallengeDiscovery from '@/components/meetups/DepartmentChallengeDiscovery'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default function MeetupChallengesPage() {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  return <DepartmentChallengeDiscovery />
}
