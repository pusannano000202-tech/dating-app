import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import MeetupExplore from '@/components/meetups/MeetupExplore'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'

export default async function MeetupExplorePage({ searchParams }: {
  searchParams: Promise<{ intent?: string | string[]; group?: string | string[] }>
}) {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="meetups" />
  const { intent, group } = await searchParams
  if (intent === 'achieve' && group === 'major-foundation') redirect('/meetups/department/courses')
  return <Suspense fallback={<main className="px-5 py-10" role="status">활동을 불러오는 중이에요.</main>}><MeetupExplore intent={intent === 'achieve' ? 'achieve' : 'play'} /></Suspense>
}
