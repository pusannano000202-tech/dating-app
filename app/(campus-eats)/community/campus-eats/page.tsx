import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import CampusEatsEntry from '@/components/campus-eats/CampusEatsEntry'
import { isCampusEatsFeatureEnabled } from '@/lib/community-feature'

export default function CampusEatsPage() {
  if (!isCampusEatsFeatureEnabled()) notFound()

  return (
    <Suspense fallback={null}>
      <CampusEatsEntry />
    </Suspense>
  )
}
