import { notFound } from 'next/navigation'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import ActivityRoomLobby from '@/components/meetups/ActivityRoomLobby'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import { getActivityRoomDefinition } from '@/lib/meetups/activity-room-contract'
import { isMeetupGenderMode } from '@/lib/community/meetup-gender'

export default async function ActivityRoomsPage({ params, searchParams }: {
  params: Promise<{ activityKey: string }>
  searchParams: Promise<{ gender_mode?: string }>
}) {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  const { activityKey } = await params
  const { gender_mode = 'all' } = await searchParams
  if (!getActivityRoomDefinition(activityKey) || !isMeetupGenderMode(gender_mode)) notFound()
  return <ActivityRoomLobby activityKey={activityKey} genderMode={gender_mode} />
}
