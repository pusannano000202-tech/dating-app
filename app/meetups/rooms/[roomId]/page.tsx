import { notFound } from 'next/navigation'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import ActivityRoomChat from '@/components/meetups/ActivityRoomChat'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import { isActivityRoomId } from '@/lib/meetups/activity-room-contract'
export default async function ActivityRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  const { roomId } = await params
  if (!isActivityRoomId(roomId)) notFound()
  return <ActivityRoomChat roomId={roomId} />
}
