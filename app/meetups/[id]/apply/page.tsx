import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import MeetupApplicationExperience from '@/components/meetups/MeetupApplicationExperience'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default async function MeetupApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  const { id } = await params
  return <MeetupApplicationExperience meetupId={id} />
}
