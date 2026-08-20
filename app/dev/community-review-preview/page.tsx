import { notFound } from 'next/navigation'

import CommunityBoard, { type ReviewableMeetup } from '@/components/community/CommunityBoard'
import { getCommunityCategory } from '@/lib/community/catalog'

const previewReviewableMeetups: ReviewableMeetup[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: '금강로 저녁 러닝',
    category: 'running',
    place_name: '부산대역 3번 출구',
    scheduled_at: '2026-08-08T11:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: '북문 배드민턴',
    category: 'badminton',
    place_name: '금정초 체육관',
    scheduled_at: '2026-08-07T10:30:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    title: '장전동 보드게임',
    category: 'board_game',
    place_name: '장전역 보드게임카페',
    scheduled_at: '2026-08-06T10:00:00.000Z',
  },
]

export default function CommunityReviewPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  const board = getCommunityCategory('meetup-review')
  if (!board) notFound()

  return <CommunityBoard board={board} previewReviewableMeetups={previewReviewableMeetups} />
}
