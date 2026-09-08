import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import MbtiHub from '@/components/community/mbti/MbtiHub'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default function CommunityMbtiPage() {
  if (!isCommunityFeatureEnabled()) return <CommunityComingSoon kind="community" />
  return <main className="min-h-screen bg-boot-canvas text-boot-ink"><MbtiHub /></main>
}
