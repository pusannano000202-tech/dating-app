import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import MeetupHub from '@/components/meetups/MeetupHub'
import MeetupPortal from '@/components/meetups/MeetupPortal'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import { hasLegacyMeetupQuery } from '@/lib/meetups/discovery-navigation'

export default async function MeetupsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!isCommunityFeatureEnabled()) {
    return <CommunityComingSoon kind="meetups" />
  }

  // Keep saved links, creation results and existing activity-room return links
  // working while the unfiltered entry becomes the new discovery portal.
  return hasLegacyMeetupQuery(await searchParams) ? <MeetupHub /> : <MeetupPortal />
}
