import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import MeetupDetailExperience from '@/components/meetups/MeetupDetailExperience'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default async function MeetupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  const { id } = await params
  return <MeetupDetailExperience meetupId={id} />
}

