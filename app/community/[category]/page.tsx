import { notFound } from 'next/navigation'

import CommunityBoard from '@/components/community/CommunityBoard'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import { getCommunityCategory } from '@/lib/community/catalog'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default async function CommunityCategoryPage(props: { params: Promise<{ category: string }> }) {
  const params = await props.params;
  if (!isCommunityFeatureEnabled()) {
    return <CommunityComingSoon kind="community" />
  }

  const board = getCommunityCategory(params.category)
  if (!board) notFound()

  return <CommunityBoard board={board} />
}
