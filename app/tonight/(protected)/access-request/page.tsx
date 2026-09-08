import type { Metadata } from 'next'

import TonightMarketAccessRequest from '@/components/tonight/TonightMarketAccessRequest'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function TonightAccessRequestPage() {
  return <TonightMarketAccessRequest />
}
