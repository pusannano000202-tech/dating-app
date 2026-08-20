import { notFound } from 'next/navigation'

import CommunityPostDetail from '@/components/community/CommunityPostDetail'
import { getCommunityCategory } from '@/lib/community/catalog'

export default function CommunityPostPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  const board = getCommunityCategory('relationship-advice')
  if (!board) notFound()

  return <CommunityPostDetail board={board} postId="preview-post" devPreview />
}
