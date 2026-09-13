import { notFound } from 'next/navigation'

import CommunityBoard from '@/components/community/CommunityBoard'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import { getCommunityCategory } from '@/lib/community/catalog'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'
import { storyDraft } from '@/lib/community/story-prompts'

export default async function CommunityCategoryPage(props: { params: Promise<{ category: string }>; searchParams: Promise<{ starter?: string | string[] }> }) {
  const params = await props.params;
  if (!isCommunityFeatureEnabled()) {
    return <CommunityComingSoon kind="community" />
  }

  const board = getCommunityCategory(params.category)
  if (!board) notFound()

  const search = await props.searchParams
  return <CommunityBoard key={`${board.id}:${typeof search.starter === 'string' ? search.starter : ''}`} board={board} initialDraft={storyDraft(board.id, search.starter)} />
}
