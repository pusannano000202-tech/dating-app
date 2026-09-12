import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import DepartmentMeetupDiscovery from '@/components/meetups/DepartmentMeetupDiscovery'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default function DepartmentSocialPage() {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  return <DepartmentMeetupDiscovery mode="social" />
}
