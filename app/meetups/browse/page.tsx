import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import MeetupHub from '@/components/meetups/MeetupHub'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default function BrowseMeetupsPage() {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  return <MeetupHub compact />
}
