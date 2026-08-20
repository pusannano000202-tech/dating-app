import { notFound } from 'next/navigation'

import AppearanceScoreGate from '@/components/matching/AppearanceScoreGate'

export default function AppearanceScoreGatePreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  return (
    <AppearanceScoreGate
      eventTitle="오늘 밤 온천장 조깅"
      eventMeta="오늘 20:30 · 온천장 산책로"
      initialPhotoIssueCode="photo_no_face"
    />
  )
}
