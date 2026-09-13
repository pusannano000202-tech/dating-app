import { notFound } from 'next/navigation'
import ContentJourneyPreview from '@/components/qa/ContentJourneyPreview'
export const metadata = { robots: { index: false, follow: false } }

export default function ContentJourneyPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ContentJourneyPreview/>
}
