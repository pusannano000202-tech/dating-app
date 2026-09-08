import DeliveryWorldcup from '@/components/campus-eats/DeliveryWorldcup'
import { notFound } from 'next/navigation'
import { isCampusEatsFeatureEnabled } from '@/lib/community-feature'

export default function DeliveryWorldcupPage() {
  if (!isCampusEatsFeatureEnabled()) notFound()
  return <DeliveryWorldcup />
}
