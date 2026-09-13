import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import MbtiHub from '@/components/community/mbti/MbtiHub'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default async function CommunityMbtiPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="community" />
  return <main className="min-h-screen bg-boot-canvas text-boot-ink"><MbtiHub key={view === 'manage' ? 'manage' : 'self'} initialView={view === 'manage' ? 'manage' : 'self'} /></main>
}
