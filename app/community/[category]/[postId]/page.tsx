import { notFound } from 'next/navigation'

import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import CommunityPostDetail from '@/components/community/CommunityPostDetail'
import { getCommunityCategory } from '@/lib/community/catalog'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

export default async function CommunityPostPage(
  props: {
    params: Promise<{ category: string; postId: string }>
  }
) {
  const params = await props.params;
  if (!isCommunityFeatureEnabled()) {
    return <CommunityComingSoon kind="community" />
  }

  const board = getCommunityCategory(params.category)
  if (!board) notFound()

  return <CommunityPostDetail board={board} postId={params.postId} />
}
