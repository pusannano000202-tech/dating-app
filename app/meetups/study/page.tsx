import { Suspense } from 'react'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import StudyRoomExperience from '@/components/meetups/StudyRoomExperience'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default function StudyMeetupPage() {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  return <Suspense fallback={<main className="px-5 py-10" role="status">스터디를 준비하고 있어요.</main>}><StudyRoomExperience /></Suspense>
}
