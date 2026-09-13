import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import MeetupDetailExperience from '@/components/meetups/MeetupDetailExperience'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default async function MeetupDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string | string[] }> }) {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  const { id } = await params
  const query = await searchParams
  return <MeetupDetailExperience meetupId={id} created={query.created === '1'} />
}
