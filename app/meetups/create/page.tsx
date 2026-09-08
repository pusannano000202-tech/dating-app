import { Suspense } from 'react'

import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import CreateMeetupForm from '@/components/meetups/CreateMeetupForm'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default function CreateMeetupPage() {
  if (!isCommunityFeatureEnabled()) {
    return <CommunityComingSoon kind="meetups" />
  }

  return (
    <Suspense fallback={<main className="min-h-screen bg-boot-canvas" />}>
      <CreateMeetupForm />
    </Suspense>
  )
}
