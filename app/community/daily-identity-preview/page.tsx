import { notFound } from 'next/navigation'

import { DailyIdentityExamplesPreview } from '@/components/daily-identity/DailyIdentityExamplesPreview'

export default function DailyIdentityPreviewPage() {
  if (process.env.NODE_ENV !== 'development'
    || process.env.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui') notFound()

  return <DailyIdentityExamplesPreview />
}
